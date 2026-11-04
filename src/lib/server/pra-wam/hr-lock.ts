import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { adminAuthConfig, SESSION_COOKIE, verifySession } from "@/lib/admin-token";
import {
  HR_ACCESS_MAX, HR_ACCESS_MIGRATION, HR_LOCKOUT_MINUTES, HR_MAX_FAILURES, HR_NO_ACCESS, HR_UNLOCK_MINUTES, normalEmail,
} from "@/lib/pra-wam/hr-access";
import { answered, hrOnly, type AnswerValue, type QuestionKind, type Visibility } from "@/lib/pra-wam/questionnaire";
import { clientInfo, requireApiAdmin } from "../admin-session";
import { rateLimitSecret, ServiceError } from "../config";
import { databaseError, enforceRateLimit } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";
import { formContent, hrAccessMissing, questionnaireMissing, questionnaireWaiting } from "./questionnaire";
import { notMigrated } from "./session";

/*
 * The HR lock on the questionnaire's most private answers (visibility `hr` and `hronly`), on top
 * of the admin sign-in. Data HR opens with the WAM email of a person on the form's HR access list
 * (cq_forms.hr_access, kept by the super admin): an active employee with an active WAM account.
 * The email alone is the key, by the owner's choice, so every unlock and every read after it is
 * logged under that person. An unlock gives this browser a separate signed cookie for 30 minutes
 * that names the person and is bound to the admin session cookie (it dies with it); taking the
 * person off the list, or switching their account off, ends it at once. Every HR data read checks
 * the admin session and that cookie, here on the server.
 */

export const HR_COOKIE = "wk_hr";
export const HR_COOKIE_TTL_SECONDS = HR_UNLOCK_MINUTES * 60;

/* ---- The unlock cookie (pure) --------------------------------------------------------------- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
function tokenSignature(secret: string, expires: number, adminToken: string, employeeId: string) {
  return createHmac("sha256", `${secret}\0hr-unlock`).update(`hr\0v2\0${expires}\0${sha256(adminToken)}\0${employeeId}`).digest("hex");
}

/** `v2.<expires>.<employee id>.<hmac>`: valid for 30 minutes, for this admin session and this person only. */
export function signHrToken(secret: string, adminToken: string, employeeId: string, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + HR_COOKIE_TTL_SECONDS;
  return `v2.${expires}.${employeeId}.${tokenSignature(secret, expires, adminToken, employeeId)}`;
}

/** Who unlocked and when it ends (ms), or null when the token is missing, expired, forged or bound to another session. */
export function verifyHrToken(secret: string, token: string | undefined, adminToken: string | undefined, now = Date.now()): { employeeId: string; expires: number } | null {
  if (!token || !adminToken) return null;
  const match = /^v2\.(\d{1,12})\.([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(token);
  if (!match || !UUID.test(match[2])) return null;
  const expires = Number(match[1]);
  if (expires * 1000 <= now || expires * 1000 > now + HR_COOKIE_TTL_SECONDS * 1000) return null;
  const expected = Buffer.from(tokenSignature(secret, expires, adminToken, match[2]), "hex");
  return timingSafeEqual(Buffer.from(match[3], "hex"), expected) ? { employeeId: match[2], expires: expires * 1000 } : null;
}

/* ---- Too many failed tries (pure) ----------------------------------------------------------- */

export type LockEvent = { action: string; created_at: string };
export type LockState = { lockedUntil: string | null; attemptsLeft: number };

/**
 * Five failed tries within 15 minutes pause unlocking for 15 minutes after the last one. Counted
 * twice: per network (IP) and per email that belongs to an employee. A successful unlock starts
 * that count again. `events` are the recent `buka`/`gagal` rows of one count, any order.
 */
export function lockStateOf(events: LockEvent[], now = Date.now()): LockState {
  const sorted = events.map(event => ({ action: event.action, at: Date.parse(event.created_at) })).filter(event => Number.isFinite(event.at)).sort((a, b) => b.at - a.at);
  const opened = sorted.findIndex(event => event.action === "buka");
  const sinceOpen = (opened === -1 ? sorted : sorted.slice(0, opened)).filter(event => event.action === "gagal");
  const window = HR_LOCKOUT_MINUTES * 60_000;
  const newest = sinceOpen[0]?.at;
  if (newest !== undefined) {
    const burst = sinceOpen.filter(event => event.at > newest - window).length;
    if (burst >= HR_MAX_FAILURES && newest + window > now) return { lockedUntil: new Date(newest + window).toISOString(), attemptsLeft: 0 };
  }
  const recent = sinceOpen.filter(event => event.at > now - window).length;
  return { lockedUntil: null, attemptsLeft: Math.max(1, HR_MAX_FAILURES - recent) };
}

/** The stricter of several counts: locked when any is, until the latest. */
export function combineLocks(...states: LockState[]): LockState {
  const until = states.map(state => state.lockedUntil).filter((value): value is string => !!value).sort().at(-1) ?? null;
  return until ? { lockedUntil: until, attemptsLeft: 0 } : { lockedUntil: null, attemptsLeft: Math.min(HR_MAX_FAILURES, ...states.map(state => state.attemptsLeft)) };
}

const minutesLeft = (until: string, now = Date.now()) => Math.max(1, Math.ceil((Date.parse(until) - now) / 60_000));
export const lockedMessage = (until: string, now = Date.now()) =>
  `Terlalu banyak percobaan yang gagal. Data HR dikunci sementara; coba lagi dalam ${minutesLeft(until, now)} menit.`;

/* ---- Database ------------------------------------------------------------------------------- */

export type HrAction = "buka" | "gagal" | "kunci" | "lihat" | "ekspor" | "ganti_password" | "ubah_akses";
/** `access` is null before migration 202611040012 (no list, so nobody can open Data HR). */
type HrForm = { id: string; access: string[] | null; updatedAt: string };

export const hrAccessWaiting = () => new ServiceError(503, `Akses Data HR menunggu migrasi ${HR_ACCESS_MIGRATION}.`);

/** The form's id and HR access list; null before the questionnaire migration. */
async function hrForm(): Promise<HrForm | null> {
  const read = (columns: string) => createPrivilegedClient().from("cq_forms").select(columns).order("created_at").limit(1).maybeSingle();
  let { data, error } = await read("id,updated_at,hr_access");
  if (error && hrAccessMissing(error)) ({ data, error } = await read("id,updated_at"));
  if (error) { if (questionnaireMissing(error)) return null; databaseError(error); }
  const row = data as unknown as { id: string; updated_at: string; hr_access?: string[] | null } | null;
  return row ? { id: row.id, updatedAt: row.updated_at, access: row.hr_access === undefined ? null : row.hr_access ?? [] } : null;
}
async function requireForm(): Promise<HrForm & { access: string[] }> {
  const form = await hrForm();
  if (!form) throw questionnaireWaiting();
  if (!form.access) throw hrAccessWaiting();
  return { ...form, access: form.access };
}

type LogPeople = { subject?: string | null; actor?: string | null };

/** One log row; failing to log fails the action, so nothing opens unrecorded. */
async function logHr(formId: string, action: HrAction, request: Request | null, { subject = null, actor = null }: LogPeople = {}) {
  const client = request ? clientInfo(request) : null;
  const { error } = await createPrivilegedClient().from("cq_hr_access_log").insert({
    form_id: formId, action, subject_employee_id: subject, actor_employee_id: actor, ip: client?.ip ?? null, user_agent: client?.userAgent?.slice(0, 300) ?? null,
  });
  if (error) { if (hrAccessMissing(error) || /actor_employee_id|ubah_akses/.test(error.message ?? "")) throw hrAccessWaiting(); if (questionnaireMissing(error)) throw questionnaireWaiting(); databaseError(error); }
}

/** The recent unlock tries of one count: from this network, or under this person's email. */
async function recentTries(formId: string, by: { ip: string | null } | { actor: string }): Promise<LockEvent[]> {
  const since = new Date(Date.now() - 2 * HR_LOCKOUT_MINUTES * 60_000).toISOString();
  let query = createPrivilegedClient().from("cq_hr_access_log").select("action,created_at")
    .eq("form_id", formId).in("action", ["buka", "gagal"]).gte("created_at", since);
  query = "actor" in by ? query.eq("actor_employee_id", by.actor) : by.ip ? query.eq("ip", by.ip) : query.is("ip", null);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(50);
  if (error) { if (hrAccessMissing(error) || /actor_employee_id/.test(error.message ?? "")) throw hrAccessWaiting(); if (questionnaireMissing(error)) throw questionnaireWaiting(); databaseError(error); }
  return (data ?? []) as LockEvent[];
}

async function lockState(formId: string, ip: string | null, actor: string | null): Promise<LockState> {
  const [network, person] = await Promise.all([recentTries(formId, { ip }), actor ? recentTries(formId, { actor }) : Promise.resolve([])]);
  return combineLocks(lockStateOf(network), lockStateOf(person));
}

/** The admin's network as the log records it, for pages (which have no Request). */
async function pageIp(): Promise<string | null> {
  return clientInfo(new Request("https://journey.invalid/", { headers: new Headers(await headers()) })).ip;
}

/** Rate limit per typed email, like enforceRateLimit per network: the same for every email, known or not. */
async function enforceEmailLimit(email: string, limit: number) {
  const key = createHmac("sha256", rateLimitSecret()).update(`wam-hr-unlock-email\0${email}`).digest("hex");
  const { data, error } = await createPrivilegedClient().rpc("consume_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: 600 });
  if (error) databaseError(error);
  if (!data) throw new ServiceError(429, "Terlalu banyak percobaan untuk email ini. Tunggu sepuluh menit sebelum mencoba kembali.");
}

/* ---- People: who can be on the list --------------------------------------------------------- */

export type HrAccessPerson = { id: string; name: string; department: string; email: string; canOpen: boolean };

/** Data karyawan with WAM accounts: `canOpen` = an active employee with an active WAM account. */
async function directory(): Promise<HrAccessPerson[]> {
  const client = createPrivilegedClient();
  const [{ data: people, error: peopleError }, { data: accounts, error }] = await Promise.all([
    client.from("employees").select("id,full_name,department,email,active").order("full_name").limit(2000),
    client.from("pw_accounts").select("employee_id,active"),
  ]);
  if (peopleError) databaseError(peopleError);
  // Before the Pra WAM migration there are no accounts, so nobody can open.
  if (error && !notMigrated(error)) databaseError(error);
  const activeAccount = new Set((accounts ?? []).filter(account => account.active).map(account => account.employee_id as string));
  return (people ?? []).map(person => ({
    id: person.id as string, name: person.full_name as string, department: (person.department as string) ?? "", email: (person.email as string) ?? "",
    canOpen: !!person.active && activeAccount.has(person.id as string),
  }));
}

/** The one employee with this email (trimmed, any case), or null; never a guess between two. */
async function employeeByEmail(email: string): Promise<HrAccessPerson | null> {
  const address = normalEmail(email);
  if (!address) return null;
  const found = (await directory()).filter(person => normalEmail(person.email) === address);
  return found.length === 1 ? found[0] : null;
}

/* ---- Unlocking and locking ------------------------------------------------------------------ */

/**
 * The WAM email of a person on the HR access list unlocks this browser for 30 minutes. An unknown
 * email and a person not on the list get the same answer and are both logged as `gagal` (under the
 * person when the email is an employee's). Returns when it locks again (ISO) and who opened it.
 */
export async function unlockHr(request: Request, email: string): Promise<{ expiresAt: string; name: string }> {
  const config = adminAuthConfig();
  const store = await cookies();
  const adminToken = store.get(SESSION_COOKIE)?.value;
  if (!config || !adminToken || !verifySession(config, adminToken)) throw new ServiceError(401, "Sesi berakhir. Masuk kembali sebelum melanjutkan.");
  const form = await requireForm();
  const address = normalEmail(email);
  await enforceRateLimit(request, "wam-hr-unlock", 10);
  await enforceEmailLimit(address, 10);
  const person = await employeeByEmail(address);
  const state = await lockState(form.id, clientInfo(request).ip, person?.id ?? null);
  if (state.lockedUntil) throw new ServiceError(429, lockedMessage(state.lockedUntil));
  if (!person || !person.canOpen || !form.access.includes(person.id)) {
    await logHr(form.id, "gagal", request, { actor: person?.id ?? null });
    const left = state.attemptsLeft - 1;
    if (left <= 0) throw new ServiceError(429, `${HR_NO_ACCESS} Data HR dikunci ${HR_LOCKOUT_MINUTES} menit karena terlalu banyak percobaan.`);
    const text = `${HR_NO_ACCESS} Sisa ${left} percobaan sebelum dikunci ${HR_LOCKOUT_MINUTES} menit.`;
    throw new ServiceError(403, text, { email: [text] });
  }
  await logHr(form.id, "buka", request, { actor: person.id });
  store.set(HR_COOKIE, signHrToken(config.secret, adminToken, person.id), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: HR_COOKIE_TTL_SECONDS });
  return { expiresAt: new Date(Date.now() + HR_COOKIE_TTL_SECONDS * 1000).toISOString(), name: person.name };
}

async function clearCookie() { (await cookies()).delete(HR_COOKIE); }

/** "Kunci sekarang": the cookie goes, and it is logged under the person when it was open. */
export async function lockHr(request: Request) {
  const unlocked = await hrUnlocked();
  await clearCookie();
  if (unlocked) await logHr(unlocked.formId, "kunci", request, { actor: unlocked.actor.id });
}

export type HrUnlock = { formId: string; expiresAt: string; actor: { id: string; name: string } };

/** For pages (after requireAdminPage): the unlock this browser holds, or null. Never throws for a locked state. */
export async function hrUnlocked(): Promise<HrUnlock | null> {
  const config = adminAuthConfig();
  if (!config) return null;
  const store = await cookies();
  const adminToken = store.get(SESSION_COOKIE)?.value;
  const token = store.get(HR_COOKIE)?.value;
  if (!token || !adminToken || !verifySession(config, adminToken)) return null;
  const unlock = verifyHrToken(config.secret, token, adminToken);
  if (!unlock) return null;
  const form = await hrForm();
  // Taken off the list meanwhile: the unlock ends at once.
  if (!form?.access?.includes(unlock.employeeId)) return null;
  const person = (await directory()).find(item => item.id === unlock.employeeId);
  if (!person?.canOpen) return null;
  return { formId: form.id, expiresAt: new Date(unlock.expires).toISOString(), actor: { id: person.id, name: person.name } };
}

/** For APIs: the admin session and the HR unlock, or a 401/403 in plain words. */
export async function requireHrUnlocked(): Promise<HrUnlock> {
  await requireApiAdmin();
  const unlocked = await hrUnlocked();
  if (unlocked) return unlocked;
  const form = await hrForm();
  if (!form) throw questionnaireWaiting();
  if (!form.access) throw hrAccessWaiting();
  throw new ServiceError(403, "Data HR terkunci. Buka dulu dengan email WAM yang punya akses di halaman Data HR.");
}

/**
 * GETs carry no Origin header, so checkOrigin does not fit them; a browser still says where a
 * request came from, and HR data is read only by this site's own pages.
 */
export function sameOriginRead(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new ServiceError(403, "Permintaan harus berasal dari situs ini.");
}

/** `checkedAt` is the server's clock, so the page's countdowns render the same before and after hydration. */
export type HrPageState = { migrated: boolean; accessReady: boolean; hasAccess: boolean; unlocked: HrUnlock | null; checkedAt: number } & LockState;

/** What the Data HR page needs to choose between the waiting notes, the lock screen and the data. */
export async function hrPageState(): Promise<HrPageState> {
  const checkedAt = Date.now();
  const open = { lockedUntil: null, attemptsLeft: HR_MAX_FAILURES };
  const form = await hrForm();
  if (!form) return { migrated: false, accessReady: false, hasAccess: false, unlocked: null, ...open, checkedAt };
  if (!form.access) return { migrated: true, accessReady: false, hasAccess: false, unlocked: null, ...open, checkedAt };
  const hasAccess = form.access.length > 0;
  const unlocked = hasAccess ? await hrUnlocked() : null;
  const lock = hasAccess && !unlocked ? combineLocks(lockStateOf(await recentTries(form.id, { ip: await pageIp() }))) : open;
  return { migrated: true, accessReady: true, hasAccess, unlocked, ...lock, checkedAt };
}

/* ---- The access list (Pengaturan; changes by the super admin, the route checks the role) ----- */

export type HrAccessSettings = { migrated: boolean; ready: boolean; people: HrAccessPerson[]; candidates: HrAccessPerson[] };

/**
 * The people on the list (name, department, email, and whether they can open now), and, for the
 * super admin's picker, everyone else who could be added: active employees with a WAM account.
 */
export async function hrAccessSettings({ withCandidates }: { withCandidates: boolean }): Promise<HrAccessSettings> {
  const form = await hrForm();
  if (!form) return { migrated: false, ready: false, people: [], candidates: [] };
  if (!form.access) return { migrated: true, ready: false, people: [], candidates: [] };
  const all = await directory();
  const byId = new Map(all.map(person => [person.id, person]));
  const people = form.access.map(id => byId.get(id) ?? { id, name: "Karyawan tidak ditemukan", department: "", email: "", canOpen: false });
  const candidates = withCandidates ? all.filter(person => person.canOpen && !form.access!.includes(person.id)) : [];
  return { migrated: true, ready: true, people, candidates };
}

/** Adds or removes one person; logged as `ubah_akses` with that person (no actor: the super admin). */
export async function changeHrAccess(request: Request, employeeId: string, change: "add" | "remove"): Promise<HrAccessPerson[]> {
  const form = await requireForm();
  const all = await directory();
  const person = all.find(item => item.id === employeeId);
  let next = form.access;
  if (change === "add") {
    if (!person) throw new ServiceError(404, "Karyawan tidak ditemukan.");
    if (!person.canOpen) throw new ServiceError(422, `${person.name} belum punya akun WAM yang aktif, jadi belum bisa membuka Data HR.`);
    if (!form.access.includes(employeeId)) {
      if (form.access.length >= HR_ACCESS_MAX) throw new ServiceError(422, `Akses Data HR paling banyak ${HR_ACCESS_MAX} orang.`);
      next = [...form.access, employeeId];
    }
  } else if (form.access.includes(employeeId)) next = form.access.filter(id => id !== employeeId);
  if (next !== form.access) {
    const { data, error } = await createPrivilegedClient().from("cq_forms").update({ hr_access: next, updated_at: new Date().toISOString() })
      .eq("id", form.id).eq("updated_at", form.updatedAt).select("id");
    if (error) { if (hrAccessMissing(error)) throw hrAccessWaiting(); databaseError(error); }
    if (!data?.length) throw new ServiceError(409, "Pengaturan kuesioner baru saja diubah di tempat lain. Muat ulang halaman lalu coba lagi.");
    await logHr(form.id, "ubah_akses", request, { subject: employeeId });
  }
  const byId = new Map(all.map(item => [item.id, item]));
  return next.map(id => byId.get(id) ?? { id, name: "Karyawan tidak ditemukan", department: "", email: "", canOpen: false });
}

/* ---- Reading HR data (call only after requireHrUnlocked / hrUnlocked) ----------------------- */

type HrQuestion = { id: string; key: string; prompt: string; kind: QuestionKind; visibility: Visibility; sectionId: string; sort: number; hidden: boolean };

async function hrQuestions(formId: string): Promise<HrQuestion[]> {
  const { questions } = await formContent(formId);
  return questions.filter(question => hrOnly(question.visibility))
    .map(({ id, key, prompt, kind, visibility, sectionId, sort, hidden }) => ({ id, key, prompt, kind, visibility, sectionId, sort, hidden }));
}

export type HrPersonRow = { id: string; name: string; department: string; answered: number };

/** Everyone with at least one answered HR question, A to Z, with how many. No answers leave here. */
export async function hrPeople(unlock: HrUnlock): Promise<{ people: HrPersonRow[]; questions: number }> {
  const questions = await hrQuestions(unlock.formId);
  if (!questions.length) return { people: [], questions: 0 };
  const client = createPrivilegedClient();
  const counts = new Map<string, number>();
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await client.from("cq_answers").select("employee_id,value").eq("form_id", unlock.formId)
      .in("question_id", questions.map(question => question.id)).order("employee_id").order("question_id").range(from, from + page - 1);
    if (error) { if (questionnaireMissing(error)) throw questionnaireWaiting(); databaseError(error); }
    for (const row of data ?? []) if (answered(row.value as AnswerValue)) counts.set(row.employee_id, (counts.get(row.employee_id) ?? 0) + 1);
    if ((data?.length ?? 0) < page) break;
  }
  const byId = new Map((await listPeople()).map(person => [person.id, person]));
  const people = [...counts].map(([id, count]) => ({ id, name: byId.get(id)?.name ?? "Tanpa nama", department: byId.get(id)?.department ?? "", answered: count }))
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
  return { people, questions: questions.length };
}

export type HrAnswer = { key: string; prompt: string; visibility: "hr" | "hronly"; hidden: boolean; lines: string[]; updatedAt: string };
export type HrPersonDetail = {
  person: { id: string; name: string; department: string };
  sections: { id: string; title: string; answers: HrAnswer[] }[];
};

/** An answer as lines of text: choices one per line, people by name, a matrix as "row: choice". */
export function answerLines(kind: QuestionKind, value: AnswerValue, names: Map<string, string>): string[] {
  if (typeof value === "boolean") return [value ? "Setuju" : "Belum setuju"];
  if (typeof value === "string") return value.trim() ? [kind === "person" ? names.get(value) ?? "Tanpa nama" : value] : [];
  if (Array.isArray(value)) return value.map(item => (kind === "person" ? names.get(item) ?? "Tanpa nama" : item));
  return Object.entries(value).map(([row, choice]) => `${row}: ${choice}`);
}

/** One person's HR answers by section. Logged as `lihat` (with who looked) first: no log, no data. */
export async function hrPerson(unlock: HrUnlock, employeeId: string, request: Request | null): Promise<HrPersonDetail> {
  const people = await listPeople();
  const person = people.find(item => item.id === employeeId);
  if (!person) throw new ServiceError(404, "Karyawan tidak ditemukan.");
  await logHr(unlock.formId, "lihat", request, { subject: employeeId, actor: unlock.actor.id });
  const [questions, { sections }] = await Promise.all([hrQuestions(unlock.formId), formContent(unlock.formId)]);
  const { data, error } = questions.length
    ? await createPrivilegedClient().from("cq_answers").select("question_id,value,updated_at").eq("form_id", unlock.formId).eq("employee_id", employeeId).in("question_id", questions.map(question => question.id))
    : { data: [], error: null };
  if (error) { if (questionnaireMissing(error)) throw questionnaireWaiting(); databaseError(error); }
  const names = new Map(people.map(item => [item.id, item.name]));
  const byQuestion = new Map((data ?? []).map(row => [row.question_id as string, row as { value: AnswerValue; updated_at: string }]));
  const ordered = [...sections].sort((a, b) => a.sort - b.sort);
  return {
    person: { id: person.id, name: person.name, department: person.department },
    sections: ordered.map(section => ({
      id: section.id, title: section.title,
      answers: questions.filter(question => question.sectionId === section.id).sort((a, b) => a.sort - b.sort).flatMap(question => {
        const row = byQuestion.get(question.id);
        if (!row || !answered(row.value)) return [];
        return [{ key: question.key, prompt: question.prompt, visibility: question.visibility as "hr" | "hronly", hidden: question.hidden, lines: answerLines(question.kind, row.value, names), updatedAt: row.updated_at }];
      }),
    })).filter(section => section.answers.length),
  };
}

/** `actor`: who did it (by name), null for an unknown email or a super admin's access change. */
export type HrLogRow = { id: string; action: HrAction; subject: string | null; actor: string | null; ip: string | null; userAgent: string | null; createdAt: string };

/** The latest 50 HR access log rows, newest first, people by name. */
export async function hrAccessLog(unlock: HrUnlock): Promise<HrLogRow[]> {
  const { data, error } = await createPrivilegedClient().from("cq_hr_access_log").select("id,action,subject_employee_id,actor_employee_id,ip,user_agent,created_at")
    .eq("form_id", unlock.formId).order("created_at", { ascending: false }).limit(50);
  if (error) { if (/actor_employee_id/.test(error.message ?? "")) throw hrAccessWaiting(); if (questionnaireMissing(error)) throw questionnaireWaiting(); databaseError(error); }
  const rows = data ?? [];
  const names = rows.some(row => row.subject_employee_id || row.actor_employee_id) ? new Map((await listPeople()).map(person => [person.id, person.name])) : new Map<string, string>();
  const nameOf = (id: string | null) => (id ? names.get(id) ?? "Tanpa nama" : null);
  return rows.map(row => ({
    id: row.id, action: row.action as HrAction, subject: nameOf(row.subject_employee_id), actor: nameOf(row.actor_employee_id),
    ip: row.ip, userAgent: row.user_agent, createdAt: row.created_at,
  }));
}
