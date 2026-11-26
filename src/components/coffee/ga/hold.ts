import { ICE_LEVELS, SUGAR_LEVELS, drinkBySlug, type Ice, type Sugar, type Temperature } from "@/lib/coffee/menu";
import { GUEST_NAME_MAX } from "@/lib/coffee/schemas";
import { MAX_LINES, MAX_QTY, type Draft, type Line } from "./model";

/*
 * "Serahkan ke tamu" must outlive a reload (audit F3-01): while a guest holds the tablet, the
 * meeting it was handed over for, GA's drinks that were not sent yet and what the guests picked
 * so far are kept in this tab's sessionStorage, and a small cookie tells the server that the
 * tablet is in guest mode. The server then sends no GA data at all with the page (no orders, no
 * employees), and the page opens straight on the menu book again.
 *
 * What is kept holds no more than the book itself shows (the room, the PIC's name, the guest's
 * company) plus GA's own unsent rows; it is read back as untrusted text and checked row by row.
 */

/** Set while a guest holds the tablet. Read by the page on the server; it carries nothing but "1". */
export const HOLD_COOKIE = "coffee_ga_tamu";
export const HOLD_KEY = "coffee:ga:tamu";

/** One drink a guest picked in the book (not yet in GA's order panel). */
export type Pick = { id: string; slug: string; temperature: Temperature; sugar: Sugar; ice: Ice; name: string };
export type BookState = { open: boolean; picks: Pick[] };
export type Hold = { draft: Draft; lines: Line[]; book: BookState };

const text = (value: unknown, max: number): string | undefined => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
const drinkOf = (value: Record<string, unknown>) => {
  const drink = typeof value.slug === "string" ? drinkBySlug(value.slug) : undefined;
  if (!drink) return null;
  const temperature = drink.temperatures.includes(value.temperature as Temperature) ? value.temperature as Temperature : drink.temperatures[0];
  const sugar = SUGAR_LEVELS.includes(value.sugar as Sugar) ? value.sugar as Sugar : "Normal";
  const ice = temperature === "es" && ICE_LEVELS.includes(value.ice as Ice) ? value.ice as Ice : "Normal";
  return { slug: drink.slug, temperature, sugar, ice };
};
const rows = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];

/** What was kept, made safe to draw: anything that does not look like it was written here is dropped. */
export function parseHold(raw: string | null | undefined): Hold | null {
  let value: unknown;
  try { value = JSON.parse(raw ?? ""); } catch { return null; }
  const kept = value as { draft?: Record<string, unknown>; lines?: unknown; book?: { open?: unknown; picks?: unknown } } | null;
  const from = kept?.draft, pic = from?.pic as Record<string, unknown> | undefined, parent = from?.parent as Record<string, unknown> | undefined;
  const room = text(from?.room, 80), picId = text(pic?.id, 60), picName = text(pic?.name, 200);
  if (!from || !room || !picId || !picName) return null;
  const count = Number(from.guestCount);
  const draft: Draft = {
    room, spot: text(from.spot, 40), pic: { id: picId, name: picName }, guest: text(from.guest, 120),
    guestCount: Number.isInteger(count) && count >= 1 && count <= 500 ? count : undefined,
    ...(text(parent?.id, 60) && text(parent?.no, 20) ? { parent: { id: text(parent?.id, 60)!, no: text(parent?.no, 20)! } } : {}),
  };
  const lines: Line[] = [];
  for (const [index, item] of rows(kept?.lines).slice(0, MAX_LINES).entries()) {
    const drink = drinkOf(item);
    if (!drink) continue;
    const person = item.person as Record<string, unknown> | undefined;
    const team = item.for === "tim" && text(person?.id, 60) && text(person?.name, 200);
    const qty = Number(item.qty);
    lines.push({
      id: text(item.id, 40) ?? `k${index}`, ...drink, for: team ? "tim" : "tamu", qty: Number.isInteger(qty) && qty >= 1 && qty <= MAX_QTY ? qty : 1,
      ...(team ? { person: { id: text(person?.id, 60)!, name: text(person?.name, 200)! } } : { guestName: text(item.guestName, GUEST_NAME_MAX) }),
    });
  }
  const picks: Pick[] = [];
  for (const [index, item] of rows(kept?.book?.picks).slice(0, MAX_LINES).entries()) {
    const drink = drinkOf(item);
    if (drink) picks.push({ id: text(item.id, 40) ?? `p${index}`, ...drink, name: typeof item.name === "string" ? item.name.slice(0, GUEST_NAME_MAX) : "" });
  }
  return { draft, lines, book: { open: kept?.book?.open === true, picks } };
}

const storage = (): Storage | null => { try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; } };
const cookie = (on: boolean) => { try { document.cookie = `${HOLD_COOKIE}=${on ? "1" : ""}; path=/; max-age=${on ? 43_200 : 0}; samesite=lax`; } catch { /* no cookies: the page still restores from the tab's storage */ } };

export function readHold(): Hold | null {
  try { return parseHold(storage()?.getItem(HOLD_KEY)); } catch { return null; }
}
/** Guest mode is on: remember it. `hold` null: the tablet is locked on the cover with nothing to restore. */
export function keepHold(hold: Hold | null): void {
  cookie(true);
  try { if (hold) storage()?.setItem(HOLD_KEY, JSON.stringify(hold)); } catch { /* storage full or closed: the cookie still keeps the tablet on the cover */ }
}
/** Guest mode is over (the GA officer left the book). */
export function dropHold(): void {
  cookie(false);
  try { storage()?.removeItem(HOLD_KEY); } catch { /* nothing kept */ }
}
/** Was guest mode on, by the cookie (for the first paint in the browser when the server did not say)? */
export const heldNow = (): boolean => typeof document !== "undefined" && document.cookie.split("; ").includes(`${HOLD_COOKIE}=1`);
