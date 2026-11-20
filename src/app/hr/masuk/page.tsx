import { redirect } from "next/navigation";
import { BookingLogin } from "@/components/booking/BookingAuth";
import css from "@/components/booking/booking.module.css";
import hr from "@/components/hr/hr.module.css";
import { safePraWamNext } from "@/lib/pra-wam/session-token";
import { hrPath } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { currentMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk" };

/** Masuk: WG People's own sign-in page (the same employee account). Only an HR page may be the way back. */
export default async function HrSignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const asked = safePraWamNext((await searchParams).next);
  const next = asked?.startsWith(hrPath.home) ? asked : null;
  if (isSupabaseConfigured() && await currentMember()) redirect(next ?? hrPath.home);
  return <div className={`${css.app} ${hr.bk}`}><BookingLogin next={next} app="hr" /></div>;
}
