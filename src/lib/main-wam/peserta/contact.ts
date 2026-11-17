/*
 * "Hubungi" (L01 Bantuan kamar, L03 koordinator, P04 kontak panitia, Bantuan): a colleague's number
 * from Data karyawan as a phone call and a WhatsApp chat. Only people the event names as a contact
 * (a trip's coordinator, a session's panitia, Admin WAM's contacts) ever reach the page. Pure.
 */

/** A person to call: nama panggilan, what they do here, and their links (none without a number). */
export type Contact = { id: string; name: string; role: string; photo: string | null; tel: string | null; whatsapp: string | null };

/** Digits in the international form WhatsApp wants: "0812-3456 789" → "628123456789"; null when it is not a phone number. */
export function phoneDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  return /^\d{9,15}$/.test(digits) ? digits : null;
}

/** tel: and wa.me links of a number. */
export function contactLinks(raw: string | null | undefined): { tel: string | null; whatsapp: string | null } {
  const digits = phoneDigits(raw);
  return digits ? { tel: `tel:+${digits}`, whatsapp: `https://wa.me/${digits}` } : { tel: null, whatsapp: null };
}
