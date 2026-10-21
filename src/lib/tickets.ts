/** 22 URL-safe characters from 16 random bytes: the whole content of a guest's QR, besides the address. */
export function newTicketCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const isTicketCode = (value: string) => /^[A-Za-z0-9_-]{22,32}$/.test(value);

/**
 * The address in the QR. Scanned with any phone camera it opens the check-in page for a signed-in
 * admin; anyone else meets the login page and learns nothing about the guest.
 */
export function ticketScanUrl(origin: string, code: string) {
  return `${origin}/admin/checkin/${code}`;
}

/** The code from whatever a scanner read: the check-in address, or the bare code. */
export function codeFromScan(text: string): string | null {
  const value = text.trim();
  const match = value.match(/\/admin\/checkin\/([A-Za-z0-9_-]{22,32})(?:[/?#]|$)/);
  if (match) return match[1];
  return isTicketCode(value) ? value : null;
}

export type CheckinGuest = {
  rsvp_id: string; name: string; organization: string; party_size: number;
  allergy: string; access: string;
  ticket_id: string | null; checked_in_at: string | null;
};
