import { redirect } from "next/navigation";
import { Bell, CalendarClock, CheckCircle2, Clock, Info, MapPin, QrCode } from "lucide-react";
import { AgendaSheet } from "@/components/pra-wam/AgendaSheet";
import { Avatar } from "@/components/pra-wam/Avatar";
import { AboutCard, ColleaguesCard, ManageCard, QuestionnaireCard, RoomCard } from "@/components/pra-wam/BerandaCards";
import { SelfCheckIn } from "@/components/pra-wam/SelfCheckIn";
import { AgendaCarousel } from "@/components/pra-wam/AgendaCarousel";
import { DocRows } from "@/components/pra-wam/desktop/DocRows";
import { AGENDA_ITEM, checkInStatus, checkInText, heroCheckInNote, withItem } from "@/lib/pra-wam/agenda";
import { clockLabel, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
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
const daysBefore = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
/** "Kemarin", "Hari ini", "Besok" or "Sen, 9 Nov": when a card in the carousel is. */
function dayWordFor(today: string) {
  return (date: string) => date === today ? "Hari ini" : date === daysBefore(today, 1) ? "Kemarin" : date === daysBefore(today, -1) ? "Besok"
    : new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

/**
 * Beranda (Penpot P1 on a phone, E1 on a desktop): the agenda as a carousel (9 Nov 2026), opening on
 * what matters now with "Saya hadir" on it, a week back a swipe to the left (?date= and ?item= pick
 * the card it opens on), what waits on the
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
  const [{ items }, notes, requests, appraisal, docs, about, manage, quest, room] = await Promise.all([
    // From a week back: the carousel's earlier cards (yesterday too) are a swipe to the left.
    myAgenda(member, daysBefore(today, 7)), myNotifications(member), myOpenRequests(member), appraisalOpen(),
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
  // The carousel opens on the item asked for in the address, else the first of a day asked for,
  // else the one that matters now (running or next), else the last one.
  const askedItem = items.findIndex(item => item.key === (asked ?? older));
  const askedDay = tanggal ? items.findIndex(item => wibDate(item.startsAt) >= tanggal) : -1;
  const nowAt = next ? items.findIndex(item => item.key === next.key) : -1;
  const startAt = askedItem >= 0 ? askedItem : askedDay >= 0 ? askedDay : nowAt >= 0 ? nowAt : Math.max(items.length - 1, 0);
  // The newest word from panitia only (9 Nov 2026): news about sessions is agenda, which the carousel
  // and Agenda already show (cancellations greyed there); it stays in the bell.
  const latest = notes.items.find(note => note.kind !== "sesi");
  const dayWord = dayWordFor(today);
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
              {/* The full name (8 Nov 2026), one line; a very long one ends with … and shows whole on hover. */}
              <span className={own.greetName} title={member.name}>{member.name}</span>
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

        {items.length === 0 ? <section className={base.card}>
          <h2>Belum ada agenda</h2>
          <p className={`${base.meta} ${own.prose}`}>Sesi muncul di sini setelah panitia menerbitkannya.</p>
        </section> : <AgendaCarousel start={startAt} labels={items.map(item => item.title)}>
          {items.map(item => {
            const current = item.key === next?.key;
            const ended = new Date(item.endsAt) <= now;
            const label = current ? (going ? "Sedang berlangsung" : "Berikutnya") : ended ? "Selesai" : "Nanti";
            return <section key={item.key} className={`${base.hero} ${ended && !current ? own.heroPast : ""}`} aria-label={`${label}: ${item.title}`}>
              <div className={base.heroTop}><span>{label} · {item.tag}</span><span>{ended ? dayWord(wibDate(item.startsAt)) : untilLabel(item, now, today) || dayWord(wibDate(item.startsAt))}</span></div>
              <h2><a href={open(item)} {...opens(item)}>{item.title}</a></h2>
              <span className={base.heroLine}><Clock aria-hidden />{wibDate(item.startsAt) === today ? "" : `${spanLabel(item.startsAt, item.endsAt).split(" · ")[0]} · `}{clockLabel(wibTime(item.startsAt))}–{clockLabel(wibTime(item.endsAt))}</span>
              <span className={base.heroLine}><MapPin aria-hidden />{item.where}</span>
              {current ? <>
          {/*
            Absen right here, one way per session: a booking's session "Saya hadir", a panitia's
            session "Scan QR absen"; with when it opens or until when, or "Hadir 09.42 · ..." once done.
          */}
          {item.kind === "sesi" && (heroStatus && item.sessionId
            ? checkInWay(item) === "tombol"
              ? <SelfCheckIn variant="hero" sessionId={item.sessionId} status={heroStatus} now={now.toISOString()} selfReady={!!attendance?.selfReady} autoOpen={absen === "1"} />
              : <div className={sc.hero}>
                {heroStatus.kind === "hadir"
                  ? <p className={sc.heroDone}><CheckCircle2 size={20} aria-hidden />{checkInText(heroStatus, now).title}</p>
                  : heroStatus.kind === "buka"
                    ? <>
                      <p className={sc.heroNote}>{heroCheckInNote(heroStatus, now.toISOString())} Scan QR yang ditempel di ruang.</p>
                      <div className={sc.heroRow}><a className={sc.heroHadir} href={praWamPath.scan}><QrCode size={20} aria-hidden />Scan QR absen</a></div>
                    </>
                    // Not open yet (or closed): one quiet line with how to check in, no button that cannot be pressed.
                    : <p className={sc.heroWait}><QrCode size={18} aria-hidden /><span>{heroStatus.kind === "belum" ? heroCheckInNote(heroStatus, now.toISOString()).replace(/^Absen dibuka/, "Absen lewat Scan QR, dibuka") : heroCheckInNote(heroStatus, now.toISOString())}</span></p>}
              </div>
            : item.checkedInAt
              ? <span className={`${base.heroButton} ${own.wide}`}><CheckCircle2 size={20} aria-hidden />Hadir {shortTime(item.checkedInAt)}</span>
              : <a className={`${base.heroButton} ${own.wide}`} href={open(item)} {...opens(item)}><Info size={20} aria-hidden />Lihat detail</a>)}
          {item.kind === "appraisal" && <a className={`${base.heroButton} ${own.wide}`} href={open(item)} {...opens(item)}><CalendarClock size={20} aria-hidden />Lihat booking</a>}
              </> : item.checkedInAt
                ? <span className={`${base.heroButton} ${own.wide}`}><CheckCircle2 size={20} aria-hidden />Hadir {shortTime(item.checkedInAt)}</span>
                : <a className={`${base.heroButton} ${own.wide}`} href={open(item)} {...opens(item)}><Info size={20} aria-hidden />{item.kind === "appraisal" ? "Lihat booking" : "Lihat detail"}</a>}
            </section>;
          })}
        </AgendaCarousel>}

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
            <span className={base.tile}><Info aria-hidden /></span>
            <span><strong>{latest.title}</strong><span className={base.meta}>Dari panitia · {shortTime(latest.createdAt)}</span></span>
          </a>}
        </div>}

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
