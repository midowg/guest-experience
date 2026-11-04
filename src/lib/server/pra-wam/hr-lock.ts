import "server-only";
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { cookies } from "next/headers";
import { adminAuthConfig, SESSION_COOKIE, verifySession } from "@/lib/admin-token";
import { HR_LOCKOUT_MINUTES, HR_MAX_FAILURES, HR_UNLOCK_MINUTES, hrPasswordProblem } from "@/lib/pra-wam/hr-password";
import { answered, hrOnly, type AnswerValue, type QuestionKind, type Visibility } from "@/lib/pra-wam/questionnaire";
import { clientInfo, requireApiAdmin } from "../admin-session";
import { ServiceError } from "../config";
import { databaseError, enforceRateLimit } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";
import { formContent, questionnaireMissing, questionnaireWaiting } from "./questionnaire";

/*
 * The HR lock on the questionnaire's most private answers (visibility `hr` and `hronly`), on top
 * of the admin sign-in. Its own password, kept only as a scrypt hash on cq_forms. A right password
 * gives this browser a separate signed cookie for 30 minutes, bound to the admin session cookie
 * (it dies with it) and to the current hash (it dies when the password changes or is reset).
 * Every HR data read checks the admin session and that cookie, here on the server. Unlocking,
 * failing, locking, changing the password and opening a person are logged in cq_hr_access_log.
 * The plain password is never logged, returned or stored.
 */

export const HR_COOKIE = "wk_hr";
export const HR_COOKIE_TTL_SECONDS = HR_UNLOCK_MINUTES * 60;

/* ---- Hashing (pure) ------------------------------------------------------------------------- */

export type ScryptParams = { N: number; r: number; p: number; keylen: number };
/** About 32 MiB and ~100 ms per check: slow enough to guess, quick enough to type. */
export const SCRYPT_PARAMS: ScryptParams = { N: 2 ** 15, r: 8, p: 1, keylen: 32 };
const SALT_BYTES = 16;

function derive(password: string, salt: Buffer, { N, r, p, keylen }: ScryptParams): Promise<Buffer> {
  const options: ScryptOptions = { N, r, p, maxmem: 256 * N * r + 1024 * 1024 };
  return new Promise((resolve, reject) => scrypt(password.normalize("NFC"), salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key))));
}

/** `scrypt$N$r$p$salt$hash`, salt and hash in base64; a new random salt each time. */
export async function hashHrPassword(password: string, params: ScryptParams = SCRYPT_PARAMS): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, params);
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/** The parts of a stored hash, or null when it is not one this code wrote (or has unsafe costs). */
export function parseHrHash(stored: string): { params: ScryptParams; salt: Buffer; key: Buffer } | null {
  const match = /^scrypt\$(\d{1,8})\$(\d{1,2})\$(\d{1,2})\$([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2})$/.exec(stored);
  if (!match) return null;
  const [N, r, p] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Bounds keep a tampered row from asking for gigabytes of memory.
  if (N < 2 ** 14 || N > 2 ** 20 || (N & (N - 1)) !== 0 || r < 1 || r > 16 || p < 1 || p > 4) return null;
  const salt = Buffer.from(match[4], "base64"), key = Buffer.from(match[5], "base64");
  if (salt.length < SALT_BYTES || key.length < 16 || key.length > 64) return null;
  return { params: { N, r, p, keylen: key.length }, salt, key };
}

/** Whether a typed password matches a stored hash; constant time over the derived key. */
export async function verifyHrPassword(password: string, stored: string | null): Promise<boolean> {
  const parsed = stored ? parseHrHash(stored) : null;
  if (!parsed) return false;
  const key = await derive(password, parsed.salt, parsed.params);
  return key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
}

/** A short fingerprint of the stored hash: a new password (new salt) is a new version. */
export const passwordVersion = (stored: string) => createHash("sha256").update(`hr-version\0${stored}`).digest("hex").slice(0, 32);

/* ---- The unlock cookie (pure) --------------------------------------------------------------- */

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
function tokenSignature(secret: string, expires: number, adminToken: string, version: string) {
  return createHmac("sha256", `${secret}\0hr-unlock`).update(`hr\0v1\0${expires}\0${sha256(adminToken)}\0${version}`).digest("hex");
}

/** `v1.<expires>.<hmac>`: valid for 30 minutes, for this admin session and this HR password only. */
export function signHrToken(secret: string, adminToken: string, version: string, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + HR_COOKIE_TTL_SECONDS;
  return `v1.${expires}.${tokenSignature(secret, expires, adminToken, version)}`;
}

/** When the unlock ends (ms), or null when the token is missing, expired, forged or bound to something else. */
export function verifyHrToken(secret: string, token: string | undefined, adminToken: string | undefined, version: string, now = Date.now()): number | null {
  if (!token || !adminToken) return null;
  const match = /^v1\.(\d{1,12})\.([0-9a-f]{64})$/.exec(token);
  if (!match) return null;
  const expires = Number(match[1]);
  if (expires * 1000 <= now || expires * 1000 > now + HR_COOKIE_TTL_SECONDS * 1000) return null;
  const expected = Buffer.from(tokenSignature(secret, expires, adminToken, version), "hex");
  return timingSafeEqual(Buffer.from(match[2], "hex"), expected) ? expires * 1000 : null;
}

/* ---- Too many wrong passwords (pure) -------------------------------------------------------- */

export type LockEvent = { action: string; created_at: string };
export type LockState = { lockedUntil: string | null; attemptsLeft: number };

/**
 * Five wrong HR passwords within 15 minutes pause unlocking (and changing the password) for 15
 * minutes after the last one, for every device: the password is shared, so the count is too. A
 * right password starts the count again. `events` are the recent `buka`/`gagal` rows, any order.
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

const minutesLeft = (until: string, now = Date.now()) => Math.max(1, Math.ceil((Date.parse(until) - now) / 60_000));
export const lockedMessage = (until: string, now = Date.now()) =>
  `Terlalu banyak password HR yang salah. Data HR dikunci sementara; coba lagi dalam ${minutesLeft(until, now)} menit.`;

/* ---- Database ------------------------------------------------------------------------------- */

export type HrAction = "buka" | "gagal" | "kunci" | "lihat" | "ekspor" | "ganti_password";
type HrForm = { id: string; hash: string | null };

/** The form's id and HR hash; null before the migration. The hash never leaves this file. */
async function hrForm(): Promise<HrForm | null> {
  const { data, error } = await createPrivilegedClient().from("cq_forms").select("id,hr_password_hash").order("created_at").limit(1).maybeSingle();
  if (error) { if (questionnaireMissing(error)) return null; databaseError(error); }
  return data ? { id: data.id as string, hash: (data.hr_password_hash as string | null) ?? null } : null;
}
async function requireForm(): Promise<HrForm> {
  const form = await hrForm();
  if (!form) throw questionnaireWaiting();
  return form;
}

/** One log row; failing to log fails the action, so nothing opens unrecorded. */
async function logHr(formId: string, action: HrAction, request: Request | null, subject: string | null = null) {
  const client = request ? clientInfo(request) : null;
  const { error } = await createPrivilegedClient().from("cq_hr_access_log").insert({
    form_id: formId, action, subject_employee_id: subject, ip: client?.ip ?? null, user_agent: client?.userAgent?.slice(0, 300) ?? null,
  });
  if (error) { if (questionnaireMissing(error)) throw questionnaireWaiting(); databaseError(error); }
}

async function lockState(formId: string): Promise<LockState> {
  const since = new Date(Date.now() - 2 * HR_LOCKOUT_MINUTES * 60_000).toISOString();
  const { data, error } = await createPrivilegedClient().from("cq_hr_access_log").select("action,created_at")
    .eq("form_id", formId).in("action", ["buka", "gagal"]).gte("created_at", since).order("created_at", { ascending: false }).limit(50);
  if (error) { if (questionnaireMissing(error)) throw questionnaireWaiting(); databaseError(error); }
  return lockStateOf((data ?? []) as LockEvent[]);
}

/**
 * Checks a typed HR password against the stored hash, with the per-network rate limit and the
 * shared lockout; a wrong one is logged as `gagal`. Throws in plain words when it does not open.
 */
async function checkTyped(request: Request, form: HrForm & { hash: string }, password: string, field: "password" | "current") {
  await enforceRateLimit(request, "wam-hr-password", 10);
  const state = await lockState(form.id);
  if (state.lockedUntil) throw new ServiceError(429, lockedMessage(state.lockedUntil));
  if (await verifyHrPassword(password, form.hash)) return;
  await logHr(form.id, "gagal", request);
  const left = state.attemptsLeft - 1;
  if (left <= 0) throw new ServiceError(429, `Password HR salah. Data HR dikunci ${HR_LOCKOUT_MINUTES} menit karena terlalu banyak percobaan.`);
  const text = `Password HR salah. Sisa ${left} percobaan sebelum dikunci ${HR_LOCKOUT_MINUTES} menit.`;
  throw new ServiceError(403, text, { [field]: [text] });
}

function newPasswordOrThrow(password: string) {
  const problem = hrPasswordProblem(password);
  if (problem) throw new ServiceError(422, problem, { password: [problem] });
}

async function clearCookie() { (await cookies()).delete(HR_COOKIE); }
const noPassword = () => new ServiceError(409, "Password HR belum diatur. Atur dulu di Pengaturan kuesioner.");

/* ---- Setting, changing, resetting ----------------------------------------------------------- */

/** The first HR password (any admin), only while there is none. */
export async function setFirstHrPassword(request: Request, password: string) {
  newPasswordOrThrow(password);
  const form = await requireForm();
  if (form.hash) throw new ServiceError(409, "Password HR sudah diatur. Untuk menggantinya, isi password HR yang sekarang.");
  const hash = await hashHrPassword(password);
  const { data, error } = await createPrivilegedClient().from("cq_forms").update({ hr_password_hash: hash, updated_at: new Date().toISOString() })
    .eq("id", form.id).is("hr_password_hash", null).select("id");
  if (error) { if (questionnaireMissing(error)) throw questionnaireWaiting(); databaseError(error); }
  if (!data?.length) throw new ServiceError(409, "Password HR baru saja diatur orang lain. Muat ulang halaman.");
  await logHr(form.id, "ganti_password", request);
}

/** A new HR password, with the current one (counts toward the lockout like unlocking). */
export async function changeHrPassword(request: Request, current: string, password: string) {
  newPasswordOrThrow(password);
  const form = await requireForm();
  if (!form.hash) throw noPassword();
  await checkTyped(request, { ...form, hash: form.hash }, current, "current");
  if (current === password) throw new ServiceError(422, "Password baru harus berbeda dari yang sekarang.", { password: ["Password baru harus berbeda dari yang sekarang."] });
  const hash = await hashHrPassword(password);
  const { data, error } = await createPrivilegedClient().from("cq_forms").update({ hr_password_hash: hash, updated_at: new Date().toISOString() })
    .eq("id", form.id).eq("hr_password_hash", form.hash).select("id");
  if (error) databaseError(error);
  if (!data?.length) throw new ServiceError(409, "Password HR baru saja diubah orang lain. Muat ulang halaman.");
  await logHr(form.id, "ganti_password", request);
  // Every unlock was bound to the old hash, this one included.
  await clearCookie();
}

/** Super admin: clear a forgotten HR password; every unlock ends with it. The caller checks the role. */
export async function resetHrPassword(request: Request) {
  const form = await requireForm();
  if (!form.hash) throw noPassword();
  const { error } = await createPrivilegedClient().from("cq_forms").update({ hr_password_hash: null, updated_at: new Date().toISOString() }).eq("id", form.id);
  if (error) databaseError(error);
  await logHr(form.id, "ganti_password", request);
  await clearCookie();
}

/* ---- Unlocking and locking ------------------------------------------------------------------ */

/** A right HR password unlocks this browser for 30 minutes; returns when it locks again (ISO). */
export async function unlockHr(request: Request, password: string): Promise<string> {
  const config = adminAuthConfig();
  const store = await cookies();
  const adminToken = store.get(SESSION_COOKIE)?.value;
  if (!config || !adminToken || !verifySession(config, adminToken)) throw new ServiceError(401, "Sesi berakhir. Masuk kembali sebelum melanjutkan.");
  const form = await requireForm();
  if (!form.hash) throw noPassword();
  await checkTyped(request, { ...form, hash: form.hash }, password, "password");
  await logHr(form.id, "buka", request);
  const token = signHrToken(config.secret, adminToken, passwordVersion(form.hash));
  store.set(HR_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: HR_COOKIE_TTL_SECONDS });
  return new Date(Date.now() + HR_COOKIE_TTL_SECONDS * 1000).toISOString();
}

/** "Kunci sekarang": the cookie goes, and it is logged when it was open. */
export async function lockHr(request: Request) {
  const unlocked = await hrUnlocked();
  await clearCookie();
  if (unlocked) await logHr(unlocked.formId, "kunci", request);
}

export type HrUnlock = { formId: string; expiresAt: string };

/** For pages (after requireAdminPage): the unlock this browser holds, or null. Never throws for a locked state. */
export async function hrUnlocked(): Promise<HrUnlock | null> {
  const config = adminAuthConfig();
  if (!config) return null;
  const store = await cookies();
  const adminToken = store.get(SESSION_COOKIE)?.value;
  const token = store.get(HR_COOKIE)?.value;
  if (!token || !adminToken || !verifySession(config, adminToken)) return null;
  const form = await hrForm();
  if (!form?.hash) return null;
  const expires = verifyHrToken(config.secret, token, adminToken, passwordVersion(form.hash));
  return expires ? { formId: form.id, expiresAt: new Date(expires).toISOString() } : null;
}

/** For APIs: the admin session and the HR unlock, or a 401/403 in plain words. */
export async function requireHrUnlocked(): Promise<HrUnlock> {
  await requireApiAdmin();
  const unlocked = await hrUnlocked();
  if (unlocked) return unlocked;
  if (!(await hrForm())) throw questionnaireWaiting();
  throw new ServiceError(403, "Data HR terkunci. Buka dulu dengan password HR di halaman Data HR.");
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
export type HrPageState = { migrated: boolean; hasPassword: boolean; unlocked: HrUnlock | null; checkedAt: number } & LockState;

/** What the Data HR page needs to choose between the lock screen and the data. */
export async function hrPageState(): Promise<HrPageState> {
  const checkedAt = Date.now();
  const form = await hrForm();
  if (!form) return { migrated: false, hasPassword: false, unlocked: null, lockedUntil: null, attemptsLeft: HR_MAX_FAILURES, checkedAt };
  const unlocked = form.hash ? await hrUnlocked() : null;
  const lock = form.hash && !unlocked ? await lockState(form.id) : { lockedUntil: null, attemptsLeft: HR_MAX_FAILURES };
  return { migrated: true, hasPassword: !!form.hash, unlocked, ...lock, checkedAt };
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

/** One person's HR answers by section. Logged as `lihat` first: no log, no data. */
export async function hrPerson(unlock: HrUnlock, employeeId: string, request: Request | null): Promise<HrPersonDetail> {
  const people = await listPeople();
  const person = people.find(item => item.id === employeeId);
  if (!person) throw new ServiceError(404, "Karyawan tidak ditemukan.");
  await logHr(unlock.formId, "lihat", request, employeeId);
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

export type HrLogRow = { id: string; action: HrAction; subject: string | null; ip: string | null; userAgent: string | null; createdAt: string };

/** The latest 50 HR access log rows, newest first, people by name. */
export async function hrAccessLog(unlock: HrUnlock): Promise<HrLogRow[]> {
  const { data, error } = await createPrivilegedClient().from("cq_hr_access_log").select("id,action,subject_employee_id,ip,user_agent,created_at")
    .eq("form_id", unlock.formId).order("created_at", { ascending: false }).limit(50);
  if (error) { if (questionnaireMissing(error)) throw questionnaireWaiting(); databaseError(error); }
  const rows = data ?? [];
  const names = rows.some(row => row.subject_employee_id) ? new Map((await listPeople()).map(person => [person.id, person.name])) : new Map<string, string>();
  return rows.map(row => ({
    id: row.id, action: row.action as HrAction, subject: row.subject_employee_id ? names.get(row.subject_employee_id) ?? "Tanpa nama" : null,
    ip: row.ip, userAgent: row.user_agent, createdAt: row.created_at,
  }));
}
