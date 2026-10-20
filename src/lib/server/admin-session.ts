import "server-only";
import { isIP } from "node:net";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuthConfig, SESSION_COOKIE, verifySession } from "@/lib/admin-token";
import { ServiceError } from "./config";

// src/proxy.ts already turns unauthenticated requests away; these checks are the second layer,
// so a matcher mistake never exposes a page or API on its own.

export async function hasAdminSession(): Promise<boolean> {
  const store = await cookies();
  return verifySession(adminAuthConfig(), store.get(SESSION_COOKIE)?.value);
}

export async function requireAdminPage(): Promise<void> {
  if (!(await hasAdminSession())) redirect("/admin/login");
}

export async function requireApiAdmin(): Promise<void> {
  if (!adminAuthConfig()) throw new ServiceError(503, "Login admin belum disiapkan. Isi ADMIN_PASSWORD dan ADMIN_SESSION_SECRET pada server.");
  if (!(await hasAdminSession())) throw new ServiceError(401, "Sesi berakhir. Masuk kembali sebelum melanjutkan.");
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
