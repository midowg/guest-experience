/*
 * Money in WG Coffee (F9, 27 Nov 2026): the price of a drink and what was spent. Whole rupiah,
 * written the Indonesian way ("Rp 8.000"). One place for the format and for reading what the
 * pengelola types, so the Menu, Rekap, the files and the tests all agree. Pure.
 */

/** The largest price a drink may have (the database holds the same limit). */
export const PRICE_MAX = 10_000_000;

/** Thousands joined with a dot: 8000 → "8.000". */
export const groupThousands = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** "Rp 8.000", "Rp 0"; a minus sign in front for a negative amount. */
export function formatRupiah(amount: number): string {
  const whole = Math.round(amount);
  return `${whole < 0 ? "-" : ""}Rp ${groupThousands(String(Math.abs(whole)))}`;
}

/** The figure alone ("8.000"), for a column whose head already says Rp. */
export const formatAmount = (amount: number): string => groupThousands(String(Math.round(amount)));

export type PriceRead = { ok: true; value: number | null } | { ok: false; message: string };

/**
 * What the pengelola typed in "Harga satuan (Rp)": "8000", "8.000" or "Rp 8.000" is 8000; empty is
 * "not filled in yet" (null). A negative, a decimal ("8,5", "8.5"), letters, or more than PRICE_MAX
 * is refused with the sentence to show under the field.
 */
export function readPrice(text: string): PriceRead {
  const clean = text.trim().replace(/^rp\.?\s*/i, "").replace(/\s+/g, "");
  if (!clean) return { ok: true, value: null };
  if (clean.startsWith("-") || clean.startsWith("−")) return { ok: false, message: "Harga tidak boleh negatif." };
  if (clean.includes(",") || (clean.includes(".") && !/^\d{1,3}(\.\d{3})+$/.test(clean))) return { ok: false, message: "Isi rupiah penuh, tanpa koma atau sen. Contoh: 8.000." };
  if (!/^\d+(\.\d{3})*$/.test(clean)) return { ok: false, message: "Isi harga dengan angka saja. Contoh: 8.000." };
  const value = Number(clean.replace(/\./g, ""));
  if (value > PRICE_MAX) return { ok: false, message: `Harga paling besar ${formatRupiah(PRICE_MAX)}.` };
  return { ok: true, value };
}

/** A price as the field shows it: "8.000", or "" when there is none. */
export const priceText = (price: number | null | undefined): string => price == null ? "" : groupThousands(String(price));

/**
 * The field's text after a keystroke (`before`: what it said until now). Digits and well-formed
 * dots are regrouped ("8000" becomes "8.000", "8.0000" becomes "80.000") and a typed "Rp" is
 * dropped. A letter, a comma, a minus or a dot that cannot be a thousands separator ("8.5") stays
 * as typed, so the sentence under the field can say why it is refused instead of the key silently
 * changing the number. A deletion from a well-grouped number is regrouped too ("8.00" becomes "800").
 */
export function typedPrice(text: string, before = ""): string {
  const bare = text.replace(/^\s*rp\.?\s*/i, "");
  if (!/^[\d.\s]*$/.test(bare) || !/\d/.test(bare)) return text;
  const groups = bare.replace(/\s/g, "").split(".");
  const tail = groups.slice(1);
  const orderly = tail.every(group => /^\d{3,4}$/.test(group)) && tail.filter(group => group.length === 4).length <= 1;
  const shrinking = text.length < before.length && /^\d{1,3}(\.\d{3})*$/.test(before.trim());
  if (!orderly && !shrinking) return text;
  return groupThousands(groups.join("").replace(/^0+(?=\d)/, ""));
}

/** The starting prices read from the JumpStart JS Mini menu on 27 Nov 2026 (what migration 202612050001 seeds once). */
export const STARTING_PRICES: Record<string, number> = {
  americano: 8000, cappuccino: 8000, "cafe-latte": 8000, "cafe-mocha": 8000, "piccolo-latte": 8000, "milk-chocolate": 8000, "dark-chocolate": 8000,
  "matcha-espresso": 8000, "matcha-latte": 8000, espresso: 8900, "kopi-hitam": 6900, "kopi-susu": 6900,
};
