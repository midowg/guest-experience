import { redirect } from "next/navigation";
import { ArrowLeftRight, Bell, CalendarClock, ChevronRight, Clock, Info, MapPin, QrCode } from "lucide-react";
import { AgendaSheet } from "@/components/pra-wam/AgendaSheet";
import { Avatar } from "@/components/pra-wam/Avatar";
import { AboutCard, ManageCard, QuestionnaireCard } from "@/components/pra-wam/BerandaCards";
import { AgendaTimeline } from "@/components/pra-wam/desktop/AgendaTimeline";
import { DocRows } from "@/components/pra-wam/desktop/DocRows";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { AGENDA_ITEM, withItem } from "@/lib/pra-wam/agenda";
import { clockLabel, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { requestStatusLabels, spanLabel } from "@/lib/pra-wam/requests";
import { bodOnly, cancelsAnyBooking, managesSessions, seesAllSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { getAbout } from "@/lib/server/pra-wam/about";
import { agendaItems, untilLabel } from "@/lib/server/pra-wam/agenda";
import { myNotifications } from "@/lib/server/pra-wam/announcements";
import { listDocuments } from "@/lib/server/pra-wam/documents";
import { myQuestionnaireCard } from "@/lib/server/pra-wam/questionnaire-answers";
import { appraisalOpen } from "@/lib/server/pra-wam/events";
import { myOpenRequests, openRequestCount } from "@/lib/server/pra-wam/requests";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import base from "@/components/pra-wam/pra-wam.module.css";
import own from "@/components/pra-wam/desktop/home.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beranda · WAM", robots: { index: false } };

const greeting = (now: Date) => {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(now));
  return hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";
};
const longDate = (now: Date) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" }).format(now);
const shortTime = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

/**
 * Beranda (Penpot P1 on a phone, E1 on a desktop): the next thing, what waits on the person, the
 * latest news, "Kelola acara" for the panitia (Penpot K1, phone only: a desktop has it in the top
 * bar) and "Apa itu WAM?"; on a desktop also today's agenda and the newest documents in a side
 * column. An agenda item (the hero, today's agenda) opens over the page (AgendaSheet), as on Agenda.
 */
export default async function HomePage() {
  const member = await requireMemberPage(praWamPath.home);
  // "Akun BOD langsung ke Ringkasan" (Penpot "Panduan · BOD").
  if (bodOnly(member)) redirect(praWamPath.dashboard);
  const now = new Date();
  const today = wibDate(now.toISOString());
  const [{ items }, notes, requests, appraisal, docs, about, manage, quest] = await Promise.all([
    agendaItems(member, today), myNotifications(member), myOpenRequests(member), appraisalOpen(),
    listDocuments(member).catch(() => ({ documents: [], migrated: false, storage: false })),
    getAbout().catch(() => null),
    // "Kelola acara" for the panitia: the card carries only the requests waiting.
    seesAllSessions(member) ? (managesSessions(member) ? openRequestCount() : 0) : null,
    // The questionnaire, once HR opens it; never in the way of Beranda when it cannot be read.
    myQuestionnaireCard(member.id).catch(() => null),
  ]);
  const next = items.find(item => new Date(item.endsAt) > now);
  const todays = items.filter(item => wibDate(item.startsAt) === today);
  const sessionsToday = todays.filter(item => item.kind === "sesi").length;
  const latest = notes.items[0];
  const request = requests[0];
  const questCard = quest && <QuestionnaireCard name={quest.form.name} cardText={quest.form.cardText} minutes={quest.form.minutes}
    sectionsDone={quest.progress.sectionsDone} sectionsTotal={quest.progress.sectionsTotal} done={quest.progress.done}
    closed={quest.form.status === "tutup"} href={praWamPath.questionnaire(quest.form.slug)}
    character={quest.card && { name: quest.card.character.name, tier: quest.card.tier.name, color: quest.card.tier.color, image: quest.card.character.image }} />;
  /** This page with the item open: AgendaSheet opens it in place, and the address keeps it. */
  const open = (item: { key: string }) => withItem(praWamPath.home, item.key);
  const opens = (item: { key: string }) => ({ [AGENDA_ITEM]: item.key, "aria-haspopup": "dialog" as const });
  return <PraWamShell member={member} current="beranda">
    <div className={own.home}>
      <div className={own.col}>
        {/* Phone: the person, the greeting and the bell in one row. Desktop: the top bar has the person and the bell. */}
        <header className={own.homeHead}>
          <a className={`${own.homeAvatar} ${own.phoneOnly}`} href={praWamPath.account} aria-label="Profil">
            <Avatar name={member.name} photo={member.photo ?? null} size="md" decorative />
          </a>
          <div className={own.homeTitle}>
            <h1 className={own.greet}>{greeting(now)}, {member.nickname || member.name.split(" ")[0]}</h1>
            <p className={own.metaLine}>{longDate(now)}{member.department ? ` · ${member.department}` : ""}{sessionsToday ? ` · ${sessionsToday} sesi hari ini` : ""}</p>
          </div>
          <a className={`${base.iconButton} ${own.homeBell} ${own.phoneOnly}`} href={praWamPath.notifications} aria-label={notes.unread ? `Notifikasi, ${notes.unread} belum dibaca` : "Notifikasi"}>
            <Bell aria-hidden />{notes.unread > 0 && <span className={base.iconDot} />}
          </a>
        </header>

        {/* Mandatory until done: first thing under the greeting, on a phone and a desktop alike. */}
        {quest && !quest.progress.done && questCard}

        {next ? <section className={base.hero} aria-label="Berikutnya">
          <div className={base.heroTop}><span>Berikutnya · {next.tag}</span><span>{untilLabel(next, now, today)}</span></div>
          <h2><a href={open(next)} {...opens(next)}>{next.title}</a></h2>
          <span className={base.heroLine}><Clock aria-hidden />{wibDate(next.startsAt) === today ? "" : `${spanLabel(next.startsAt, next.endsAt).split(" · ")[0]} · `}{clockLabel(wibTime(next.startsAt))}–{clockLabel(wibTime(next.endsAt))}</span>
          <span className={base.heroLine}><MapPin aria-hidden />{next.where}</span>
          {next.kind === "sesi" && (next.checkedInAt
            ? <span className={`${base.heroButton} ${own.wide}`}>Absen tercatat {shortTime(next.checkedInAt)}</span>
            : <a className={`${base.heroButton} ${own.wide}`} href={praWamPath.scan}><QrCode size={20} aria-hidden />Scan QR absen</a>)}
          {next.kind === "appraisal" && <a className={`${base.heroButton} ${own.wide}`} href={open(next)} {...opens(next)}><CalendarClock size={20} aria-hidden />Lihat booking</a>}
        </section> : <section className={base.card}>
          <h2>Belum ada agenda</h2>
          <p className={`${base.meta} ${own.prose}`}>Sesi muncul di sini setelah panitia menerbitkannya.</p>
        </section>}

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
        {about && <AboutCard about={about.about} />}
      </div>

      <aside className={own.side} aria-label="Hari ini">
        <section className={base.card}>
          <div className={own.cardHead}><h2>Agenda hari ini</h2><a href={praWamPath.agenda}>Lihat semua</a></div>
          {todays.length ? <AgendaTimeline items={todays} now={now} href={open} /> : <p className={base.meta}>Tidak ada agenda hari ini.</p>}
        </section>
        <section className={base.card}>
          <div className={own.cardHead}><h2>Dokumen terbaru</h2><a href={praWamPath.documents}>Semua</a></div>
          <DocRows documents={docs.documents.slice(0, 3)} empty="Belum ada dokumen." />
        </section>
      </aside>
    </div>
    <AgendaSheet items={items} version={now.toISOString()} cancelsAny={cancelsAnyBooking(member)} bookingOpen={appraisal} />
  </PraWamShell>;
}
