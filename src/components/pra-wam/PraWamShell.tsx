import type { ReactNode } from "react";
import { ArrowLeftRight, BarChart3, Bell, CalendarClock, CalendarDays, ChevronLeft, FileText, Home, Send, User } from "lucide-react";
import { managesSessions, roleSummary, seesAllSessions, type PraWamRole } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { unreadCount } from "@/lib/server/pra-wam/announcements";
import { openRequestCount } from "@/lib/server/pra-wam/requests";
import { SignOutButton } from "./SignOutButton";
import styles from "./pra-wam.module.css";

export type Tab = "beranda" | "agenda" | "appraisal" | "dokumen" | "notifikasi" | "akun" | "dashboard" | "sesi" | "permintaan" | "pengumuman";
type Who = { roles: readonly PraWamRole[] };
type Item = { id: Tab; label: string; href: string; icon: ReactNode; show?: (who: Who) => boolean };

/** Everyone: the phone's bottom bar shows these, the desktop sidebar too (with Notifikasi). */
const personal: Item[] = [
  { id: "beranda", label: "Beranda", href: praWamPath.home, icon: <Home aria-hidden /> },
  { id: "agenda", label: "Agenda", href: praWamPath.agenda, icon: <CalendarDays aria-hidden /> },
  { id: "appraisal", label: "Appraisal", href: praWamPath.appraisal(), icon: <CalendarClock aria-hidden /> },
  { id: "dokumen", label: "Dokumen", href: praWamPath.documents, icon: <FileText aria-hidden /> },
  { id: "akun", label: "Profil", href: praWamPath.account, icon: <User aria-hidden /> },
];
/** Panitia ("Kelola acara" in Penpot) and BOD, reading. */
const manage: Item[] = [
  { id: "dashboard", label: "Dashboard", href: praWamPath.dashboard, icon: <BarChart3 aria-hidden />, show: seesAllSessions },
  { id: "sesi", label: "Jadwal sesi", href: praWamPath.sessions, icon: <CalendarDays aria-hidden />, show: seesAllSessions },
  { id: "permintaan", label: "Permintaan jadwal", href: praWamPath.requests, icon: <ArrowLeftRight aria-hidden />, show: managesSessions },
  { id: "pengumuman", label: "Pengumuman", href: praWamPath.announcements, icon: <Send aria-hidden />, show: managesSessions },
];

/**
 * The frame of every signed-in Pra WAM page, as in Penpot: on a phone the page and a bottom bar
 * (Beranda · Agenda · Appraisal · Dokumen · Profil); from 1024px a sidebar with the same places,
 * Notifikasi, and for panitia and BOD the "Kelola acara" part. A detail screen (`back`) works like
 * a pushed screen on a phone: a top bar with a back arrow and the title, no bottom bar, and the
 * page slides in from the right.
 */
export async function PraWamShell({ member, current, back, children }: { member: { id: string; name: string; nickname: string; department: string; roles: PraWamRole[] }; current?: Tab; back?: { href: string; title: string }; children: ReactNode }) {
  const [unread, waiting] = await Promise.all([unreadCount(member.id), managesSessions(member) ? openRequestCount() : 0]);
  const badge = (tab: Tab) => (tab === "notifikasi" ? unread : tab === "permintaan" ? waiting : 0);
  const side = (item: Item) => <a key={item.id} className={styles.sideItem} href={item.href} aria-current={item.id === current ? "page" : undefined}>
    {item.icon}<span>{item.label}</span>{badge(item.id) > 0 && <span className={styles.sideBadge}>{badge(item.id)}</span>}
  </a>;
  const managed = manage.filter(item => !item.show || item.show(member));
  return <div className={`${styles.app} ${back ? styles.pushed : ""}`}>
    <div className={styles.frame}>
      <nav className={styles.sidebar} aria-label="Menu WAM">
        <a className={styles.brand} href={praWamPath.home}><strong>WAM</strong><span>Nov–Des 2026 · menuju WAM 2027</span></a>
        {personal.slice(0, 4).map(side)}
        {side({ id: "notifikasi", label: "Notifikasi", href: praWamPath.notifications, icon: <Bell aria-hidden /> })}
        {side(personal[4])}
        {managed.length > 0 && <><p className={styles.sideLabel}>Kelola acara</p>{managed.map(side)}</>}
        <div className={styles.sideFoot}>
          <div><strong>{member.nickname || member.name}</strong><small>{roleSummary(member)}</small></div>
          <SignOutButton className={styles.signOut} />
        </div>
      </nav>
      <main className={styles.main} id="isi">
        {back && <header className={styles.appBar}>
          <a className={styles.back} href={back.href} aria-label="Kembali"><ChevronLeft aria-hidden /></a>
          <strong>{back.title}</strong>
        </header>}
        <div className={back ? styles.pushIn : undefined}>{children}</div>
      </main>
    </div>
    {!back && <nav className={styles.bottomNav} aria-label="Menu WAM">
      {personal.map(item => <a key={item.id} className={styles.navItem} href={item.href} aria-current={item.id === current ? "page" : undefined}>
        {item.icon}<span>{item.label}</span>
      </a>)}
    </nav>}
  </div>;
}

export { BackRow, ScreenHead } from "./ScreenHead";
