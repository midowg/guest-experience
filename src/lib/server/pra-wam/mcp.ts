import "server-only";
import { DEFAULT_MCP_SCOPES, handleMcpText, mayUseMcp, normalizeScopes, type McpScope, unauthorizedBody } from "@/lib/pra-wam/mcp";
import { bearerKey, hashMcpKey, looksLikeMcpKey, mcpKeyHint, newMcpKey } from "@/lib/pra-wam/mcp-key";
import { photoColumnMissing, photoPath } from "@/lib/pra-wam/photo";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { mcpTools } from "./mcp-tools";
import { notMigrated, rolesOf, type Member } from "./session";

/*
 * MCP WAM (migration 202611060010): who may connect Claude or ChatGPT, their key, and the log of
 * what they asked. Admin WAM grants and revokes; the person makes their own key in Profil, shown
 * once. A key is good while the grant stands and the WAM account and the employee are active, as
 * a signed-in session would be. Before the migration nobody has access and every key is refused.
 */

export const MCP_MIGRATION = "202611060010_pra_wam_mcp.sql";
const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(error.code ?? "") || /pw_mcp/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Akses MCP menunggu migrasi ${MCP_MIGRATION}.`);
function fail(error: { code?: string; message: string }): never {
  if (missing(error)) throw waiting();
  databaseError(error);
}

type AccessRow = {
  employee_id: string; scopes: string[]; granted_by: string | null; granted_at: string; revoked_at: string | null;
  key_hash: string | null; key_hint: string | null; key_created_at: string | null; last_used_at: string | null;
};
const ACCESS_COLUMNS = "employee_id,scopes,granted_by,granted_at,revoked_at,key_hash,key_hint,key_created_at,last_used_at";

/** For Profil and the BOD page: whether the person has access now, a key, and when it was last used. Null before the migration. */
export async function mcpAccessOf(employeeId: string): Promise<{ granted: boolean; hasKey: boolean; lastUsedAt: string | null } | null> {
  const { data, error } = await createPrivilegedClient().from("pw_mcp_access").select("revoked_at,key_hash,last_used_at").eq("employee_id", employeeId).maybeSingle();
  if (error) { if (missing(error)) return null; databaseError(error); }
  if (!data) return { granted: false, hasKey: false, lastUsedAt: null };
  const granted = !data.revoked_at;
  return { granted, hasKey: granted && !!data.key_hash, lastUsedAt: data.last_used_at };
}

/* ---- Admin WAM ---------------------------------------------------------------------------------- */

export type McpAccessRow = {
  employeeId: string; name: string; department: string; scopes: McpScope[];
  grantedBy: string | null; grantedAt: string; revokedAt: string | null;
  hasKey: boolean; keyHint: string | null; keyCreatedAt: string | null; lastUsedAt: string | null;
};
export type McpCall = { id: number; employeeId: string | null; name: string; tool: string; ok: boolean; createdAt: string };
export type McpCandidate = { employeeId: string; name: string; department: string };
export type McpAdminList = { migrated: boolean; rows: McpAccessRow[]; recent: McpCall[]; candidates: McpCandidate[] };

/** Every grant, the last 30 calls, and the WAM accounts that could still be given access. */
export async function listMcpAccess(): Promise<McpAdminList> {
  const client = createPrivilegedClient();
  const [{ data: access, error }, { data: log, error: logError }, { data: accounts, error: accountError }, { data: leaders }] = await Promise.all([
    client.from("pw_mcp_access").select(ACCESS_COLUMNS).order("granted_at", { ascending: false }),
    client.from("pw_mcp_log").select("id,employee_id,tool,ok,created_at").order("created_at", { ascending: false }).limit(30),
    client.from("pw_accounts").select("employee_id,active,employees(full_name,department,active)").limit(2000),
    client.from("pw_roles").select("employee_id").eq("role", "bod"),
  ]);
  // Only BOD can be given access.
  const allowed = new Set((leaders ?? []).map(row => row.employee_id as string));
  const problem = error ?? logError;
  if (problem) { if (missing(problem)) return { migrated: false, rows: [], recent: [], candidates: [] }; databaseError(problem); }
  if (accountError) { if (notMigrated(accountError)) return { migrated: true, rows: [], recent: [], candidates: [] }; databaseError(accountError); }
  const people = new Map(((accounts ?? []) as unknown as { employee_id: string; active: boolean; employees: { full_name: string; department: string | null; active: boolean } | null }[])
    .map(row => [row.employee_id, { name: row.employees?.full_name ?? "Tanpa nama", department: row.employees?.department ?? "", usable: row.active && !!row.employees?.active }]));
  const rows = ((access ?? []) as AccessRow[]).map(row => ({
    employeeId: row.employee_id, name: people.get(row.employee_id)?.name ?? "Tanpa nama", department: people.get(row.employee_id)?.department ?? "",
    scopes: normalizeScopes(row.scopes ?? []), grantedBy: row.granted_by, grantedAt: row.granted_at, revokedAt: row.revoked_at,
    hasKey: !row.revoked_at && !!row.key_hash, keyHint: row.revoked_at ? null : row.key_hint, keyCreatedAt: row.key_created_at, lastUsedAt: row.last_used_at,
  }));
  const granted = new Set(rows.map(row => row.employeeId));
  const candidates = [...people.entries()].filter(([id, person]) => person.usable && !granted.has(id) && allowed.has(id))
    .map(([employeeId, person]) => ({ employeeId, name: person.name, department: person.department }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const recent = (log ?? []).map(row => ({ id: row.id, employeeId: row.employee_id, name: row.employee_id ? people.get(row.employee_id)?.name ?? "Tanpa nama" : "Tanpa nama", tool: row.tool, ok: row.ok, createdAt: row.created_at }));
  return { migrated: true, rows, recent, candidates };
}

/** Gives a person access (or changes what they may ask about). They need an active WAM account. */
export async function grantMcp(employeeId: string, scopes: readonly string[] = DEFAULT_MCP_SCOPES, by: string): Promise<void> {
  const wanted = normalizeScopes(scopes);
  if (!wanted.length) throw new ServiceError(422, "Pilih minimal satu cakupan.", { scopes: ["Pilih minimal satu cakupan."] });
  const client = createPrivilegedClient();
  const { data: account, error: accountError } = await client.from("pw_accounts").select("active,employees(active)").eq("employee_id", employeeId).maybeSingle();
  if (accountError) { if (notMigrated(accountError)) throw new ServiceError(503, "Akun WAM menunggu migrasi."); databaseError(accountError); }
  const person = account as unknown as { active: boolean; employees: { active: boolean } | null } | null;
  if (!person || !person.active || !person.employees?.active) throw new ServiceError(422, "Orang ini belum punya akun WAM yang aktif. Buat akunnya dulu di Akun dan peran.");
  const { data: roles } = await client.from("pw_roles").select("role").eq("employee_id", employeeId);
  if (!mayUseMcp({ roles: (roles ?? []).map(row => row.role as string) })) throw new ServiceError(422, "Akses MCP hanya untuk BOD.");
  const { data: existing, error } = await client.from("pw_mcp_access").select("employee_id").eq("employee_id", employeeId).maybeSingle();
  if (error) fail(error);
  const { error: saveError } = existing
    ? await client.from("pw_mcp_access").update({ scopes: wanted }).eq("employee_id", employeeId)
    : await client.from("pw_mcp_access").insert({ employee_id: employeeId, scopes: wanted, granted_by: by });
  if (saveError) fail(saveError);
}

/** Cabut: access stops at once and the key is forgotten, so restoring needs a new key. */
export async function revokeMcp(employeeId: string): Promise<void> {
  const { data, error } = await createPrivilegedClient().from("pw_mcp_access")
    .update({ revoked_at: new Date().toISOString(), key_hash: null, key_hint: null, key_created_at: null }).eq("employee_id", employeeId).select("employee_id");
  if (error) fail(error);
  if (!data?.length) throw new ServiceError(404, "Akses MCP orang ini tidak ditemukan.");
}

/** Pulihkan: access again; the person makes a new key in Profil. */
export async function restoreMcp(employeeId: string, by: string): Promise<void> {
  const { data, error } = await createPrivilegedClient().from("pw_mcp_access")
    .update({ revoked_at: null, granted_by: by, granted_at: new Date().toISOString() }).eq("employee_id", employeeId).select("employee_id");
  if (error) fail(error);
  if (!data?.length) throw new ServiceError(404, "Akses MCP orang ini tidak ditemukan.");
}

/* ---- The person's own key ----------------------------------------------------------------------- */

/** A new key for someone with access; the old one stops working. The plain key is returned once and never kept. */
export async function rotateKey(employeeId: string): Promise<string> {
  const key = newMcpKey();
  const { data, error } = await createPrivilegedClient().from("pw_mcp_access")
    .update({ key_hash: hashMcpKey(key), key_hint: mcpKeyHint(key), key_created_at: new Date().toISOString(), last_used_at: null })
    .eq("employee_id", employeeId).is("revoked_at", null).select("employee_id");
  if (error) fail(error);
  if (!data?.length) throw new ServiceError(403, "Kamu belum punya akses MCP. Minta admin WAM membukanya.");
  return key;
}

/** The person's own last calls, for Profil. Empty before the migration. */
export async function myMcpCalls(employeeId: string, limit = 5): Promise<{ tool: string; ok: boolean; createdAt: string }[]> {
  const { data, error } = await createPrivilegedClient().from("pw_mcp_log").select("tool,ok,created_at").eq("employee_id", employeeId).order("created_at", { ascending: false }).limit(limit);
  if (error) { if (missing(error)) return []; databaseError(error); }
  return (data ?? []).map(row => ({ tool: row.tool, ok: row.ok, createdAt: row.created_at }));
}

/* ---- Who holds a key ---------------------------------------------------------------------------- */

const USED_EVERY_MS = 60_000;

/** The person behind a key with what they may ask about, or null for a wrong, revoked or unknown key (or before the migration). */
export async function mcpCallerForKey(key: string | null, now = new Date()): Promise<{ member: Member; scopes: McpScope[] } | null> {
  if (!looksLikeMcpKey(key)) return null;
  const client = createPrivilegedClient();
  const { data: access, error } = await client.from("pw_mcp_access").select("employee_id,scopes,revoked_at,last_used_at").eq("key_hash", hashMcpKey(key)).maybeSingle();
  if (error) { if (missing(error)) return null; databaseError(error); }
  if (!access || access.revoked_at) return null;
  const member = await memberById(access.employee_id);
  // Only BOD and Admin WAM: a key kept by someone who lost the role stops working.
  if (!member || !mayUseMcp(member)) return null;
  // Last used, at most once a minute so a busy conversation is not a write per question.
  if (!access.last_used_at || now.getTime() - Date.parse(access.last_used_at) >= USED_EVERY_MS) {
    await client.from("pw_mcp_access").update({ last_used_at: now.toISOString() }).eq("employee_id", access.employee_id);
  }
  return { member, scopes: normalizeScopes(access.scopes ?? []) };
}

/** As currentMember, for the key's owner: the account and the employee must both be active. */
export async function memberForKey(key: string): Promise<Member | null> {
  return (await mcpCallerForKey(key))?.member ?? null;
}

async function memberById(employeeId: string): Promise<Member | null> {
  const columns = "active,must_change_password,employees(id,full_name,nickname,department,position,active)";
  const account = (select: string) => createPrivilegedClient().from("pw_accounts").select(select).eq("employee_id", employeeId).maybeSingle();
  let { data: found, error } = await account(`${columns},photo_key,photo_updated_at`);
  if (error && photoColumnMissing(error)) ({ data: found, error } = await account(columns));
  if (error) { if (notMigrated(error)) return null; databaseError(error); }
  const data = found as unknown as { active: boolean; must_change_password: boolean; photo_key?: string | null; photo_updated_at?: string | null; employees: unknown } | null;
  const person = data?.employees as { id: string; full_name: string; nickname: string; department: string; position: string; active: boolean } | null;
  if (!data || !person || !data.active || !person.active) return null;
  return {
    id: person.id, name: person.full_name, nickname: person.nickname, department: person.department, position: person.position, mustChangePassword: data.must_change_password, roles: await rolesOf(person.id),
    photo: photoPath({ id: person.id, photoKey: data.photo_key ?? null, photoUpdatedAt: data.photo_updated_at ?? null }),
  };
}

/** Arguments as they go in the log: a few short plain values, never anything long. */
function loggable(args: Record<string, unknown>): Record<string, string | number | boolean | null> {
  return Object.fromEntries(Object.entries(args).slice(0, 10).map(([name, value]) => [
    name.slice(0, 40),
    typeof value === "string" ? value.slice(0, 200) : typeof value === "number" || typeof value === "boolean" ? value : null,
  ]));
}

async function logCall(employeeId: string, tool: string, args: Record<string, unknown>, ok: boolean): Promise<void> {
  await createPrivilegedClient().from("pw_mcp_log").insert({ employee_id: employeeId, tool: tool.slice(0, 80), arguments: loggable(args), ok });
}

/* ---- HTTP --------------------------------------------------------------------------------------- */

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
const MAX_BODY = 100_000;
const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, "Content-Type": "application/json; charset=utf-8", ...extra } });

/** Whatever the method other than POST: this server only answers POST (no event stream). */
export const mcpMethodNotAllowed = () => json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Gunakan POST." } }, 405, { Allow: "POST" });

/** The key from the address (`/api/mcp/<key>`) or from `Authorization: Bearer <key>`. */
export async function mcpPost(request: Request, keyFromPath: string | null): Promise<Response> {
  const key = keyFromPath ?? bearerKey(request.headers.get("authorization"));
  let caller: Awaited<ReturnType<typeof mcpCallerForKey>> = null;
  try { caller = await mcpCallerForKey(key); }
  catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Layanan belum dapat memproses permintaan. Coba lagi sebentar." } }, 503); }
  if (!caller) return json(unauthorizedBody(), 401);

  const length = request.headers.get("content-length");
  if (length && Number(length) > MAX_BODY) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Isi permintaan terlalu besar." } }, 413);
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Isi permintaan terlalu besar." } }, 413);

  const { member, scopes } = caller;
  const reply = await handleMcpText(text, {
    tools: mcpTools, scopes, context: member,
    onCall: (tool, args, ok) => logCall(member.id, tool, args, ok),
    failureText: error => error instanceof ServiceError ? error.message : "Data belum dapat diambil. Coba lagi sebentar.",
  });
  if (reply.status === 202 || reply.body === null) return new Response(null, { status: 202, headers: HEADERS });
  return json(reply.body, reply.status);
}
