import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import type { WbStrava, WbStravaSync } from "@/lib/wellbeing/app-types";
import { addDays, monthRange, wibToday } from "@/lib/wellbeing/rules";
import { athleteName, MIGRATION_STRAVA, scopeOk, sportCodeFor, STRAVA_SCOPE, stravaRow, type StravaActivity } from "@/lib/wellbeing/strava";
import type { WbStravaAdmin } from "@/lib/wellbeing/types";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import type { Member } from "../pra-wam/session";
import { db, missing, readSettings, withTimeColumn } from "./shared";

/*
 * WLM Strava (18 Nov 2026, docs/rancangan-wellbeing.md "Strava"): one Strava API app of the office
 * (STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET), each employee connects their own account (OAuth).
 *
 * - Tokens live in wb_strava_links, encrypted here (AES-256-GCM, a key from WAM_SESSION_SECRET), and
 *   never reach a browser. A refresh runs once at a time (refreshing_until) and always keeps the new
 *   refresh token. When Strava refuses them, the link says "reconnect" (shown in Profil), not silence.
 * - New and changed activities come by webhook (one subscription for the app, made from Admin WLM →
 *   Pengaturan); on connecting and on "Sinkronkan sekarang" the month so far is read again.
 * - Points: calories 1:1 (the daily cap), as the old app. An admin's decision (Ubah poin, Tolak) is never
 *   overwritten by a sync; changed points of a checked activity send it back to Belum diperiksa.
 * - Kept from Strava: the activity id, day and time, name, sport, calories, duration, distance.
 */

const API = "https://www.strava.com/api/v3";
const OAUTH = "https://www.strava.com/oauth";
const STATE_MINUTES = 15;
const TIMEOUT = 15_000;

export function stravaConfig(env: Record<string, string | undefined> = process.env): { clientId: string; clientSecret: string } | null {
  const clientId = env.STRAVA_CLIENT_ID?.trim(), clientSecret = env.STRAVA_CLIENT_SECRET?.trim();
  return clientId && clientSecret && /^\d+$/.test(clientId) ? { clientId, clientSecret } : null;
}
function config() {
  const found = stravaConfig();
  if (!found) throw new ServiceError(503, "Sambungan Strava belum disiapkan. Kabari admin WLM.");
  return found;
}

/* ---------- Secrets: the tokens at rest, the state of a connection ---------- */

function keyFor(purpose: string): Buffer {
  const secret = praWamSecret();
  if (!secret) throw new ServiceError(503, "Server belum disiapkan (WAM_SESSION_SECRET).");
  return createHash("sha256").update(`${purpose}\0${secret}`).digest();
}
const b64 = (data: Buffer) => data.toString("base64url");

/** A token as stored: "v1.<iv>.<tag>.<data>". */
export function seal(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor("wb-strava-token"), iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return ["v1", b64(iv), b64(cipher.getAuthTag()), b64(data)].join(".");
}
export function unseal(value: string): string {
  const [version, iv, tag, data] = value.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new ServiceError(500, "Token Strava tersimpan rusak. Sambungkan ulang Strava.");
  const decipher = createDecipheriv("aes-256-gcm", keyFor("wb-strava-token"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** The state carried through Strava's page: whose connection, until when; signed so no one else's can be used. */
export function stateFor(employeeId: string, now = Date.now()): string {
  const payload = `${employeeId}.${now + STATE_MINUTES * 60_000}.${b64(randomBytes(9))}`;
  return `${payload}.${b64(createHmac("sha256", keyFor("wb-strava-state")).update(payload).digest())}`;
}
/** The employee the state was made for, or null when it is altered or past its time. */
export function stateOwner(state: string | null | undefined, now = Date.now()): string | null {
  const parts = (state ?? "").split(".");
  if (parts.length !== 4) return null;
  const payload = parts.slice(0, 3).join("."), expected = createHmac("sha256", keyFor("wb-strava-state")).update(payload).digest();
  const given = Buffer.from(parts[3], "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return Number(parts[1]) > now ? parts[0] : null;
}

/** What Strava echoes back when the webhook is checked: made from the app's secret, nothing to store. */
export const webhookToken = (clientSecret = config().clientSecret) => createHmac("sha256", clientSecret).update("wlm-strava-webhook").digest("hex").slice(0, 32);

/* ---------- Talking to Strava ---------- */

export class StravaError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = "StravaError"; }
}
const refusal = (status: number) => status === 429
  ? "Strava sedang membatasi permintaan. Coba lagi sekitar 15 menit lagi."
  : status === 401 || status === 403 ? "Strava menolak sambungan ini." : status === 404 ? "Aktivitas tidak ada di Strava." : `Strava belum bisa dihubungi (kode ${status}).`;

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT) }); }
  catch { throw new StravaError("Strava belum bisa dihubungi. Coba lagi sebentar.", 0); }
  if (!response.ok) throw new StravaError(refusal(response.status), response.status);
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}
const api = <T>(path: string, token: string) => call<T>(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
const form = (values: Record<string, string>) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(values).toString() });

type TokenAnswer = { access_token: string; refresh_token: string; expires_at: number; scope?: string; athlete?: { id: number; firstname?: string; lastname?: string } };
const oauthToken = (values: Record<string, string>) => { const { clientId, clientSecret } = config(); return call<TokenAnswer>(`${OAUTH}/token`, form({ client_id: clientId, client_secret: clientSecret, ...values })); };

/** Strava's page where the person allows WLM; `redirectUri` is this site's callback. */
export function authorizeUrl(member: Pick<Member, "id">, redirectUri: string): string {
  const query = new URLSearchParams({ client_id: config().clientId, redirect_uri: redirectUri, response_type: "code", approval_prompt: "auto", scope: STRAVA_SCOPE, state: stateFor(member.id) });
  return `${OAUTH}/authorize?${query}`;
}

/* ---------- The link ---------- */

type Link = {
  employee_id: string; athlete_id: number; athlete_name: string; scope: string; access_token: string; refresh_token: string; expires_at: string;
  status: "ok" | "reconnect"; connected_at: string; last_sync_at: string | null; last_error: string | null; refreshing_until: string | null;
};
const LINK_COLUMNS = "employee_id,athlete_id,athlete_name,scope,access_token,refresh_token,expires_at,status,connected_at,last_sync_at,last_error,refreshing_until";
const nowIso = () => new Date().toISOString();

/** The link of this employee (null without one); `migrated` false before 202611180002. */
async function linkBy(column: "employee_id" | "athlete_id", value: string | number): Promise<{ migrated: boolean; link: Link | null }> {
  const { data, error } = await db().from("wb_strava_links").select(LINK_COLUMNS).eq(column, value).maybeSingle();
  if (error) { if (missing(error)) return { migrated: false, link: null }; databaseError(error); }
  return { migrated: true, link: (data as Link | null) ?? null };
}
const patchLink = async (employeeId: string, values: Partial<Link> & Record<string, unknown>) => {
  const { error } = await db().from("wb_strava_links").update({ ...values, updated_at: nowIso() }).eq("employee_id", employeeId);
  if (error) databaseError(error);
};
const shortError = (text: string) => text.slice(0, 300);

/** A valid access token: the kept one, or a refreshed one (one refresh at a time; the others wait for it). */
async function accessToken(link: Link): Promise<string> {
  const fresh = (row: Link) => Date.parse(row.expires_at) - Date.now() > 5 * 60_000;
  if (fresh(link)) return unseal(link.access_token);
  const now = nowIso();
  const { data: locked, error } = await db().from("wb_strava_links").update({ refreshing_until: new Date(Date.now() + 30_000).toISOString() })
    .eq("employee_id", link.employee_id).or(`refreshing_until.is.null,refreshing_until.lt.${now}`).select("employee_id");
  if (error) databaseError(error);
  if (!locked?.length) {
    for (let round = 0; round < 10; round++) {
      await new Promise(resolve => setTimeout(resolve, 1_000));
      const { link: again } = await linkBy("employee_id", link.employee_id);
      if (again && fresh(again)) return unseal(again.access_token);
    }
    throw new ServiceError(503, "Sambungan Strava sedang diperbarui. Coba lagi sebentar.");
  }
  try {
    const answer = await oauthToken({ grant_type: "refresh_token", refresh_token: unseal(link.refresh_token) });
    await patchLink(link.employee_id, { access_token: seal(answer.access_token), refresh_token: seal(answer.refresh_token), expires_at: new Date(answer.expires_at * 1000).toISOString(), refreshing_until: null, status: "ok", last_error: null });
    return answer.access_token;
  } catch (error) {
    if (error instanceof StravaError && (error.status === 400 || error.status === 401)) {
      await patchLink(link.employee_id, { status: "reconnect", refreshing_until: null, last_error: "Strava menolak sambungan (dicabut atau kedaluwarsa). Sambungkan ulang." });
      throw new ServiceError(409, "Sambungan Strava terputus. Sambungkan ulang di Profil.");
    }
    await patchLink(link.employee_id, { refreshing_until: null });
    throw error;
  }
}

/* ---------- Status, connect, disconnect ---------- */

export async function stravaStatus(member: Pick<Member, "id">): Promise<WbStrava> {
  const ready = !!stravaConfig();
  const { migrated, link } = await linkBy("employee_id", member.id);
  if (!migrated) return { ready: false, connected: false, status: null, athleteName: "", connectedAt: null, lastSyncAt: null, lastError: null, private: false };
  return {
    ready, connected: !!link, status: link?.status ?? null, athleteName: link?.athlete_name ?? "", connectedAt: link?.connected_at ?? null,
    lastSyncAt: link?.last_sync_at ?? null, lastError: link?.last_error ?? null, private: !!link && /activity:read_all/.test(link.scope),
  };
}

/** Why a connection failed, as the short code the callback puts in the address (Profil says it in words). */
export type ConnectProblem = "kedaluwarsa" | "izin" | "dipakai" | "belum-siap" | "gagal";
export class ConnectError extends Error { constructor(public problem: ConnectProblem) { super(problem); } }

/** The callback: check the state and the permission, keep the tokens; one Strava account for one employee. */
export async function connectStrava(member: Pick<Member, "id">, input: { code: string; scope: string; state: string }): Promise<void> {
  if (!stravaConfig()) throw new ConnectError("belum-siap");
  if (stateOwner(input.state) !== member.id) throw new ConnectError("kedaluwarsa");
  if (!scopeOk(input.scope)) throw new ConnectError("izin");
  let answer: TokenAnswer;
  try { answer = await oauthToken({ grant_type: "authorization_code", code: input.code }); }
  catch { throw new ConnectError("gagal"); }
  if (!answer.athlete?.id || !scopeOk(answer.scope ?? input.scope)) throw new ConnectError("izin");
  const other = await linkBy("athlete_id", answer.athlete.id);
  if (!other.migrated) throw new ConnectError("belum-siap");
  // The other employee's link stays: revoking here would cut theirs too (same app, same athlete).
  if (other.link && other.link.employee_id !== member.id) throw new ConnectError("dipakai");
  const now = nowIso();
  const { error } = await db().from("wb_strava_links").upsert({
    employee_id: member.id, athlete_id: answer.athlete.id, athlete_name: athleteName(answer.athlete), scope: (answer.scope ?? input.scope).slice(0, 200),
    access_token: seal(answer.access_token), refresh_token: seal(answer.refresh_token), expires_at: new Date(answer.expires_at * 1000).toISOString(),
    status: "ok", consent_at: now, connected_at: now, last_error: null, refreshing_until: null, updated_at: now,
  }, { onConflict: "employee_id" });
  if (error) { if (error.code === "23505") throw new ConnectError("dipakai"); databaseError(error); }
}

/** Putus: Strava forgets WLM for this person (both tokens), the link goes; counted activities stay. */
export async function disconnectStrava(member: Pick<Member, "id">): Promise<void> {
  const { migrated, link } = await linkBy("employee_id", member.id);
  if (!migrated || !link) return;
  const found = stravaConfig();
  if (found) {
    try {
      await call(`${OAUTH}/revoke`, { ...form({ token: unseal(link.refresh_token), token_type_hint: "refresh_token" }),
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${found.clientId}:${found.clientSecret}`).toString("base64")}` } });
    } catch { /* already revoked on Strava, or Strava is down: the link goes anyway */ }
  }
  const { error } = await db().from("wb_strava_links").delete().eq("employee_id", member.id);
  if (error) databaseError(error);
}

/* ---------- Activities ---------- */

type Catalog = { active: Set<string>; dimensionOf: Map<string, string> };
async function sportCatalog(): Promise<Catalog> {
  const { data, error } = await db().from("wb_activity_types").select("code,dimension_id,active").eq("kind", "sport");
  if (error) databaseError(error);
  const rows = (data ?? []) as { code: string; dimension_id: string; active: boolean }[];
  return { active: new Set(rows.filter(row => row.active).map(row => row.code)), dimensionOf: new Map(rows.map(row => [row.code, row.dimension_id])) };
}

type Kept = { id: string; employee_id: string; status: "approved" | "adjusted" | "rejected"; points: number; checked: boolean };

/**
 * One Strava activity into WLM: new ones count at once (approved, not checked); a known one gets its
 * new details, its points only while no admin changed or rejected it, and goes back to Belum
 * diperiksa when its points change after it was checked.
 */
async function saveActivity(employeeId: string, activity: StravaActivity, catalog: Catalog, settings: Awaited<ReturnType<typeof readSettings>>["settings"]): Promise<"added" | "updated" | "skipped"> {
  const code = sportCodeFor(activity.sport_type ?? activity.type, catalog.active);
  if (!code) return "skipped";
  const row = stravaRow(activity, settings);
  const externalId = String(activity.id);
  const client = db();
  const { data: found, error: findError } = await client.from("wb_activities").select("id,employee_id,status,points,checked").eq("source", "strava").eq("external_id", externalId).maybeSingle();
  if (findError) databaseError(findError);
  const kept = found as Kept | null;
  if (kept && kept.employee_id !== employeeId) return "skipped";
  const details = { type_code: code, dimension_id: catalog.dimensionOf.get(code) ?? "physical", happened_on: row.happened_on, title: row.title, kcal: row.kcal, minutes: row.minutes, distance_m: row.distance_m };
  const time = (on: boolean) => on && row.happened_time ? { happened_time: row.happened_time } : {};
  if (!kept) {
    const { error } = await withTimeColumn(on => client.from("wb_activities").insert({
      employee_id: employeeId, ...details, ...time(on), source: "strava", external_id: externalId, note: "", photos: [],
      points_claimed: row.points, points: row.points, status: "approved", checked: false,
    }));
    if (!error) return "added";
    // The webhook and a sync at the same moment: the other one saved it.
    if (error.code !== "23505") databaseError(error);
    return "skipped";
  }
  const pointsNow = kept.status === "approved" ? { points: row.points, ...(kept.checked && kept.points !== row.points ? { checked: false } : {}) } : {};
  const { error } = await withTimeColumn(on => client.from("wb_activities").update({ ...details, ...time(on), points_claimed: row.points, ...pointsNow, updated_at: nowIso() }).eq("id", kept.id));
  if (error) databaseError(error);
  return "updated";
}

/** The day reading starts: the race month's first day, a few days earlier around its start (late uploads). */
const syncFrom = (today: string) => [monthRange(today).from, addDays(today, -3)].sort()[0];

/**
 * Read this person's Strava activities since the month began and keep the new ones (their details,
 * with calories, are read one by one; known ones are left to the webhook). Answers what changed.
 */
export async function syncStrava(employeeId: string, now = new Date()): Promise<WbStravaSync> {
  const { migrated, link } = await linkBy("employee_id", employeeId);
  if (!migrated) throw new ServiceError(503, `Strava menunggu migrasi ${MIGRATION_STRAVA}.`);
  if (!link) throw new ServiceError(404, "Strava belum tersambung.");
  if (link.status !== "ok") throw new ServiceError(409, "Sambungan Strava terputus. Sambungkan ulang di Profil.");
  const token = await accessToken(link);
  const [{ settings }, catalog] = await Promise.all([readSettings(), sportCatalog()]);
  const after = Math.floor(Date.parse(`${syncFrom(wibToday(now))}T00:00:00+07:00`) / 1000);
  let added = 0, seen = 0;
  try {
    for (let page = 1; page <= 4; page++) {
      const list = await api<{ id: number }[]>(`/athlete/activities?after=${after}&per_page=50&page=${page}`, token);
      seen += list.length;
      if (!list.length) break;
      const ids = list.map(item => String(item.id));
      const { data: known, error } = await db().from("wb_activities").select("external_id").eq("source", "strava").in("external_id", ids);
      if (error) databaseError(error);
      const have = new Set(((known ?? []) as { external_id: string }[]).map(row => row.external_id));
      for (const item of list) {
        if (have.has(String(item.id))) continue;
        const detail = await api<StravaActivity>(`/activities/${item.id}`, token);
        if ((await saveActivity(employeeId, detail, catalog, settings)) === "added") added++;
      }
      if (list.length < 50) break;
    }
  } catch (error) {
    if (error instanceof StravaError) {
      await patchLink(employeeId, { last_error: shortError(error.message), ...(error.status === 401 ? { status: "reconnect" } : {}) });
      throw new ServiceError(error.status === 429 ? 429 : 502, error.message);
    }
    throw error;
  }
  await patchLink(employeeId, { last_sync_at: nowIso(), last_error: null });
  return { added, seen };
}

/* ---------- Webhook ---------- */

export type StravaEvent = { object_type?: string; object_id?: number; aspect_type?: string; owner_id?: number; subscription_id?: number; updates?: Record<string, string> };

/**
 * One webhook event (answered at once, handled after). Anyone could send one, so nothing is taken on
 * its word: an activity is read from Strava with its owner's token (a delete only when Strava says it
 * is gone), and a revoked access only when the tokens really stop working.
 */
export async function handleStravaEvent(event: StravaEvent): Promise<void> {
  if (!stravaConfig() || typeof event.owner_id !== "number") return;
  const { link } = await linkBy("athlete_id", event.owner_id);
  if (!link) return;
  if (event.object_type === "athlete") {
    if (event.updates?.authorized !== "false") return;
    try { await accessToken({ ...link, expires_at: new Date(0).toISOString() }); }
    catch {
      // Strava no longer accepts the tokens: the person removed WLM on Strava. Their link goes.
      await db().from("wb_strava_links").delete().eq("employee_id", link.employee_id);
    }
    return;
  }
  if (event.object_type !== "activity" || typeof event.object_id !== "number" || link.status !== "ok") return;
  const token = await accessToken(link);
  try {
    const detail = await api<StravaActivity>(`/activities/${event.object_id}`, token);
    const [{ settings }, catalog] = await Promise.all([readSettings(), sportCatalog()]);
    await saveActivity(link.employee_id, detail, catalog, settings);
  } catch (error) {
    if (error instanceof StravaError && error.status === 404) {
      // Gone on Strava (deleted, or hidden from WLM): its points go too.
      const { error: deleteError } = await db().from("wb_activities").delete().eq("source", "strava").eq("external_id", String(event.object_id)).eq("employee_id", link.employee_id);
      if (deleteError) databaseError(deleteError);
      return;
    }
    if (error instanceof StravaError) { await patchLink(link.employee_id, { last_error: shortError(error.message) }); return; }
    throw error;
  }
}

/* ---------- Admin: the app's webhook subscription ---------- */

type Subscription = { id: number; callback_url: string };

export async function stravaAdmin(callbackUrl: string): Promise<WbStravaAdmin> {
  const found = stravaConfig();
  const { data, error } = await db().from("wb_strava_links").select("status");
  const migrated = !(error && missing(error));
  if (error && migrated) databaseError(error);
  const rows = (data ?? []) as { status: string }[];
  const base = { configured: !!found, migrated, callbackUrl, connected: rows.filter(row => row.status === "ok").length, reconnect: rows.filter(row => row.status === "reconnect").length };
  if (!found) return { ...base, subscription: null, subscriptionError: null };
  try {
    const list = await call<Subscription[]>(`${API}/push_subscriptions?${new URLSearchParams({ client_id: found.clientId, client_secret: found.clientSecret })}`);
    const first = list?.[0];
    return { ...base, subscription: first ? { id: first.id, callbackUrl: first.callback_url } : null, subscriptionError: null };
  } catch (error) {
    return { ...base, subscription: null, subscriptionError: error instanceof StravaError ? error.message : "Strava belum bisa dihubungi." };
  }
}

/** Aktifkan webhook: Strava checks the callback at once (our GET answers its challenge), then sends events there. */
export async function subscribeStrava(callbackUrl: string): Promise<WbStravaAdmin> {
  const { clientId, clientSecret } = config();
  try {
    await call(`${API}/push_subscriptions`, form({ client_id: clientId, client_secret: clientSecret, callback_url: callbackUrl, verify_token: webhookToken(clientSecret) }));
  } catch (error) {
    throw new ServiceError(502, error instanceof StravaError && error.status === 400
      ? "Strava menolak webhook (mungkin sudah ada untuk alamat lain, atau alamatnya tidak bisa dihubungi Strava)."
      : error instanceof Error ? error.message : "Strava belum bisa dihubungi.");
  }
  return stravaAdmin(callbackUrl);
}
