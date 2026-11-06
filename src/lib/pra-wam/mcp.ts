import { seesAllSessions, type PraWamRole } from "./roles";

/*
 * MCP WAM (migration 202611060010): BOD and a few chosen people connect Claude or ChatGPT to WAM
 * and ask about its data. This part needs no database: what a person may be allowed to ask about
 * (scopes), the tools and their arguments, and the JSON-RPC conversation of the Model Context
 * Protocol (Streamable HTTP, stateless, plain JSON answers). Read only. The server
 * (src/lib/server/pra-wam/mcp.ts) runs each tool as the key's owner, so the app's own rules on
 * drafts, survey privacy and Data HR still decide what comes back.
 */

export const MCP_SCOPES = ["ringkasan", "sesi", "kehadiran", "peserta", "booking", "dokumen", "survei", "permintaan", "pengumuman"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];
export const mcpScopeLabels: Record<McpScope, { label: string; hint: string }> = {
  ringkasan: { label: "Ringkasan", hint: "Angka penting dan hal yang perlu perhatian" },
  sesi: { label: "Sesi", hint: "Daftar dan detail sesi" },
  kehadiran: { label: "Kehadiran", hint: "Hadir per forum, per departemen, dan daftar hadir" },
  peserta: { label: "Profil peserta", hint: "Daftar peserta dan profil per orang" },
  booking: { label: "Booking ruang", hint: "Siapa memakai ruang apa pada satu tanggal" },
  dokumen: { label: "Dokumen", hint: "Judul dan nama berkas, tanpa tautan unduhan" },
  survei: { label: "Hasil survei", hint: "Rekap kuesioner tanpa nama" },
  permintaan: { label: "Permintaan jadwal", hint: "Permintaan pindah jadwal" },
  pengumuman: { label: "Pengumuman", hint: "Pengumuman dan notifikasi" },
};
/** A new grant: everything but personal profiles, which an admin ticks on purpose. */
export const DEFAULT_MCP_SCOPES: readonly McpScope[] = MCP_SCOPES.filter(scope => scope !== "peserta");
/** Known scopes, each once, in the usual order. */
export const normalizeScopes = (list: readonly string[]): McpScope[] => MCP_SCOPES.filter(scope => list.includes(scope));
export const scopeSummary = (scopes: readonly string[]) => normalizeScopes(scopes).map(scope => mcpScopeLabels[scope].label).join(", ") || "Tanpa cakupan";

/* ---- Protocol ----------------------------------------------------------------------------------- */

export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
/** The client's version when we speak it, else our newest. */
export const negotiateVersion = (asked: unknown): string =>
  typeof asked === "string" && (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0];

export const MCP_SERVER_INFO = { name: "wam-werkudara", title: "WAM Werkudara", version: "1.0.0" } as const;
export const MCP_INSTRUCTIONS = [
  "Data aplikasi WAM Werkudara (Pra WAM November–Desember 2026 dan WAM 2027), hanya baca.",
  "Semua jam dalam WIB. Jawaban mengikuti hak akses pemilik tautan: yang tidak boleh ia lihat di aplikasi juga tidak muncul di sini.",
  "Hasil survei selalu tanpa nama. Jawab dalam Bahasa Indonesia yang ringkas.",
].join(" ");

export const JSON_RPC = { parseError: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 } as const;

/** Bad arguments for a tool: answered as a JSON-RPC error (-32602) with this message. */
export class McpInvalidParams extends Error {
  constructor(message: string) { super(message); this.name = "McpInvalidParams"; }
}

/* ---- Tools -------------------------------------------------------------------------------------- */

type WithRoles = { roles: readonly PraWamRole[] };
export type JsonSchema = Record<string, unknown>;
export type McpToolSpec = {
  name: string; title: string; description: string; scope: McpScope; inputSchema: JsonSchema;
  /** The app's own rule for who may read this (a page the person could open); default everyone. */
  allowed?: (who: WithRoles) => boolean;
};
export type McpTool<C extends WithRoles> = McpToolSpec & {
  /** The data as a plain JSON object; throws McpInvalidParams for bad arguments, anything else is a tool failure. */
  run: (args: Record<string, unknown>, context: C) => Promise<Record<string, unknown>>;
};

const DATE = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const UUID = { type: "string", format: "uuid" };
const object = (properties: Record<string, JsonSchema> = {}, required: string[] = []): JsonSchema =>
  ({ type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false });

export const mcpToolSpecs: readonly McpToolSpec[] = [
  {
    name: "ringkasan", title: "Ringkasan WAM", scope: "ringkasan", allowed: seesAllSessions,
    description: "Angka penting Pra WAM: jumlah peserta, departemen, akun yang sudah masuk, sesi terbit dan draf, permintaan jadwal terbuka, forum yang sedang atau terakhir berjalan, dan hal yang perlu perhatian BOD.",
    inputSchema: object(),
  },
  {
    name: "daftar_sesi", title: "Daftar sesi", scope: "sesi",
    description: "Sesi Pra WAM (forum, rapat, acara) dengan tanggal, jam WIB, ruang, dan jumlah peserta. Bisa disaring menurut status dan rentang tanggal (YYYY-MM-DD, WIB).",
    inputSchema: object({
      status: { type: "string", enum: ["draf", "terbit", "batal"], description: "Draf, terbit, atau batal. Kosongkan untuk semua." },
      dari: { ...DATE, description: "Tanggal awal (YYYY-MM-DD), termasuk." },
      sampai: { ...DATE, description: "Tanggal akhir (YYYY-MM-DD), termasuk." },
    }),
  },
  {
    name: "detail_sesi", title: "Detail sesi", scope: "sesi",
    description: "Satu sesi lengkap: deskripsi, waktu, ruang atau lokasi, dan nama peserta yang diundang (kalau boleh dilihat). Ambil id dari daftar_sesi.",
    inputSchema: object({ id: { ...UUID, description: "Id sesi dari daftar_sesi." } }, ["id"]),
  },
  {
    name: "kehadiran_per_departemen", title: "Kehadiran per departemen", scope: "kehadiran", allowed: seesAllSessions,
    description: "Kehadiran forum yang sudah dimulai: per forum (hadir dari diundang) dan per departemen (jumlah hadir, diundang, persen, lead).",
    inputSchema: object(),
  },
  {
    name: "daftar_hadir", title: "Daftar hadir sesi", scope: "kehadiran", allowed: seesAllSessions,
    description: "Siapa yang hadir dan belum hadir di satu sesi, dengan jam masuk (WIB) dan caranya.",
    inputSchema: object({ sesi_id: { ...UUID, description: "Id sesi dari daftar_sesi." } }, ["sesi_id"]),
  },
  {
    name: "daftar_peserta", title: "Daftar peserta", scope: "peserta", allowed: seesAllSessions,
    description: "Semua peserta per departemen dengan jabatan, lead, dan status akun. Bisa disaring dengan nama departemen.",
    inputSchema: object({ departemen: { type: "string", maxLength: 120, description: "Sebagian nama departemen, mis. \"Sales\"." } }),
  },
  {
    name: "profil_peserta", title: "Profil peserta", scope: "peserta", allowed: seesAllSessions,
    description: "Profil satu peserta: departemen, jabatan, unit, peran, status akun, dan kehadirannya di forum. Ambil id dari daftar_peserta.",
    inputSchema: object({ id: { ...UUID, description: "Id peserta dari daftar_peserta." } }, ["id"]),
  },
  {
    name: "booking_ruang", title: "Booking ruang", scope: "booking",
    description: "Pemakaian ruang pada satu tanggal: booking dan sesi Pra WAM, dengan jam WIB, judul, dan pemesan.",
    inputSchema: object({ tanggal: { ...DATE, description: "Tanggal (YYYY-MM-DD, WIB)." } }, ["tanggal"]),
  },
  {
    name: "dokumen", title: "Dokumen", scope: "dokumen",
    description: "Dokumen yang boleh dibaca: judul, nama berkas, ukuran, sesi, pengunggah, dan tanggal. Tanpa tautan unduhan; unduh lewat aplikasi.",
    inputSchema: object({ sesi_id: { ...UUID, description: "Hanya dokumen sesi ini (opsional)." } }),
  },
  {
    name: "permintaan_jadwal", title: "Permintaan jadwal", scope: "permintaan", allowed: seesAllSessions,
    description: "Permintaan pindah jadwal sesi. Panitia melihat rinciannya; BOD melihat jumlah yang menunggu panitia.",
    inputSchema: object(),
  },
  {
    name: "pengumuman", title: "Pengumuman", scope: "pengumuman",
    description: "Pengumuman. Panitia melihat yang terkirim beserta jumlah pembaca; yang lain melihat notifikasi yang ia terima.",
    inputSchema: object(),
  },
  {
    name: "hasil_survei", title: "Hasil survei", scope: "survei", allowed: seesAllSessions,
    description: "Rekap kuesioner tanpa nama: partisipasi, lalu per pertanyaan jumlah pilihan atau kutipan. Bisa per bagian atau per departemen.",
    inputSchema: object({
      bagian: { type: "string", maxLength: 120, description: "Judul atau kunci bagian (opsional)." },
      departemen: { type: "string", maxLength: 120, description: "Nama departemen persis (opsional)." },
    }),
  },
];

/** The tools this caller sees: within their scopes and allowed by their roles. */
export function visibleTools<T extends McpToolSpec>(tools: readonly T[], scopes: readonly string[], who: WithRoles): T[] {
  return tools.filter(tool => scopes.includes(tool.scope) && (tool.allowed?.(who) ?? true));
}

/* ---- Arguments ---------------------------------------------------------------------------------- */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function realDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

type Args = Record<string, unknown>;
const empty = (value: unknown) => value === undefined || value === null || value === "";

/* Readers for one argument; each throws McpInvalidParams with a sentence the model can act on. */
export function argText(args: Args, key: string, max = 120): string | null {
  const value = args[key];
  if (empty(value)) return null;
  if (typeof value !== "string" || value.length > max) throw new McpInvalidParams(`${key} harus teks, paling panjang ${max} karakter.`);
  return value.trim() || null;
}
export function argUuid(args: Args, key: string, required: true): string;
export function argUuid(args: Args, key: string, required?: false): string | null;
export function argUuid(args: Args, key: string, required = false): string | null {
  const value = args[key];
  if (empty(value) && !required) return null;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new McpInvalidParams(`${key} harus id (uuid) yang valid.`);
  return value.toLowerCase();
}
export function argDate(args: Args, key: string, required: true): string;
export function argDate(args: Args, key: string, required?: false): string | null;
export function argDate(args: Args, key: string, required = false): string | null {
  const value = args[key];
  if (empty(value) && !required) return null;
  if (typeof value !== "string" || !realDate(value)) throw new McpInvalidParams(`${key} harus tanggal YYYY-MM-DD.`);
  return value;
}
export function argChoice<T extends string>(args: Args, key: string, choices: readonly T[]): T | null {
  const value = args[key];
  if (empty(value)) return null;
  if (typeof value !== "string" || !choices.includes(value as T)) throw new McpInvalidParams(`${key} harus salah satu dari: ${choices.join(", ")}.`);
  return value as T;
}

/* ---- JSON-RPC dispatcher ------------------------------------------------------------------------ */

type Id = string | number;
type RpcResponse = { jsonrpc: "2.0"; id: Id | null; result?: unknown; error?: { code: number; message: string } };
export type McpServer<C extends WithRoles> = {
  tools: readonly McpTool<C>[];
  scopes: readonly string[];
  context: C;
  /** Called once per tools/call that reached a tool (for the log); its own failure is ignored. */
  onCall?: (tool: string, args: Record<string, unknown>, ok: boolean) => Promise<void> | void;
  /** The sentence the model reads when a tool fails; default a general one. */
  failureText?: (error: unknown) => string;
};
/** What the HTTP layer sends: 202 with no body when nothing needs an answer (notifications only). */
export type McpReply = { status: 200 | 202 | 400; body: RpcResponse | RpcResponse[] | null };

const fail = (id: Id | null, code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });
const ok = (id: Id, result: unknown): RpcResponse => ({ jsonrpc: "2.0", id, result });
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

async function callTool<C extends WithRoles>(id: Id, params: unknown, server: McpServer<C>): Promise<RpcResponse> {
  if (!isObject(params) || typeof params.name !== "string") return fail(id, JSON_RPC.invalidParams, "tools/call butuh params.name.");
  if (params.arguments !== undefined && params.arguments !== null && !isObject(params.arguments)) return fail(id, JSON_RPC.invalidParams, "params.arguments harus objek.");
  const tool = visibleTools(server.tools, server.scopes, server.context).find(item => item.name === params.name);
  if (!tool) return fail(id, JSON_RPC.invalidParams, `Tool tidak dikenal atau tidak diizinkan: ${params.name}.`);
  const args = (params.arguments ?? {}) as Record<string, unknown>;
  const log = async (success: boolean) => { try { await server.onCall?.(tool.name, args, success); } catch { /* the answer matters more than its log */ } };
  try {
    const data = await tool.run(args, server.context);
    await log(true);
    return ok(id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data });
  } catch (error) {
    await log(false);
    if (error instanceof McpInvalidParams) return fail(id, JSON_RPC.invalidParams, error.message);
    const text = server.failureText?.(error) ?? "Data belum dapat diambil. Coba lagi sebentar.";
    return ok(id, { content: [{ type: "text", text }], isError: true });
  }
}

/** One message: an answer, or null for a notification (or a response the client sent us). */
async function answer<C extends WithRoles>(message: unknown, server: McpServer<C>): Promise<RpcResponse | null> {
  if (!isObject(message) || message.jsonrpc !== "2.0") return fail(null, JSON_RPC.invalidRequest, "Permintaan JSON-RPC tidak valid.");
  if (!("method" in message)) return null; // a client's response to us; we never ask, so nothing to do
  const hasId = "id" in message;
  const id = message.id;
  if (typeof message.method !== "string" || (hasId && typeof id !== "string" && typeof id !== "number")) {
    return fail(hasId && (typeof id === "string" || typeof id === "number") ? id : null, JSON_RPC.invalidRequest, "Permintaan JSON-RPC tidak valid.");
  }
  if (!hasId) return null; // notifications/initialized, notifications/cancelled, …
  const requestId = id as Id;
  switch (message.method) {
    case "initialize": {
      const params = isObject(message.params) ? message.params : {};
      return ok(requestId, {
        protocolVersion: negotiateVersion(params.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: MCP_SERVER_INFO,
        instructions: MCP_INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(requestId, {});
    case "tools/list":
      return ok(requestId, {
        tools: visibleTools(server.tools, server.scopes, server.context).map(tool => ({
          name: tool.name, title: tool.title, description: tool.description, inputSchema: tool.inputSchema,
          annotations: { title: tool.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        })),
      });
    case "tools/call":
      return callTool(requestId, message.params, server);
    default:
      return fail(requestId, JSON_RPC.methodNotFound, `Metode tidak dikenal: ${message.method}.`);
  }
}

/** A parsed request body (one message or a batch) to what the HTTP layer sends back. */
export async function handleMcp<C extends WithRoles>(payload: unknown, server: McpServer<C>): Promise<McpReply> {
  if (Array.isArray(payload)) {
    if (!payload.length) return { status: 400, body: fail(null, JSON_RPC.invalidRequest, "Batch kosong.") };
    const answers = (await Promise.all(payload.map(message => answer(message, server)))).filter((item): item is RpcResponse => item !== null);
    return answers.length ? { status: 200, body: answers } : { status: 202, body: null };
  }
  const single = await answer(payload, server);
  return single ? { status: 200, body: single } : { status: 202, body: null };
}

/** The raw body text: a parse error when it is not JSON. */
export async function handleMcpText<C extends WithRoles>(text: string, server: McpServer<C>): Promise<McpReply> {
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { return { status: 400, body: fail(null, JSON_RPC.parseError, "Isi permintaan bukan JSON.") }; }
  return handleMcp(payload, server);
}

/** The answer to a missing, wrong or revoked key: the same every time, so nobody learns which keys existed. */
export const unauthorizedBody = (): RpcResponse => fail(null, -32001, "Tautan MCP tidak berlaku. Minta tautan baru di Profil WAM.");

/* ---- Addresses (kept here while src/lib/routes.ts is being changed elsewhere) ------------------- */

/** Admin WAM → Akses MCP. */
export const MCP_ADMIN_PATH = "/admin/wam/mcp";
/** GET the list, POST a grant; with an employee id, PATCH {action} or {scopes}. */
export const mcpAdminApi = (employeeId?: string) => `/api/admin/wam/mcp${employeeId ? `/${employeeId}` : ""}`;
/** POST: a new link for the signed-in person. */
export const MCP_KEY_API = "/api/wam/mcp-key";
/** Profil, at the Akses MCP card. */
export const MCP_PROFILE_ANCHOR = "/wam/account#mcp";
/** The tool's title for a log line ("Ringkasan WAM"); the name itself when it is not known. */
export const toolTitle = (name: string) => mcpToolSpecs.find(tool => tool.name === name)?.title ?? name;
