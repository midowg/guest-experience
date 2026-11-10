import "server-only";
import { redirect } from "next/navigation";
import { bookingPath } from "@/lib/routes";
import { currentMember, type Member } from "../pra-wam/session";

/*
 * Who is signed in to Booking Kantor. The account is the employee's own (the same one WAM uses:
 * one email, one password, one session cookie), but a stranger is sent to Booking Kantor's own
 * sign-in page, never to WAM's (11 Nov 2026).
 */

/** For pages: the signed-in person, or a trip to Booking Kantor's sign-in that comes back here. */
export async function requireBookingPage(here: string): Promise<Member> {
  const member = await currentMember();
  if (!member) redirect(bookingPath.login(here));
  return member;
}
