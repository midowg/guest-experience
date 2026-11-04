import { AppraisalBoard, type BookArrival, type BookFormData } from "@/components/pra-wam/AppraisalBoard";
import { PraWamShell, ScreenHead } from "@/components/pra-wam/PraWamShell";
import { Notice } from "@/components/ui";
import { appraisalRules, bookableDates, clockLabel, wibDate, workWeek } from "@/lib/pra-wam/appraisal";
import { cancelsAnyBooking } from "@/lib/pra-wam/roles";
import { participantGroups } from "@/lib/pra-wam/units";
import { praWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { listPeople, myBookings, usedTitles, weekSchedule, windowSummary } from "@/lib/server/pra-wam/appraisal";
import { appraisalOpen } from "@/lib/server/pra-wam/events";
import { appSettings } from "@/lib/server/pra-wam/rooms";
import { listUnits } from "@/lib/server/pra-wam/units";
import { requireMemberPage, type Member } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Book ruang · WAM", robots: { index: false } };

type Query = { date?: string; booking?: string; edit?: string; new?: string; room?: string; start?: string; end?: string };

const ID = /^[0-9a-zA-Z:_-]{1,64}$/;
const TIME = /^\d{2}:\d{2}$/;

/**
 * Book: the calendar of who has which room (the day, or on a desktop the week), the floor plan as
 * a second view unless the super admin switched it off, and the person's own bookings. The whole week of the chosen day is loaded, so
 * switching days within it needs no trip to the server; the date strip gets a light count of the
 * whole window (windowSummary). The address may ask for a sheet: ?booking=<id> (from
 * an agenda item), ?edit=<id>, or ?new=1 with room, start and end.
 */
export default async function BookPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const member = await requireMemberPage(praWamPath.bookSheet({ ...query, new: query.new === "1" ? "1" : undefined }));
  const now = new Date();
  const today = wibDate(now.toISOString());
  const dates = bookableDates(today);
  const asked = query.date;
  const date = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked >= appraisalRules.periodStart && asked <= appraisalRules.periodEnd ? asked : dates[0] ?? appraisalRules.periodEnd;
  const week = workWeek(date);
  // The week in full, and the whole booking window as counts for the date strip.
  const loaded = await Promise.all([weekSchedule(week, member), myBookings(member, today), appraisalOpen(), appSettings(), windowSummary(appraisalRules.periodStart, appraisalRules.periodEnd, now)])
    .then(async ([schedule, mine, open, settings, summary]) => ({ schedule, mine, open, settings, summary, form: open ? await formData(member) : null }))
    .catch((error: unknown) => {
      if (error instanceof ServiceError) return error.message;
      throw error;
    });
  if (typeof loaded === "string") return <PraWamShell member={member} current="appraisal">
    <ScreenHead eyebrow="Ruang meeting" title="Book ruang" lead={`Jam ${clockLabel(appraisalRules.open)}–${clockLabel(appraisalRules.close)}, Senin–Jumat, 28 Okt–20 Nov.`} />
    <Notice tone="warning">{loaded}</Notice>
  </PraWamShell>;
  const { schedule, mine, open, settings, summary, form } = loaded;
  const arrive: BookArrival = {
    booking: query.booking && ID.test(query.booking) ? query.booking : undefined,
    edit: query.edit && ID.test(query.edit) ? query.edit : undefined,
    create: query.new === "1" ? {
      room: query.room && ID.test(query.room) ? query.room : undefined,
      start: query.start && TIME.test(query.start) ? query.start : undefined,
      end: query.end && TIME.test(query.end) ? query.end : undefined,
    } : undefined,
  };
  // A week day in the period first, so the calendar does not open on a weekend or outside it.
  const shown = week.includes(date) ? date : week.find(day => day >= appraisalRules.periodStart && day <= appraisalRules.periodEnd) ?? week[0];
  return <PraWamShell member={member} current="appraisal">
    <AppraisalBoard date={shown} week={week} dates={dates} now={now.toISOString()} rooms={schedule.rooms} bookings={schedule.bookings} mine={mine}
      viewerId={member.id} canCancelAny={cancelsAnyBooking(member)} open={open} form={form} arrive={arrive} floorPlan={settings.floorPlan} summary={summary}
      banner={open ? undefined : <div style={{ marginBottom: 16 }}><Notice tone="info">Book ruang sedang ditutup oleh admin WAM. {settings.floorPlan ? "Kalender dan denah" : "Kalender"} tetap bisa dilihat.</Notice></div>} />
  </PraWamShell>;
}

/** The people, their groups and the names already used, for the booking form in the sheet. */
async function formData(member: Member): Promise<BookFormData> {
  const [people, titles, units] = await Promise.all([listPeople(), usedTitles(), listUnits()]);
  const active = people.filter(person => person.active).map(({ id, name, department }) => ({ id, name, department }));
  return { people: active, groups: participantGroups(active, member.id, units.units, units.memberships), usedTitles: titles };
}
