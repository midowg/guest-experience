/*
 * Who opens what in WG Coffee (25 Nov 2026). Every active employee with an account claims
 * drinks. Mode GA (the tablet for meeting orders) is for the GA group, which Data karyawan knows as
 * the category "dw" (Daily Worker, "ga" before 13 Nov 2026), for Admin Booking (the role "ga": the
 * administration staff), and for whoever holds the WG Coffee admin grant. Pure, so it is
 * tested without a server.
 */

export function opensGaMode(who: { category?: string | null; roles?: readonly string[]; holdsCoffee: boolean }): boolean {
  return who.holdsCoffee || who.category === "dw" || who.category === "ga" || (who.roles ?? []).includes("ga");
}

/**
 * The name a claimant sees for whoever processed their order ("Selesai oleh Dewi"): the nickname,
 * else the first name; the super admin has no employee row and shows as "Super admin".
 */
export function processorLabel(who: { name?: string | null; nickname?: string | null; superAdmin?: boolean }): string {
  if (who.superAdmin) return "Super admin";
  return who.nickname?.trim() || who.name?.trim().split(/\s+/)[0] || "Admin";
}

/** The first name, for short lines ("Rina · Café Latte"). */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? "";
