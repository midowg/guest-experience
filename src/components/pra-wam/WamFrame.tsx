"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowLeftRight, BarChart3, Bell, CalendarCheck, CalendarDays, ChartGantt, ChevronLeft, FileText, Home, Plus, Send, User, Users, X } from "lucide-react";
import { ConsoleLogoutButton, ConsoleShell, type ConsoleNavGroup, type ConsoleSearchItem } from "@/components/console";
import { bodOnly, managesSessions, roleSummary, seesAllSessions, type PraWamRole } from "@/lib/pra-wam/roles";
import { managedTabs, wamScreen, type Tab } from "@/lib/pra-wam/screen";
import { praWamApi, praWamPath } from "@/lib/routes";
import { Avatar } from "./Avatar";
import { SignOutButton } from "./SignOutButton";
import styles from "./pra-wam.module.css";
import panel from "./panitia.module.css";

type Who = { roles: readonly PraWamRole[] };
type Item = { id: Tab; label: string; href: string; icon: ReactNode; show?: (who: Who) => boolean; short?: string };
export type FrameMember = { id: string; name: string; nickname: string; department: string; roles: PraWamRole[]; photo?: string | null };

/**
 * Everyone (DS · Komponen "Bilah dan navigasi"): Beranda, Agenda (Book ruang and Booking saya; named
 * Agenda on 9 Nov 2026), Timeline, Dokumen. Agenda lives on
 * Beranda, day by day (5 Nov 2026). Since 9 Nov 2026 no blue + (Aksi cepat: check-in is on Beranda,
 * Book has its tab) and no Profil (the photo at the top of Beranda, or the person at the top right
 * on a desktop, opens it); Timeline shows Pra WAM's forums and events from Kelola acara.
 */
const personal: Item[] = [
  { id: "beranda", label: "Beranda", href: praWamPath.home, icon: <Home aria-hidden /> },
  { id: "appraisal", label: "Agenda", href: praWamPath.appraisal(), icon: <CalendarCheck aria-hidden /> },
  { id: "timeline", label: "Timeline", href: praWamPath.timeline, icon: <ChartGantt aria-hidden /> },
  { id: "dokumen", label: "Dokumen", href: praWamPath.documents, icon: <FileText aria-hidden /> },
];
/** BOD only (Penpot "Panduan · BOD"): Ringkasan first; Agenda stays, as a BOD also takes part. No + : a BOD does not check in. */
const bod: Item[] = [
  { id: "dashboard", label: "Ringkasan", href: praWamPath.dashboard, icon: <BarChart3 aria-hidden /> },
  { id: "agenda", label: "Agenda", href: praWamPath.agenda, icon: <CalendarDays aria-hidden /> },
  { id: "peserta", label: "Peserta", href: praWamPath.people, icon: <Users aria-hidden /> },
  { id: "akun", label: "Profil", href: praWamPath.account, icon: <User aria-hidden /> },
];
/** Panitia ("Kelola acara" in Penpot): the phone's bottom bar. */
const manage: Item[] = [
  { id: "dashboard", label: "Dashboard", href: praWamPath.dashboard, icon: <BarChart3 aria-hidden />, show: seesAllSessions },
  { id: "sesi", label: "Jadwal sesi", href: praWamPath.sessions, icon: <CalendarDays aria-hidden />, show: seesAllSessions },
  { id: "permintaan", label: "Permintaan jadwal", short: "Permintaan", href: praWamPath.requests, icon: <ArrowLeftRight aria-hidden />, show: managesSessions },
  { id: "pengumuman", label: "Pengumuman", href: praWamPath.announcements, icon: <Send aria-hidden />, show: managesSessions },
];

/**
 * Kelola acara on a desktop (docs/rancangan-admin-wam.md, part 3): the console sidebar's groups.
 * Each place shows only when the roles allow it, by the same checks as the pages; Peserta and
 * Survei, reached from inside before, now have their own place.
 */
const groups: { label: string; items: Item[] }[] = [
  { label: "Ikhtisar", items: [{ id: "dashboard", label: "Ringkasan", href: praWamPath.dashboard, icon: <BarChart3 size={20} />, show: seesAllSessions }] },
  { label: "Jadwal", items: [
    { id: "sesi", label: "Sesi", href: praWamPath.sessions, icon: <CalendarDays size={20} />, show: seesAllSessions },
    { id: "permintaan", label: "Permintaan jadwal", href: praWamPath.requests, icon: <ArrowLeftRight size={20} />, show: managesSessions },
  ] },
  { label: "Orang", items: [
    { id: "peserta", label: "Peserta", href: praWamPath.people, icon: <Users size={20} />, show: seesAllSessions },
  ] },
  { label: "Komunikasi", items: [
    { id: "pengumuman", label: "Pengumuman", href: praWamPath.announcements, icon: <Send size={20} />, show: managesSessions },
    // Uploading documents and materials lives here only (9 Nov 2026), not in the participant app.
    { id: "materi", label: "Dokumen", href: praWamPath.manageDocuments, icon: <FileText size={20} />, show: managesSessions },
  ] },
];

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

/** Back in the app after this long away (another app, a locked phone): fetch the frame's counts again. */
const STALE_AFTER_MS = 60_000;

/**
 * The frame of every signed-in WAM page, as in Penpot. It lives in the shared layout, so it is drawn
 * once and stays while the screens under it change: a tap shows the new tab lit at once and the
 * screen's skeleton (loading.tsx) inside the frame, then the screen itself, like an installed app.
 * What it shows for a screen comes from the address (wamScreen), never from the page.
 * - Phone: the page and a floating glass bottom bar (Beranda, Agenda, Timeline, Dokumen). A detail
 *   screen (`back`) is a pushed screen: a top bar with a back arrow and the title, no bottom bar,
 *   sliding in from the right.
 * - Phone, "Kelola acara": an app of its own. A top bar with its name and "Keluar" back to the
 *   app, and a bottom bar with the panitia's places. A BOD keeps the BOD menu instead.
 * - Desktop, the app (E1, E2): a top bar with the brand, the phase, the menu in the middle, and the
 *   bell and the person on the right.
 * - Desktop, "Kelola acara": the console (src/components/console), its sidebar with the panitia's
 *   places in groups and the page in one white panel, on the app's own light or dark tokens.
 */
export function WamFrame({ member, unread, waiting, phaseLabel, children }: {
  member: FrameMember; unread: number; waiting: number; phaseLabel: string; children: ReactNode;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const onlyBod = bodOnly(member);
  // Where the person was before: a session's detail opened from Kelola acara stays in Kelola acara.
  const [fromPanitia, setFromPanitia] = useState(false);
  const { current, back } = useMemo(
    () => wamScreen(pathname, search, { id: member.id, bod: onlyBod }, fromPanitia),
    [pathname, search, member.id, onlyBod, fromPanitia],
  );
  const isSessionDetail = pathname.startsWith(`${praWamPath.session("")}`);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remembering the screen just left
    if (!isSessionDetail) setFromPanitia(!!current && managedTabs.has(current));
  }, [current, isSessionDetail]);
  // The counts in the frame (unread, waiting) are fetched with the frame; coming back
  // to the app after a while fetches them again.
  useEffect(() => {
    let hiddenAt = 0;
    const onVisible = () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > STALE_AFTER_MS) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  const badge = (tab: Tab) => (tab === "notifikasi" ? unread : tab === "permintaan" ? waiting : 0);
  // A BOD keeps the app's own frame (top bar, bottom bar) with the BOD menu, never the panitia sidebar.
  // With invitations waiting, Book opens on Meeting HOD, where they are answered.
  const menu = onlyBod ? bod : personal;
  const managed = onlyBod ? [] : manage.filter(item => !item.show || item.show(member));
  const panitiaView = !onlyBod && !!current && managedTabs.has(current);
  const who = member.nickname || member.name;

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
        {/* One wrapper either way, so the screen under it is not mounted afresh when it changes. */}
        <div className={back ? `${styles.pushIn} ${panel.pushedBody}` : styles.contents}>{children}</div>
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
        {menu.map(item => <a key={item.id} className={styles.topItem} href={item.href} aria-current={item.id === current ? "page" : undefined}>{item.icon}<span>{item.label}</span>{badge(item.id) > 0 && <span className={styles.sideBadge}>{badge(item.id)}</span>}</a>)}
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
      <main className={styles.main} id="isi">
        {back && <header className={styles.appBar}>
          <a className={styles.back} href={back.href} aria-label="Kembali"><ChevronLeft aria-hidden /></a>
          <strong>{back.title}</strong>
        </header>}
        <div className={back ? styles.pushIn : undefined}>{children}</div>
      </main>
    </div>
    {!back && <nav className={styles.bottomNav} aria-label="Menu WAM">
      {menu.map(item => <a key={item.id} className={styles.navItem} href={item.href} aria-current={item.id === current ? "page" : undefined}>
        {item.icon}<span>{item.short ?? item.label}</span>
        {badge(item.id) > 0 && <span className={styles.navBadge}><span aria-hidden>{badge(item.id)}</span><span className="sr-only">, {badge(item.id)} menunggu</span></span>}
      </a>)}
    </nav>}
  </div>;
}
