import { Plus } from "lucide-react";
import { AppraisalBoard } from "@/components/pra-wam/AppraisalBoard";
import { PraWamShell, ScreenHead } from "@/components/pra-wam/PraWamShell";
import { Notice } from "@/components/ui";
import { appraisalRules, bookableDates, clockLabel, wibDate } from "@/lib/pra-wam/appraisal";
import { cancelsAnyBooking } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { daySchedule, myBookings } from "@/lib/server/pra-wam/appraisal";
import { appraisalOpen } from "@/lib/server/pra-wam/events";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Book ruang · WAM", robots: { index: false } };

/** Book: the floor plan and who booked which room, per day, and the person's own bookings. */
export default async function BookPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: tanggal } = await searchParams;
  const member = await requireMemberPage(praWamPath.appraisal(tanggal));
  const now = new Date();
  const today = wibDate(now.toISOString());
  const dates = bookableDates(today);
  const date = tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal) && tanggal >= appraisalRules.periodStart && tanggal <= appraisalRules.periodEnd ? tanggal : dates[0] ?? today;
  const loaded = await Promise.all([daySchedule(date, member), myBookings(member, today), appraisalOpen()]).catch((error: unknown) => {
    if (error instanceof ServiceError) return error.message;
    throw error;
  });
  const head = (open: boolean) => <ScreenHead eyebrow="Ruang meeting" title="Book ruang"
    lead={`Jam ${clockLabel(appraisalRules.open)}–${clockLabel(appraisalRules.close)}, Senin–Jumat, 28 Okt–20 Nov. Yang tersimpan lebih dulu yang mendapat ruang.`}
    actions={open ? <a className="button button--primary" href={praWamPath.book({ date })}><Plus size={18} aria-hidden /> Book ruang</a> : undefined} />;
  if (typeof loaded === "string") return <PraWamShell member={member} current="appraisal">{head(false)}<Notice tone="warning">{loaded}</Notice></PraWamShell>;
  const [schedule, mine, open] = loaded;
  return <PraWamShell member={member} current="appraisal">
    {head(open)}
    {!open && <div style={{ marginBottom: 16 }}><Notice tone="info">Book ruang sedang ditutup oleh admin WAM. Denah dan jadwal yang ada tetap bisa dilihat.</Notice></div>}
    <AppraisalBoard key={date} open={open} canCancelAny={cancelsAnyBooking(member)} date={date} dates={dates.includes(date) ? dates : [date, ...dates]} now={now.toISOString()} rooms={schedule.rooms} bookings={schedule.bookings} mine={mine} viewerId={member.id} />
  </PraWamShell>;
}
