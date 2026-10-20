import "server-only";
import { isIP } from "node:net";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { adminAuthConfig, SESSION_COOKIE, verifySession, type AdminRole } from "@/lib/admin-token";
import { ServiceError } from "./config";
import { isHiddenFromAdmins } from "./event-visibility";

// src/proxy.ts already turns unauthenticated requests away; these checks are the second layer,
// so a matcher mistake never exposes a page or API on its own.

/** The signed-in role, or null. */
export async function adminRole(): Promise<AdminRole | null> {
  const store = await cookies();
  return verifySession(adminAuthConfig(), store.get(SESSION_COOKIE)?.value);
}
export async function hasAdminSession(): Promise<boolean> {
  return (await adminRole()) !== null;
}

export async function requireAdminPage(): Promise<AdminRole> {
  const role = await adminRole();
  if (!role) redirect("/admin/login");
  return role;
}

export async function requireApiAdmin(): Promise<AdminRole> {
  if (!adminAuthConfig()) throw new ServiceError(503, "Login admin belum disiapkan. Isi ADMIN_PASSWORD dan ADMIN_SESSION_SECRET pada server.");
  const role = await adminRole();
  if (!role) throw new ServiceError(401, "Sesi berakhir. Masuk kembali sebelum melanjutkan.");
  return role;
}

export async function requireSuperAdmin(): Promise<void> {
  if ((await requireApiAdmin()) !== "super") throw new ServiceError(403, "Hanya super admin yang dapat melakukan ini.");
}

/**
 * An event hidden by the super admin does not exist for a regular admin: its pages are 404 and
 * its APIs answer as if the id were unknown.
 */
export async function requireEventAccess(eventId: string): Promise<AdminRole> {
  const role = await requireApiAdmin();
  if (role !== "super" && await isHiddenFromAdmins(eventId)) throw new ServiceError(404, "Acara tidak ditemukan.");
  return role;
}
export async function requireEventPage(eventId: string): Promise<AdminRole> {
  const role = await requireAdminPage();
  if (role !== "super" && await isHiddenFromAdmins(eventId)) notFound();
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
