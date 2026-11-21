"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Bell, FlaskConical, X } from "lucide-react";
import { mainWamScreen, showsBell, showsBottomBar, type MainWamScreen } from "@/lib/main-wam/screen";
import { mainWamPath } from "@/lib/routes";
import { useLang, useT } from "@/components/main-wam/i18n";
import { IconButton } from "../ui/Button";
import { cx } from "../ui/Pressable";
import { ToastProvider } from "../ui/Toast";
import { TopBar } from "../ui/TopBar";
import { BottomNav, type TabBadges } from "./BottomNav";
import { ActionsSlotContext } from "./ShellSlots";
import { setTrailDepth } from "./trail";
import css from "./shell.module.css";

/** Back in the app after this long away (another app, a locked phone): fetch the frame's counts again. */
const STALE_AFTER_MS = 60_000;

export type ShellGreeting = {
  /** "Selamat pagi · Sel, 5 Jan". */
  kicker: string;
  /** Call name ("Rani"). */
  name: string;
  /** "Hari ke-2 dari 4" during the event. */
  day?: string;
  /** The same as segment dots before the bell (current day, how many days, the words for screen readers). */
  dayDots?: { total: number; current: number; label: string };
};

/**
 * Main WAM's frame, drawn once by the layout and kept while the screens under it change (aturan WAM
 * §8: no full reload, the new tab lit at once, the screen's loading.tsx inside the frame). What it
 * draws comes from the address alone (mainWamScreen, src/lib/main-wam/screen.ts), never from the page:
 * - top bar: Beranda's greeting with the bell (the only bell), a tab's large title (a compact bar
 *   takes over once it scrolls away), or ‹ + title on a detail screen and ✕ + title on a task
 *   screen. The camera has its own. A screen adds buttons with <ShellActions> and can
 *   turn a bar off with <ShellChrome>.
 * - bottom bar on tab roots and details, never on tasks.
 * - toasts (ToastProvider) above the bottom bar.
 * Safe areas (notch, home bar) are padded; on a wide screen the app is a phone-wide column.
 * Wrap it in <MainWamTheme>. `screen` forces a frame (previews only).
 */
export function MainWamShell({ children, greeting, unread = 0, badges, committee = false, demo = false, screen: forced }: {
  children: ReactNode;
  /** Beranda's head (from the layout, on the server). */
  greeting?: ShellGreeting;
  /** Unread notifications: the bell's badge. */
  unread?: number;
  /** Counts or dots on the tabs. */
  badges?: TabBadges;
  /** The viewer is panitia: the bottom bar has the fifth tab, Panitia (decided on the server, showsCommitteeTab). */
  committee?: boolean;
  /** Mode demo is on: a small "Mode demo · data contoh" strip above the top bar, so sample data is never taken for real (Admin WAM → Pengaturan). */
  demo?: boolean;
  /** Preview only: draw this frame instead of the address's. */
  screen?: MainWamScreen | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { lang } = useLang();
  const t = useT();
  const screen = forced !== undefined ? forced : mainWamScreen(pathname ?? "", lang);
  const camera = !!screen?.camera;
  const nav = showsBottomBar(screen);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [compact, setCompact] = useState(false);
  const largeRef = useRef<HTMLDivElement>(null);
  // The in-app trail, so ‹ goes back like a phone app and falls back to the parent screen when the
  // screen was opened from outside (a notification, a QR).
  const trail = useRef<string[]>([]);

  useEffect(() => {
    const here = pathname ?? "";
    const list = trail.current;
    if (list.length >= 2 && list[list.length - 2] === here) list.pop();
    else if (list[list.length - 1] !== here) list.push(here);
    setTrailDepth(list.length);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    // Read once the screen has painted (a new screen may open scrolled), then on every scroll.
    const frame = window.requestAnimationFrame(onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("scroll", onScroll); };
  }, [pathname]);

  const large = screen?.level === "akar" && !(screen.tab === "beranda" && greeting);
  useEffect(() => {
    const element = largeRef.current;
    if (!large || !element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting), { threshold: 0 });
    observer.observe(element);
    return () => { observer.disconnect(); setCompact(false); };
  }, [large, pathname]);

  useEffect(() => {
    let hiddenAt = 0;
    const onVisible = () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > STALE_AFTER_MS) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  function goBack(event: MouseEvent<HTMLElement>) {
    if (trail.current.length < 2) return; // follow the link: the parent screen
    event.preventDefault();
    router.back();
  }

  const actions = <span ref={setSlot} className={css.actions} />;
  let top: ReactNode = null;
  if (screen && !camera) {
    if (screen.level === "akar" && screen.tab === "beranda" && greeting) {
      const bell = showsBell(screen)
        ? <IconButton variant="tonal" icon={<Bell />} label={unread > 0 ? t("shell.bellUnread", { n: unread }) : t("shell.bell")} href={mainWamPath.notifications} badge={unread > 0 ? unread : undefined} />
        : null;
      top = <div className={css.top}><TopBar variant="home" kicker={greeting.kicker} name={greeting.name} day={greeting.day} dayDots={greeting.dayDots} actions={<>{actions}{bell}</>} /></div>;
    } else if (screen.level === "akar") {
      top = <>
        <div ref={largeRef} className={css.top}><TopBar title={screen.title} actions={actions} /></div>
        <div className={css.compact} data-shown={(large && compact) || undefined} aria-hidden><div className={css.compactTitle}>{screen.title}</div></div>
      </>;
    } else {
      const task = screen.level === "tugas";
      top = <div className={cx(css.top, css.topSticky)} data-scrolled={scrolled || undefined}>
        <TopBar variant="back" title={screen.title} label={screen.label} actions={actions}
          backHref={screen.back?.href ?? mainWamPath.home} onBack={goBack}
          backLabel={task ? t("shell.closeTask") : t("shell.back")} backIcon={task ? <X /> : undefined} />
      </div>;
    }
  }

  return <div className={css.app} data-mw-nav={nav ? "" : undefined} data-mw-demo={demo && !camera ? "" : undefined}
    style={nav ? { ["--mw-toast-bottom" as string]: "calc(var(--mw-nav-h) + var(--mw-space-16))" } : undefined}>
    <ToastProvider>
      <ActionsSlotContext.Provider value={slot}>
        <div className={css.column}>
          <a className={css.skip} href="#isi">{t("shell.skip")}</a>
          {demo && !camera && <div className={css.demo} role="status"><FlaskConical aria-hidden />{t("demo.banner")}</div>}
          {top}
          <main id="isi" tabIndex={-1} className={css.main}>{children}</main>
          {nav && <BottomNav current={screen?.tab ?? null} badges={badges} committee={committee} />}
        </div>
      </ActionsSlotContext.Provider>
    </ToastProvider>
  </div>;
}
