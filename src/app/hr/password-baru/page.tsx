import { redirect } from "next/navigation";
import { BookingNewPassword } from "@/components/booking/BookingAuth";
import css from "@/components/booking/booking.module.css";
import hr from "@/components/hr/hr.module.css";
import { safePraWamNext } from "@/lib/pra-wam/session-token";
import { hrPath } from "@/lib/routes";
import { requireHrPage } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buat password baru" };

/** After signing in with the first password: pick a new one, or skip for now. Anyone else goes straight on. */
export default async function HrNewPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const asked = safePraWamNext((await searchParams).next);
  const next = asked?.startsWith(hrPath.home) ? asked : hrPath.home;
  const member = await requireHrPage(hrPath.newPassword(next));
  if (!member.mustChangePassword) redirect(next);
  return <div className={`${css.app} ${hr.bk}`}><BookingNewPassword next={next} app="hr" /></div>;
}
