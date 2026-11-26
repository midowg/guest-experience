import { COFFEE_PATH, coffeePath } from "@/lib/routes";

/*
 * WG Coffee's employee app, the small rules around signing in and the one-time setup
 * (26 Nov 2026). Pure, so it is tested without a browser.
 */

/** Set by the browser once "Atur sekali" (pasang di layar utama, notifikasi) was walked through or skipped; the server reads it, so the menu never flashes first. */
export const SETUP_COOKIE = "coffee_atur";
/** What the browser writes to remember it (a year, for the app's own addresses only). */
export const setupCookie = () => `${SETUP_COOKIE}=1; path=${COFFEE_PATH}; max-age=31536000; samesite=lax`;

export type PhoneKind = "android" | "iphone";
/** Which install steps to show first; the person can switch. */
export const phoneKind = (userAgent: string | null | undefined): PhoneKind => /iPhone|iPad|iPod/i.test(userAgent ?? "") ? "iphone" : "android";

/** A page of the app: /coffee, then plain segments only. No dot (so no "..", no file), no "%" (nothing encoded), no empty segment. */
const APP_PAGE = new RegExp(`^${COFFEE_PATH}(/[A-Za-z0-9_-]+)*$`);

/**
 * Where signing in may lead back to: the app's own pages only (Menu, Pesanan saya, Mode GA), never
 * a sign-in page, another site or another app. Dot segments and anything encoded are refused: the
 * browser would straighten "/coffee/../admin" or "/coffee/%2e%2e/admin" into another app's address.
 * Files of the app (sw.js, the manifest, photos) are not pages either.
 */
export function safeCoffeeNext(value: string | null | undefined): string | null {
  if (!value || /[\\\s]/.test(value)) return null;
  const path = value.split(/[?#]/)[0];
  if (!APP_PAGE.test(path)) return null;
  // Belt and braces: what the browser will really open is still that page of the app.
  try { if (new URL(value, "http://x").pathname !== path) return null; } catch { return null; }
  if ([coffeePath.login(), coffeePath.forgot, coffeePath.newPassword()].some(page => path === page || path.startsWith(`${page}/`))) return null;
  return value;
}

/** "November", from a WIB month ("2026-11"). */
export function monthName(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1, 1)).toLocaleDateString("id-ID", { month: "long", timeZone: "UTC" });
}

/** The day the quota comes back: the first of the next WIB month, "Selasa, 1 Desember". */
export function resetDay(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 1)).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
