import type { ReactNode } from "react";
import { ArrowLeft, ArrowLeftRight, BarChart3, Bell, CalendarDays, ChevronLeft, ClipboardList, DoorOpen, FileText, Home, Plus, Send, User, Users, Utensils, X } from "lucide-react";
import { ConsoleLogoutButton, ConsoleShell, type ConsoleNavGroup, type ConsoleSearchItem } from "@/components/console";
import { bodOnly, managesSessions, readsNeeds, roleSummary, seesAllSessions, type PraWamRole } from "@/lib/pra-wam/roles";
import { praWamApi, praWamPath } from "@/lib/routes";
import { unreadCount } from "@/lib/server/pra-wam/announcements";
import { openRequestCount } from "@/lib/server/pra-wam/requests";
import { currentPhase } from "@/lib/server/pra-wam/events";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { quickActionData } from "@/lib/server/pra-wam/quick-actions";
import type { Member } from "@/lib/server/pra-wam/session";
import { Avatar } from "./Avatar";
import { QuickActions } from "./QuickActions";
import { SignOutButton } from "./SignOutButton";
import styles from "./pra-wam.module.css";
import panel from "./panitia.module.css";

export type Tab = "beranda" | "agenda" | "appraisal" | "dokumen" | "notifikasi" | "akun" | "dashboard" | "sesi" | "permintaan" | "pengumuman" | "peserta" | "survei" | "kebutuhan";
type Who = { roles: readonly PraWamRole[] };
type Item = { id: Tab; label: string; href: string; icon: ReactNode; show?: (who: Who) => boolean; short?: string };

/**
 * Everyone (DS · Komponen "Bilah dan navigasi"): Beranda, Book, the blue + (Aksi cepat), Dokumen,
 * Profil. Agenda lives on Beranda now, day by day (decided 5 Nov 2026).
 */
const personal: Item[] = [
  { id: "beranda", label: "Beranda", href: praWamPath.home, icon: <Home aria-hidden /> },
  { id: "appraisal", label: "Book", href: praWamPath.appraisal(), icon: <DoorOpen aria-hidden /> },
  { id: "dokumen", label: "Dokumen", href: praWamPath.documents, icon: <FileText aria-hidden /> },
  { id: "akun", label: "Profil", href: praWamPath.account, icon: <User aria-hidden /> },
];
/** BOD only (Penpot "Panduan · BOD"): Ringkasan first; Agenda stays, as a BOD also takes part. No + : a BOD does not check in. */
const bod: Item[] = [
  { id: "dashboard", label: "Ringkasan", href: praWamPath.dashboard, icon: <BarChart3 aria-hidden /> },
  { id: "agenda", label: "Agenda", href: praWamPath.agenda, icon: <CalendarDays aria-hidden /> },
  { id: "peserta", label: "Peserta", href: praWamPath.people, icon: <Users aria-hidden /> },
  { id: "survei", label: "Survei", href: praWamPath.surveyResults, icon: <ClipboardList aria-hidden /> },
  { id: "akun", label: "Profil", href: praWamPath.account, icon: <User aria-hidden /> },
];
/** Panitia ("Kelola acara" in Penpot): the phone's bottom bar. */
const manage: Item[] = [
  { id: "dashboard", label: "Dashboard", href: praWamPath.dashboard, icon: <BarChart3 aria-hidden />, show: seesAllSessions },
  { id: "sesi", label: "Jadwal sesi", href: praWamPath.sessions, icon: <CalendarDays aria-hidden />, show: seesAllSessions },
  { id: "permintaan", label: "Permintaan jadwal", short: "Permintaan", href: praWamPath.requests, icon: <ArrowLeftRight aria-hidden />, show: managesSessions },
  { id: "pengumuman", label: "Pengumuman", href: praWamPath.announcements, icon: <Send aria-hidden />, show: managesSessions },
  { id: "kebutuhan", label: "Kebutuhan peserta", short: "Kebutuhan", href: praWamPath.needs, icon: <Utensils aria-hidden />, show: readsNeeds },
];

/**
 * Kelola acara on a desktop (docs/rancangan-admin-wam.md, part 3): the console sidebar's groups.
 * Each place shows only when the roles allow it, by the same checks as the pages; Peserta and
 * Survei, reached from inside before, now have their own place.
 */
const groups: { label: string; items: (Omit<Item, "icon"> & { icon: ReactNode })[] }[] = [
  { label: "Ikhtisar", items: [{ id: "dashboard", label: "Ringkasan", href: praWamPath.dashboard, icon: <BarChart3 size={20} />, show: seesAllSessions }] },
  { label: "Jadwal", items: [
    { id: "sesi", label: "Sesi", href: praWamPath.sessions, icon: <CalendarDays size={20} />, show: seesAllSessions },
    { id: "permintaan", label: "Permintaan jadwal", href: praWamPath.requests, icon: <ArrowLeftRight size={20} />, show: managesSessions },
  ] },
  { label: "Orang", items: [
    { id: "peserta", label: "Peserta", href: praWamPath.people, icon: <Users size={20} />, show: seesAllSessions },
    { id: "kebutuhan", label: "Kebutuhan peserta", href: praWamPath.needs, icon: <Utensils size={20} />, show: readsNeeds },
  ] },
  { label: "Komunikasi", items: [
    { id: "pengumuman", label: "Pengumuman", href: praWamPath.announcements, icon: <Send size={20} />, show: managesSessions },
    { id: "survei", label: "Survei", href: praWamPath.surveyResults, icon: <ClipboardList size={20} />, show: seesAllSessions },
  ] },
];

/** Every place in "Kelola acara", also those without a bottom bar item of their own (Peserta, Survei). */
const managedIds = new Set<Tab>([...manage.map(item => item.id), "peserta", "survei"]);
const month = (date: string) => new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/** The sidebar's groups for this person, each place only when their roles allow it; an empty group goes. */
export function manageGroups(who: Who, waiting = 0): ConsoleNavGroup[] {
  return groups.map(group => ({
    label: group.label,
    items: group.items.filter(item => !item.show || item.show(who)).map(item => ({
      key: item.id, label: item.label, href: item.href, icon: item.icon,
      badge: item.id === "permintaan" && waiting > 0 ? String(waiting) : undefined,
      badgeLabel: item.id === "permintaan" ? "permintaan menunggu" : undefined,
    })),
  })).filter(group => group.items.length > 0);
}

/**
 * The frame of every signed-in WAM page, as in Penpot.
 * - Phone: the page and a floating glass bottom bar (Beranda, Book, +, Dokumen, Profil). A detail
 *   screen (`back`) is a pushed screen: a top bar with a back arrow and the title, no bottom bar,
 *   sliding in from the right.
 * - Phone, "Kelola acara": an app of its own. A top bar with its name and "Keluar" back to the
 *   app, and a bottom bar with the panitia's places. A BOD keeps the BOD menu instead.
 * - Desktop, the app (E1, E2): a top bar with the brand, the phase, the menu in the middle, and the
 *   bell and the person on the right.
 * - Desktop, "Kelola acara": the console (src/components/console), its sidebar with the panitia's
 *   places in groups and the page in one white panel, on the app's own light or dark tokens.
 */
export async function PraWamShell({ member, current, back, children }: { member: { id: string; name: string; nickname: string; department: string; roles: PraWamRole[]; photo?: string | null }; current?: Tab; back?: { href: string; title: string }; children: ReactNode }) {
  const onlyBod = bodOnly(member);
  const [unread, waiting, phase, quick] = await Promise.all([
    unreadCount(member.id), managesSessions(member) ? openRequestCount() : 0,
    currentPhase(wibDate(new Date().toISOString())).catch(() => null),
    // Aksi cepat, in the app's own frame only and never for a BOD.
    onlyBod || back ? null : quickActionData(member as Member).catch(() => null),
  ]);
  const badge = (tab: Tab) => (tab === "notifikasi" ? unread : tab === "permintaan" ? waiting : 0);
  // A BOD keeps the app's own frame (top bar, bottom bar) with the BOD menu, never the panitia sidebar.
  const menu = onlyBod ? bod : personal;
  const managed = onlyBod ? [] : manage.filter(item => !item.show || item.show(member));
  const panitiaView = !onlyBod && !!current && managedIds.has(current);
  const phaseLabel = phase ? `${phase.kind === "pra_wam" ? "Pra WAM" : phase.name} · ${month(phase.startDate)}–${month(phase.endDate)} ${phase.endDate.slice(0, 4)}` : "WAM 2027";
  const who = member.nickname || member.name;
  const quickProps = {
    checkIn: quick?.checkIn ?? null, upcoming: quick?.upcoming ?? null, bookingOpen: quick?.bookingOpen ?? false,
    manages: managesSessions(member), running: quick?.running ?? [], waiting, now: new Date().toISOString(),
  };

  if (panitiaView) {
    const searchItems: ConsoleSearchItem[] = [
      ...(managesSessions(member) ? [{ key: "buat-sesi", label: "Buat sesi", href: praWamPath.newSession, sub: "Jadwal", icon: <Plus size={20} /> }] : []),
      { key: "notifikasi", label: unread ? `Notifikasi (${unread} belum dibaca)` : "Notifikasi", href: praWamPath.notifications, sub: "Aplikasi", icon: <Bell size={20} /> },
      { key: "profil", label: "Profil", href: praWamPath.account, sub: "Aplikasi", icon: <User size={20} /> },
    ];
    // On a phone the console's own bar and drawer stay hidden (panitia.module.css): the app's bar
    // and the panitia's bottom bar stand in for them, as before.
    return <div className={`${styles.app} ${back ? styles.pushed : ""}`}>
      {back
        ? <header className={`${panel.phoneBar} ${panel.phoneBarBack}`}>
          <a className={styles.back} href={back.href} aria-label="Kembali"><ChevronLeft aria-hidden /></a>
          <strong>{back.title}</strong>
        </header>
        : <header className={panel.phoneBar}>
          <strong>Kelola acara</strong>
          <a className={styles.exit} href={praWamPath.home} aria-label="Keluar dari Kelola acara"><X aria-hidden />Keluar</a>
        </header>}
      <ConsoleShell theme="pw" area="Kelola acara" storageKey="wam-manage" className={`${panel.console} ${back ? panel.consolePushed : ""}`}
        person={{ name: who, sub: roleSummary(member), photo: member.photo ?? undefined }}
        groups={manageGroups(member, waiting)} current={current} pageTitle={back?.title}
        footerLinks={[{ key: "app", label: "Kembali ke aplikasi", href: praWamPath.home, icon: <ArrowLeft size={20} /> }]}
        footer={<ConsoleLogoutButton endpoint={praWamApi.logout} redirectTo={praWamPath.login()} />}
        searchItems={searchItems} searchPlaceholder="Cari halaman">
        {back ? <div className={`${styles.pushIn} ${panel.pushedBody}`}>{children}</div> : children}
      </ConsoleShell>
      {!back && <nav className={styles.bottomNav} aria-label="Menu Kelola acara">
        {(managed.length > 0 ? managed : menu).map(item => <a key={item.id} className={styles.navItem} href={item.href} aria-current={item.id === current ? "page" : undefined}>
          {item.icon}<span>{item.short ?? item.label}</span>
          {badge(item.id) > 0 && <span className={styles.navBadge}><span aria-hidden>{badge(item.id)}</span><span className="sr-only">, {badge(item.id)} menunggu</span></span>}
        </a>)}
      </nav>}
    </div>;
  }

  return <div className={`${styles.app} ${back ? styles.pushed : ""} ${styles.appView}`}>
    <header className={styles.topBar}>
      <a className={styles.topBrand} href={onlyBod ? praWamPath.dashboard : praWamPath.home}><span aria-hidden />WAM</a>
      <span className={styles.phasePill}>{phaseLabel}</span>
      <nav className={styles.topNav} aria-label="Menu WAM">
        {menu.map(item => <a key={item.id} className={styles.topItem} href={item.href} aria-current={item.id === current ? "page" : undefined}>{item.icon}<span>{item.label}</span></a>)}
      </nav>
      <div className={styles.topRight}>
        {!onlyBod && <QuickActions place="top" {...quickProps} />}
        {managed.length > 0 && <a className={styles.topManage} href={praWamPath.dashboard}><BarChart3 aria-hidden />Kelola acara{waiting > 0 && <span className={styles.sideBadge}>{waiting}</span>}</a>}
        <a className={styles.iconButton} href={praWamPath.notifications} aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : "Notifikasi"} aria-current={current === "notifikasi" ? "page" : undefined}>
          <Bell aria-hidden />{unread > 0 && <span className={styles.iconDot} />}
        </a>
        <a className={styles.person} href={praWamPath.account}><Avatar name={member.name} photo={member.photo ?? null} size="md" /><span><strong>{who}</strong><small>{member.department || roleSummary(member)}</small></span></a>
        <SignOutButton className={styles.signOut} />
      </div>
    </header>
    <div className={styles.frame}>
      <main className={styles.main} id="isi">
        {back && <header className={styles.appBar}>
          <a className={styles.back} href={back.href} aria-label="Kembali"><ChevronLeft aria-hidden /></a>
          <strong>{back.title}</strong>
        </header>}
        <div className={back ? styles.pushIn : undefined}>{children}</div>
      </main>
    </div>
    {!back && <nav className={styles.bottomNav} aria-label="Menu WAM">
      {menu.map((item, index) => [
        // The blue + sits in the middle of the bar, between Book and Dokumen.
        !onlyBod && index === 2 && <QuickActions key="aksi-cepat" place="bar" {...quickProps} />,
        <a key={item.id} className={styles.navItem} href={item.href} aria-current={item.id === current ? "page" : undefined}>
          {item.icon}<span>{item.short ?? item.label}</span>
          {badge(item.id) > 0 && <span className={styles.navBadge}><span aria-hidden>{badge(item.id)}</span><span className="sr-only">, {badge(item.id)} menunggu</span></span>}
        </a>,
      ])}
    </nav>}
  </div>;
}

export { BackRow, ScreenHead } from "./ScreenHead";
