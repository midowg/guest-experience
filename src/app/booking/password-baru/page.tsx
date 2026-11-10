import { redirect } from "next/navigation";
import { BookingNewPassword } from "@/components/booking/BookingAuth";
import css from "@/components/booking/booking.module.css";
import { safePraWamNext } from "@/lib/pra-wam/session-token";
import { bookingPath } from "@/lib/routes";
import { requireBookingPage } from "@/lib/server/booking/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buat password baru" };

/** After signing in with the first password: pick a new one, or skip for now. Anyone else goes straight on. */
export default async function BookingNewPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const asked = safePraWamNext((await searchParams).next);
  const next = asked?.startsWith(bookingPath.home) ? asked : bookingPath.home;
  const member = await requireBookingPage(bookingPath.newPassword(next));
  if (!member.mustChangePassword) redirect(next);
  return <div className={css.app}><BookingNewPassword next={next} /></div>;
}
