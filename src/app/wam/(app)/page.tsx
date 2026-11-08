import { redirect } from "next/navigation";
import { ArrowLeftRight, Bell, CalendarClock, CheckCircle2, ChevronRight, Clock, Info, MapPin, QrCode } from "lucide-react";
import { AgendaSheet } from "@/components/pra-wam/AgendaSheet";
import { Avatar } from "@/components/pra-wam/Avatar";
import { AboutCard, ColleaguesCard, ManageCard, QuestionnaireCard, RoomCard } from "@/components/pra-wam/BerandaCards";
import { SelfCheckIn } from "@/components/pra-wam/SelfCheckIn";
import { AgendaTimeline } from "@/components/pra-wam/desktop/AgendaTimeline";
import { DocRows } from "@/components/pra-wam/desktop/DocRows";
import { AGENDA_ITEM, checkInStatus, checkInText, heroCheckInNote, pickDay, withItem } from "@/lib/pra-wam/agenda";
import { clockLabel, dayLabel, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { checkInNow, checkInWay } from "@/lib/pra-wam/attendance";
import { requestStatusLabels, spanLabel } from "@/lib/pra-wam/requests";
import { bodOnly, cancelsAnyBooking, managesSessions, seesAllSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { getAbout } from "@/lib/server/pra-wam/about";
import { myAttendance, untilLabel } from "@/lib/server/pra-wam/agenda";
import { myNotifications } from "@/lib/server/pra-wam/announcements";
import { listDocuments } from "@/lib/server/pra-wam/documents";
import { myQuestionnaireCard } from "@/lib/server/pra-wam/questionnaire-answers";
import { myRoom } from "@/lib/server/pra-wam/stay";
import { appraisalOpen } from "@/lib/server/pra-wam/events";
import { myAgenda } from "@/lib/server/pra-wam/quick-actions";
import { myOpenRequests, openRequestCount } from "@/lib/server/pra-wam/requests";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import base from "@/components/pra-wam/pra-wam.module.css";
import own from "@/components/pra-wam/desktop/home.module.css";
import sc from "@/components/pra-wam/self-check-in.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beranda · WAM", robots: { index: false } };

const greeting = (now: Date) => {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(now));
  return hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";
};
const longDate = (now: Date) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" }).format(now);
/** "Min, 8 Nov": the date on a phone, where the header has one short line for it. */
const shortDate = (now: Date) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(now);
const shortTime = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const chipDay = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const chipDate = (date: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
/** Beranda with a day picked in Agenda (and an item open over it), scrolled to Agenda. */
const agendaHref = (query: { date?: string; item?: string }) => {
  const search = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => !!entry[1])).toString();
  return `${praWamPath.home}${search ? `?${search}` : ""}#agenda`;
};

/**
 * Beranda (Penpot P1 on a phone, E1 on a desktop): the next thing with "Saya hadir", the agenda day
 * by day (it was a tab of its own until 5 Nov 2026; ?date= picks the day), what waits on the
 * person, the latest news, "Kelola acara" for the panitia (Penpot K1, phone only: a desktop has it
 * in the top bar) and "Apa itu WAM?"; on a desktop also the newest documents in a side column. An
 * agenda item opens over the page (AgendaSheet); ?item=<key> keeps it open.
 *
 * The blue card is also where people check in (5 Nov 2026): it shows the session whose check-in is
 * open, else the next thing, with "Saya hadir" and "Scan QR" for a session (SelfCheckIn, hero).
 * ?absen=1 (Aksi cepat's "Saya hadir") opens "Kamu hadir di mana?" at once.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ date?: string; item?: string; session?: string; absen?: string }> }) {
  const { date: tanggal, item: asked, session: older, absen } = await searchParams;
  const member = await requireMemberPage(praWamPath.home);
  // "Akun BOD langsung ke Ringkasan" (Penpot "Panduan · BOD").
  if (bodOnly(member)) redirect(praWamPath.dashboard);
  const now = new Date();
  const today = wibDate(now.toISOString());
  const [{ items, migrated }, notes, requests, appraisal, docs, about, manage, quest, room] = await Promise.all([
    myAgenda(member, today), myNotifications(member), myOpenRequests(member), appraisalOpen(),
    listDocuments(member).catch(() => ({ documents: [], migrated: false, storage: false })),
    getAbout().catch(() => null),
    // "Kelola acara" for the panitia: the card carries only the requests waiting.
    seesAllSessions(member) ? (managesSessions(member) ? openRequestCount() : 0) : null,
    // The questionnaire, once HR opens it; never in the way of Beranda when it cannot be read.
    myQuestionnaireCard(member.id).catch(() => null),
    // The WAM room, once HR publishes the pairing; never in the way of Beranda either.
    myRoom(member.id).catch(() => null),
  ]);
  // The blue card: the session whose check-in is open now, else the next thing still to come.
  const next = checkInNow(items, now) ?? items.find(item => new Date(item.endsAt) > now);
  const attendance = next?.kind === "sesi" && next.sessionId ? await myAttendance(next.sessionId, member).catch(() => null) : null;
  const heroStatus = next && attendance ? checkInStatus({ status: "terbit", isParticipant: true, startsAt: next.startsAt, endsAt: next.endsAt }, attendance, now) : null;
  const going = next && new Date(next.startsAt) <= now;
  const todays = items.filter(item => wibDate(item.startsAt) === today);
  const sessionsToday = todays.filter(item => item.kind === "sesi").length;
  // Agenda: an item asked for in the address opens on its own day.
  const askedDay = items.find(item => item.key === (asked ?? older));
  const { days, day } = pickDay(items, tanggal ?? (askedDay && wibDate(askedDay.startsAt)), today, now);
  const shown = items.filter(item => wibDate(item.startsAt) === day);
  const later = items.find(item => wibDate(item.startsAt) > day);
  const latest = notes.items[0];
  const request = requests[0];
  const questCard = quest && <QuestionnaireCard name={quest.form.name} cardText={quest.form.cardText} minutes={quest.form.minutes}
    sectionsDone={quest.progress.sectionsDone} sectionsTotal={quest.progress.sectionsTotal} done={quest.progress.done}
    closed={quest.form.status === "tutup"} href={praWamPath.questionnaire(quest.form.slug)}
    character={quest.card && { name: quest.card.character.name, tier: quest.card.tier.name, color: quest.card.tier.color, image: quest.card.character.image }} />;
  /** This page with the item open: AgendaSheet opens it in place, and the address keeps it. */
  const open = (item: { key: string }) => withItem(praWamPath.home, item.key);
  const opens = (item: { key: string }) => ({ [AGENDA_ITEM]: item.key, "aria-haspopup": "dialog" as const });
  return <>
    <div className={own.home}>
      <div className={own.col}>
        {/* Phone: the person, the greeting and the bell in one row. Desktop: the top bar has the person and the bell. */}
        <header className={own.homeHead}>
          <a className={`${own.homeAvatar} ${own.phoneOnly}`} href={praWamPath.account} aria-label="Profil">
            <Avatar name={member.name} photo={member.photo ?? null} size="md" decorative />
          </a>
          <div className={own.homeTitle}>
            <h1 className={own.greet}>
              <span className={own.hello}>{greeting(now)}<span className="sr-only">,</span>
                <span aria-hidden> · </span><span className={own.phoneOnly}>{shortDate(now)}</span><span className={own.deskOnly}>{longDate(now)}</span>
              </span>
              <span className={own.greetName}>{member.nickname || member.name.split(" ")[0]}</span>
            </h1>
            {(member.department || sessionsToday > 0) && <p className={`${own.metaLine} ${own.deskOnly}`}>{[member.department, sessionsToday ? `${sessionsToday} sesi hari ini` : ""].filter(Boolean).join(" · ")}</p>}
          </div>
          <a className={`${base.iconButton} ${own.homeBell} ${own.phoneOnly}`} href={praWamPath.notifications} aria-label={notes.unread ? `Notifikasi, ${notes.unread} belum dibaca` : "Notifikasi"}>
            <Bell aria-hidden />{notes.unread > 0 && <span className={base.iconDot} />}
          </a>
        </header>

        {/* Mandatory until done: first thing under the greeting, on a phone and a desktop alike. */}
        {quest && !quest.progress.done && questCard}
        {room && <RoomCard room={room} />}

        {next ? <section className={base.hero} aria-label={going ? "Sedang berlangsung" : "Berikutnya"}>
          <div className={base.heroTop}><span>{going ? "Sedang berlangsung" : "Berikutnya"} · {next.tag}</span><span>{untilLabel(next, now, today)}</span></div>
          <h2><a href={open(next)} {...opens(next)}>{next.title}</a></h2>
          <span className={base.heroLine}><Clock aria-hidden />{wibDate(next.startsAt) === today ? "" : `${spanLabel(next.startsAt, next.endsAt).split(" · ")[0]} · `}{clockLabel(wibTime(next.startsAt))}–{clockLabel(wibTime(next.endsAt))}</span>
          <span className={base.heroLine}><MapPin aria-hidden />{next.where}</span>
          {/*
            Absen right here, one way per session: a booking's session "Saya hadir", a panitia's
            session "Scan QR absen"; with when it opens or until when, or "Hadir 09.42 · ..." once done.
          */}
          {next.kind === "sesi" && (heroStatus && next.sessionId
            ? checkInWay(next) === "tombol"
              ? <SelfCheckIn variant="hero" sessionId={next.sessionId} status={heroStatus} now={now.toISOString()} selfReady={!!attendance?.selfReady} autoOpen={absen === "1"} />
              : <div className={sc.hero}>
                {heroStatus.kind === "hadir"
                  ? <p className={sc.heroDone}><CheckCircle2 size={20} aria-hidden />{checkInText(heroStatus, now).title}</p>
                  : <>
                    <p className={sc.heroNote}>{heroCheckInNote(heroStatus, now.toISOString())}{heroStatus.kind === "buka" ? " Scan QR yang ditempel di ruang." : ""}</p>
                    {heroStatus.kind !== "tutup" && <div className={sc.heroRow}>
                      {heroStatus.kind === "buka"
                        ? <a className={sc.heroHadir} href={praWamPath.scan}><QrCode size={20} aria-hidden />Scan QR absen</a>
                        : <span className={`${sc.heroHadir} ${sc.heroOff}`} aria-disabled="true"><QrCode size={20} aria-hidden />Scan QR absen</span>}
                    </div>}
                  </>}
              </div>
            : next.checkedInAt
              ? <span className={`${base.heroButton} ${own.wide}`}><CheckCircle2 size={20} aria-hidden />Hadir {shortTime(next.checkedInAt)}</span>
              : <a className={`${base.heroButton} ${own.wide}`} href={open(next)} {...opens(next)}><Info size={20} aria-hidden />Lihat detail</a>)}
          {next.kind === "appraisal" && <a className={`${base.heroButton} ${own.wide}`} href={open(next)} {...opens(next)}><CalendarClock size={20} aria-hidden />Lihat booking</a>}
        </section> : <section className={base.card}>
          <h2>Belum ada agenda</h2>
          <p className={`${base.meta} ${own.prose}`}>Sesi muncul di sini setelah panitia menerbitkannya.</p>
        </section>}

        <section className={`${base.card} ${own.agendaCard}`} id="agenda" aria-labelledby="agenda-judul">
          <div className={own.cardHead}>
            <h2 id="agenda-judul">Agenda</h2>
            {seesAllSessions(member) && <a href={praWamPath.sessions}>Jadwal sesi</a>}
          </div>
          {!migrated && <p className={base.meta}>Sesi forum belum tersedia. Booking ruang tetap tampil di sini.</p>}
          <nav className={base.dates} aria-label="Pilih hari">
            {days.map(date => <a key={date} className={`${base.chip} ${base.chipStack}`} href={agendaHref({ date })} aria-current={date === day ? "date" : undefined}>
              {chipDay(date)}<small>{chipDate(date)}{date === today ? " · hari ini" : ""}</small>
            </a>)}
          </nav>
          {shown.length === 0
            ? <p className={base.meta}>{items.length === 0
              ? "Belum ada sesi di agenda kamu. Sesi muncul di sini setelah panitia menerbitkannya."
              : day === today ? "Tidak ada agenda hari ini." : `Tidak ada agenda ${dayLabel(day)}.`}</p>
            : <AgendaTimeline items={shown} now={now} href={item => agendaHref({ date: day, item: item.key })} />}
          {later && <a className={`${base.callout} ${own.calloutLink}`} href={agendaHref({ date: wibDate(later.startsAt) })}><Info aria-hidden />{dayLabel(wibDate(later.startsAt))}: {later.title}</a>}
        </section>

        {manage !== null && <ManageCard manages={managesSessions(member)} openRequests={manage} />}

        {(request || latest) && <div className={own.pair}>
          {request && <section className={base.card} aria-label="Permintaan jadwal">
            <div className={own.cardHead}>
              <span className={own.label}>Permintaan jadwal</span>
              <span className={base.pill}><Clock aria-hidden />{requestStatusLabels[request.status]}</span>
            </div>
            <a className={own.plain} href={praWamPath.session(request.sessionId)}>{request.sessionTitle}: usul pindah ke {spanLabel(request.toStartsAt, request.toEndsAt)}</a>
            <div className={own.steps} aria-label="Tahap permintaan">
              <span className={`${own.step} ${own.stepOn}`}>Diajukan</span>
              <span className={`${own.step} ${own.stepOn}`}>Diperiksa</span>
              <span className={own.step}>Keputusan</span>
            </div>
          </section>}
          {latest && <a className={`${base.card} ${own.noteCard}`} href={praWamPath.notifications}>
            <span className={base.tile}>{latest.kind === "sesi" ? <ArrowLeftRight aria-hidden /> : <Info aria-hidden />}</span>
            <span><strong>{latest.title}</strong><span className={base.meta}>{latest.kind === "sesi" ? "Kabar sesi" : "Dari panitia"} · {shortTime(latest.createdAt)}</span></span>
          </a>}
        </div>}

        {appraisal && <a className={base.cardLink} href={praWamPath.appraisal()}>
          <CalendarClock size={22} aria-hidden /><span>Book ruang<small>Pesan ruang lewat denah atau lihat siapa memakai ruang</small></span><ChevronRight size={20} aria-hidden />
        </a>}
        {quest?.progress.done && questCard}
        {quest?.progress.done && quest.card && <ColleaguesCard href={praWamPath.colleagues} />}
        {about && <AboutCard about={about.about} />}
      </div>

      <aside className={own.side} aria-label="Terbaru">
        <section className={base.card}>
          <div className={own.cardHead}><h2>Dokumen terbaru</h2><a href={praWamPath.documents}>Semua</a></div>
          <DocRows documents={docs.documents.slice(0, 3)} empty="Belum ada dokumen." />
        </section>
      </aside>
    </div>
    <AgendaSheet items={items} version={now.toISOString()} cancelsAny={cancelsAnyBooking(member)} bookingOpen={appraisal} />
  </>;
}
