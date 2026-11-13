import "server-only";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { adminAuthConfig, type AdminRole } from "@/lib/admin-token";
import { ADMIN_PATH_HEADER, areaOfPath, mayOpenArea } from "@/lib/admin-access";
import { ServiceError } from "./config";
import { actorOpensEvent, currentAdmin, eventForAccess, type AdminActor } from "./admin-actor";

// src/proxy.ts already turns unauthenticated requests away; these checks are the second layer,
// so a matcher mistake never exposes a page or API on its own.
// 13 Nov 2026: a personal admin (their own WAM account) also needs a grant for the part of the
// admin the request is in: proxy passes the path along (ADMIN_PATH_HEADER), and an unknown path
// is closed to them. The super admin and, before migration 202611130012, the shared password open everything.

/** The signed-in role, or null. */
export async function adminRole(): Promise<AdminRole | null> {
  return (await currentAdmin())?.role ?? null;
}
export async function hasAdminSession(): Promise<boolean> {
  return (await adminRole()) !== null;
}
export { currentAdmin, type AdminActor };

async function requestPath(): Promise<string | null> {
  try { return (await headers()).get(ADMIN_PATH_HEADER); } catch { return null; }
}
/** Does the request's part of the admin open for this actor? */
async function opensHere(actor: AdminActor): Promise<boolean> {
  return actor.kind !== "person" || mayOpenArea(actor.grant, areaOfPath(await requestPath()));
}

export async function requireAdminPage(): Promise<AdminRole> {
  const actor = await currentAdmin();
  if (!actor) redirect("/admin/login");
  if (!(await opensHere(actor))) notFound();
  return actor.role;
}

export async function requireApiAdmin(): Promise<AdminRole> {
  if (!adminAuthConfig()) throw new ServiceError(503, "Login admin belum disiapkan. Isi ADMIN_PASSWORD dan ADMIN_SESSION_SECRET pada server.");
  const actor = await currentAdmin();
  if (!actor) throw new ServiceError(401, "Sesi berakhir. Masuk kembali sebelum melanjutkan.");
  if (!(await opensHere(actor))) throw new ServiceError(403, "Akun Anda belum diberi akses ke bagian ini. Minta super admin.");
  return actor.role;
}

export async function requireSuperAdmin(): Promise<void> {
  if ((await requireApiAdmin()) !== "super") throw new ServiceError(403, "Hanya super admin yang dapat melakukan ini.");
}

/**
 * An event the admin may not open does not exist for them: its pages are 404 and its APIs answer
 * as if the id were unknown (hidden by the super admin, or, for a personal admin, outside their grant).
 */
async function opensEvent(eventId: string): Promise<boolean> {
  const actor = await currentAdmin();
  if (!actor || actor.kind === "super") return true;
  const event = await eventForAccess(eventId);
  return !event || actorOpensEvent(actor, event);
}
export async function requireEventAccess(eventId: string): Promise<AdminRole> {
  const role = await requireApiAdmin();
  if (!(await opensEvent(eventId))) throw new ServiceError(404, "Acara tidak ditemukan.");
  return role;
}
export async function requireEventPage(eventId: string): Promise<AdminRole> {
  const role = await requireAdminPage();
  if (!(await opensEvent(eventId))) notFound();
  return role;
}

export type ClientInfo = { ip: string | null; country: string | null; region: string | null; city: string | null; userAgent: string | null };

function header(request: Request, name: string, max: number): string | null {
  const raw = request.headers.get(name)?.trim();
  if (!raw) return null;
  let value = raw;
  // Vercel URL-encodes city names (e.g. "S%C3%A3o%20Paulo").
  try { value = decodeURIComponent(raw); } catch { /* keep the raw header */ }
  return value.slice(0, max);
}

/** Vercel overwrites x-vercel-* headers; elsewhere forwarded-for is untrusted and only informational. */
export function clientInfo(request: Request): ClientInfo {
  const onVercel = process.env.VERCEL === "1";
  const forwarded = request.headers.get(onVercel ? "x-vercel-forwarded-for" : "x-forwarded-for")?.split(",")[0].trim();
  return {
    ip: forwarded && isIP(forwarded) ? forwarded : null,
    country: onVercel ? header(request, "x-vercel-ip-country", 8) : null,
    region: onVercel ? header(request, "x-vercel-ip-country-region", 64) : null,
    city: onVercel ? header(request, "x-vercel-ip-city", 120) : null,
    userAgent: header(request, "user-agent", 500),
  };
}
