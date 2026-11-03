import { AppraisalBoard } from "@/components/pra-wam/AppraisalBoard";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { Notice } from "@/components/ui";
import { appraisalRules, bookableDates, wibDate } from "@/lib/pra-wam/appraisal";
import { cancelsAnyBooking } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { daySchedule, myBookings } from "@/lib/server/pra-wam/appraisal";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Appraisal · Pra WAM", robots: { index: false } };

/** Who booked which room, per day, and the person's own bookings. */
export default async function AppraisalPage({ searchParams }: { searchParams: Promise<{ tanggal?: string }> }) {
  const { tanggal } = await searchParams;
  const member = await requireMemberPage(praWamPath.appraisal(tanggal));
  const now = new Date();
  const today = wibDate(now.toISOString());
  const dates = bookableDates(today);
  const date = tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal) && tanggal >= appraisalRules.periodStart && tanggal <= appraisalRules.periodEnd ? tanggal : dates[0] ?? today;
  const loaded = await Promise.all([daySchedule(date, member), myBookings(member, today)]).catch((error: unknown) => {
    if (error instanceof ServiceError) return error.message;
    throw error;
  });
  if (typeof loaded === "string") return <PraWamShell member={member} current="appraisal"><Notice tone="warning">{loaded}</Notice></PraWamShell>;
  const [schedule, mine] = loaded;
  return <PraWamShell member={member} current="appraisal">
    <AppraisalBoard canCancelAny={cancelsAnyBooking(member)} date={date} dates={dates.includes(date) ? dates : [date, ...dates]} now={now.toISOString()} rooms={schedule.rooms} bookings={schedule.bookings} mine={mine} viewerId={member.id} />
  </PraWamShell>;
}
