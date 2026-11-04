import type { ReactNode } from "react";
import { ArrowLeft, ArrowLeftRight, BarChart3, Bell, CalendarDays, ChevronLeft, ClipboardList, DoorOpen, FileText, Home, Send, User, Users, X } from "lucide-react";
import { bodOnly, managesSessions, roleSummary, seesAllSessions, type PraWamRole } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { unreadCount } from "@/lib/server/pra-wam/announcements";
import { openRequestCount } from "@/lib/server/pra-wam/requests";
import { currentPhase } from "@/lib/server/pra-wam/events";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { Avatar } from "./Avatar";
import { SignOutButton } from "./SignOutButton";
import styles from "./pra-wam.module.css";

export type Tab = "beranda" | "agenda" | "appraisal" | "dokumen" | "notifikasi" | "akun" | "dashboard" | "sesi" | "permintaan" | "pengumuman" | "peserta" | "survei";
type Who = { roles: readonly PraWamRole[] };
type Item = { id: Tab; label: string; href: string; icon: ReactNode; show?: (who: Who) => boolean; short?: string };

/** Everyone: the phone's bottom bar shows these, the desktop sidebar too (with Notifikasi). */
const personal: Item[] = [
  { id: "beranda", label: "Beranda", href: praWamPath.home, icon: <Home aria-hidden /> },
  { id: "agenda", label: "Agenda", href: praWamPath.agenda, icon: <CalendarDays aria-hidden /> },
  { id: "appraisal", label: "Book", href: praWamPath.appraisal(), icon: <DoorOpen aria-hidden /> },
  { id: "dokumen", label: "Dokumen", href: praWamPath.documents, icon: <FileText aria-hidden /> },
  { id: "akun", label: "Profil", href: praWamPath.account, icon: <User aria-hidden /> },
];
/** BOD only (Penpot "Panduan · BOD"): Ringkasan first; Agenda stays, as a BOD also takes part. */
const bod: Item[] = [
  { id: "dashboard", label: "Ringkasan", href: praWamPath.dashboard, icon: <BarChart3 aria-hidden /> },
  { id: "agenda", label: "Agenda", href: praWamPath.agenda, icon: <CalendarDays aria-hidden /> },
  { id: "peserta", label: "Peserta", href: praWamPath.people, icon: <Users aria-hidden /> },
  { id: "survei", label: "Survei", href: praWamPath.surveyResults, icon: <ClipboardList aria-hidden /> },
  { id: "akun", label: "Profil", href: praWamPath.account, icon: <User aria-hidden /> },
];
/** Panitia ("Kelola acara" in Penpot) and BOD, reading. */
const manage: Item[] = [
  { id: "dashboard", label: "Dashboard", href: praWamPath.dashboard, icon: <BarChart3 aria-hidden />, show: seesAllSessions },
  { id: "sesi", label: "Jadwal sesi", href: praWamPath.sessions, icon: <CalendarDays aria-hidden />, show: seesAllSessions },
  { id: "permintaan", label: "Permintaan jadwal", short: "Permintaan", href: praWamPath.requests, icon: <ArrowLeftRight aria-hidden />, show: managesSessions },
  { id: "pengumuman", label: "Pengumuman", href: praWamPath.announcements, icon: <Send aria-hidden />, show: managesSessions },
];

/** Every place in "Kelola acara", also those reached from inside it (Peserta, Survei) without a menu item of their own. */
const managedIds = new Set<Tab>([...manage.map(item => item.id), "peserta", "survei"]);
const month = (date: string) => new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/**
 * The frame of every signed-in WAM page, as in Penpot.
 * - Phone: the page and a bottom bar (Beranda, Agenda, Book, Dokumen, Profil). A detail
 *   screen (`back`) is a pushed screen: a top bar with a back arrow and the title, no bottom bar,
 *   sliding in from the right.
 * - Phone, "Kelola acara": an app of its own. A top bar with its name and "Keluar" back to the
 *   app, and a bottom bar with the panitia's places. A BOD keeps the BOD menu instead.
 * - Desktop, the app (E1, E2): a top bar with the brand, the phase, the menu in the middle, and the
 *   bell and the person on the right.
 * - Desktop, "Kelola acara" (D1 to D9): a sidebar with the panitia's places.
 */
export async function PraWamShell({ member, current, back, children }: { member: { id: string; name: string; nickname: string; department: string; roles: PraWamRole[]; photo?: string | null }; current?: Tab; back?: { href: string; title: string }; children: ReactNode }) {
  const [unread, waiting, phase] = await Promise.all([
    unreadCount(member.id), managesSessions(member) ? openRequestCount() : 0,
    currentPhase(wibDate(new Date().toISOString())).catch(() => null),
  ]);
  const badge = (tab: Tab) => (tab === "notifikasi" ? unread : tab === "permintaan" ? waiting : 0);
  const onlyBod = bodOnly(member);
  // A BOD keeps the app's own frame (top bar, bottom bar) with the BOD menu, never the panitia sidebar.
  const menu = onlyBod ? bod : personal;
  const managed = onlyBod ? [] : manage.filter(item => !item.show || item.show(member));
  const panitiaView = !onlyBod && !!current && managedIds.has(current);
  // On a phone, "Kelola acara" is its own app with its own bottom bar.
  const phoneMenu = panitiaView && managed.length > 0 ? managed : menu;
  const side = (item: Item) => <a key={item.id} className={styles.sideItem} href={item.href} aria-current={item.id === current ? "page" : undefined}>
    {item.icon}<span>{item.label}</span>{badge(item.id) > 0 && <span className={styles.sideBadge}>{badge(item.id)}</span>}
  </a>;
  const phaseLabel = phase ? `${phase.kind === "pra_wam" ? "Pra WAM" : phase.name} · ${month(phase.startDate)}–${month(phase.endDate)} ${phase.endDate.slice(0, 4)}` : "WAM 2027";
  const who = member.nickname || member.name;
  return <div className={`${styles.app} ${back ? styles.pushed : ""} ${panitiaView ? styles.panitiaView : styles.appView}`}>
    <header className={styles.topBar}>
      <a className={styles.topBrand} href={onlyBod ? praWamPath.dashboard : praWamPath.home}><span aria-hidden />WAM</a>
      <span className={styles.phasePill}>{phaseLabel}</span>
      <nav className={styles.topNav} aria-label="Menu WAM">
        {menu.map(item => <a key={item.id} className={styles.topItem} href={item.href} aria-current={item.id === current ? "page" : undefined}>{item.icon}<span>{item.label}</span></a>)}
      </nav>
      <div className={styles.topRight}>
        {managed.length > 0 && <a className={styles.topManage} href={praWamPath.dashboard}><BarChart3 aria-hidden />Kelola acara{waiting > 0 && <span className={styles.sideBadge}>{waiting}</span>}</a>}
        <a className={styles.iconButton} href={praWamPath.notifications} aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : "Notifikasi"} aria-current={current === "notifikasi" ? "page" : undefined}>
          <Bell aria-hidden />{unread > 0 && <span className={styles.iconDot} />}
        </a>
        <a className={styles.person} href={praWamPath.account}><Avatar name={member.name} photo={member.photo ?? null} size="md" /><span><strong>{who}</strong><small>{member.department || roleSummary(member)}</small></span></a>
        <SignOutButton className={styles.signOut} />
      </div>
    </header>
    <div className={styles.frame}>
      <nav className={styles.sidebar} aria-label="Kelola acara">
        <a className={styles.brand} href={praWamPath.home}><strong>WAM</strong><span>{phaseLabel}</span></a>
        <p className={styles.sideLabel}>Kelola acara</p>
        {managed.map(side)}
        <div className={styles.sideFoot}>
          <a className={styles.sideExit} href={praWamPath.home}><ArrowLeft aria-hidden />Kembali ke aplikasi</a>
          <div className={styles.sideWho}>
            <div><strong>{who}</strong><small>{roleSummary(member)}</small></div>
            <SignOutButton className={styles.signOut} />
          </div>
        </div>
      </nav>
      <main className={styles.main} id="isi">
        {panitiaView && !back && <header className={`${styles.appBar} ${styles.manageBar}`}>
          <strong>Kelola acara</strong>
          <a className={styles.exit} href={praWamPath.home} aria-label="Keluar dari Kelola acara"><X aria-hidden />Keluar</a>
        </header>}
        {back && <header className={styles.appBar}>
          <a className={styles.back} href={back.href} aria-label="Kembali"><ChevronLeft aria-hidden /></a>
          <strong>{back.title}</strong>
        </header>}
        <div className={back ? styles.pushIn : undefined}>{children}</div>
      </main>
    </div>
    {!back && <nav className={styles.bottomNav} aria-label={panitiaView ? "Menu Kelola acara" : "Menu WAM"}>
      {phoneMenu.map(item => <a key={item.id} className={styles.navItem} href={item.href} aria-current={item.id === current ? "page" : undefined}>
        {item.icon}<span>{item.short ?? item.label}</span>
        {badge(item.id) > 0 && <span className={styles.navBadge}><span aria-hidden>{badge(item.id)}</span><span className="sr-only">, {badge(item.id)} menunggu</span></span>}
      </a>)}
    </nav>}
  </div>;
}

export { BackRow, ScreenHead } from "./ScreenHead";
