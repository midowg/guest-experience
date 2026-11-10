import { redirect } from "next/navigation";
import { BookingLogin } from "@/components/booking/BookingAuth";
import css from "@/components/booking/booking.module.css";
import { safePraWamNext } from "@/lib/pra-wam/session-token";
import { bookingPath } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { currentMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk" };

/** Masuk: Booking Kantor's own sign-in page. Only a Booking Kantor page may be the way back (else Beranda). */
export default async function BookingSignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const asked = safePraWamNext((await searchParams).next);
  const next = asked?.startsWith(bookingPath.home) ? asked : null;
  if (isSupabaseConfigured() && await currentMember()) redirect(next ?? bookingPath.home);
  return <div className={css.app}><BookingLogin next={next} /></div>;
}
