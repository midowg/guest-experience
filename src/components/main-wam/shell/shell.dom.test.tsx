import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { mainWamPath } from "@/lib/routes";
import { BottomNav } from "./BottomNav";
import { MainWamShell } from "./MainWamShell";
import { ShellActions, ShellChrome } from "./ShellSlots";

const nav = vi.hoisted(() => ({ pathname: "/wam/acara", back: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ back: nav.back, refresh: nav.refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(() => { cleanup(); nav.pathname = "/wam/acara"; });

const greeting = { kicker: "Selamat pagi · Sel, 5 Jan", name: "Rani", day: "Hari ke-2 dari 4" };

describe("BottomNav", () => {
  it("shows the four tabs in order, with addresses from mainWamPath, and lights the current one", () => {
    render(<BottomNav current="agenda" />);
    const bar = screen.getByRole("navigation", { name: "Navigasi utama" });
    const links = within(bar).getAllByRole("link");
    expect(links.map(link => link.textContent)).toEqual(["Beranda", "Agenda", "Momen", "Saya"]);
    expect(links.map(link => link.getAttribute("href"))).toEqual([mainWamPath.home, mainWamPath.agenda(), mainWamPath.moments(), mainWamPath.me]);
    expect(links.filter(link => link.getAttribute("aria-current") === "page").map(link => link.textContent)).toEqual(["Agenda"]);
  });

  it("draws a fifth tab, Panitia, at the right end after Saya, only for panitia (committee)", () => {
    const { unmount } = render(<BottomNav current="panitia" committee />);
    const links = within(screen.getByRole("navigation", { name: "Navigasi utama" })).getAllByRole("link");
    expect(links.map(link => link.textContent)).toEqual(["Beranda", "Agenda", "Momen", "Saya", "Panitia"]);
    expect(links[4].getAttribute("href")).toBe(mainWamPath.committee);
    expect(links.filter(link => link.getAttribute("aria-current") === "page").map(link => link.textContent)).toEqual(["Panitia"]);
    unmount();
    render(<BottomNav current="beranda" />);
    expect(screen.queryByRole("link", { name: "Panitia" })).toBeNull();
  });

  it("says a badge in the tab's name (count or dot) and lights nothing when no tab is current", () => {
    render(<BottomNav current={null} badges={{ momen: 12, saya: "dot", agenda: 0 }} />);
    expect(screen.getByRole("link", { name: "Momen, 12 baru" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Saya, ada yang baru" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Agenda" })).toBeTruthy();
    expect(document.querySelector("[aria-current]")).toBeNull();
  });
});

describe("MainWamShell", () => {
  it("lights the tab of the address: a session's detail is a sheet over Agenda, so Agenda's own frame stays (no back arrow)", () => {
    nav.pathname = mainWamPath.session("s-1");
    render(<MainWamShell greeting={greeting}><p>Isi</p></MainWamShell>);
    expect(screen.getByRole("link", { name: "Agenda" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("heading", { level: 1, name: "Agenda" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Kembali" })).toBeNull();
    expect(screen.getByRole("main").textContent).toBe("Isi");
  });

  it("keeps ‹ and the title on a detail screen under a tab", () => {
    nav.pathname = mainWamPath.gallery();
    render(<MainWamShell greeting={greeting}><p>Isi</p></MainWamShell>);
    expect(screen.getByRole("link", { name: "Momen" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Kembali" }).getAttribute("href")).toBe(mainWamPath.moments());
  });

  it("lights Panitia on the hub and on every tool under it, for panitia; the bar has no Panitia tab otherwise", () => {
    for (const path of [mainWamPath.committee, mainWamPath.rundownLive(), mainWamPath.attendanceManual(), mainWamPath.moderation()]) {
      nav.pathname = path;
      const { unmount } = render(<MainWamShell greeting={greeting} committee><p>Isi</p></MainWamShell>);
      expect(screen.getByRole("link", { name: "Panitia" }).getAttribute("aria-current"), path).toBe("page");
      unmount();
    }
    nav.pathname = mainWamPath.committee;
    render(<MainWamShell greeting={greeting} committee><p>Isi</p></MainWamShell>);
    expect(screen.getByRole("heading", { level: 1, name: "Panitia" })).toBeTruthy();
    cleanup();
    nav.pathname = mainWamPath.home;
    render(<MainWamShell greeting={greeting}><p>Isi</p></MainWamShell>);
    expect(screen.queryByRole("link", { name: "Panitia" })).toBeNull();
    expect(within(screen.getByRole("navigation", { name: "Navigasi utama" })).getAllByRole("link")).toHaveLength(4);
  });

  it("draws Beranda's greeting with the only bell, and the unread count in its name", () => {
    render(<MainWamShell greeting={greeting} unread={3}><p>Isi</p></MainWamShell>);
    expect(screen.getByRole("heading", { level: 1, name: "Rani" })).toBeTruthy();
    expect(screen.getByText("Hari ke-2 dari 4")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Notifikasi, 3 belum dibaca" }).getAttribute("href")).toBe(mainWamPath.notifications);
    expect(screen.getByRole("link", { name: "Beranda" }).getAttribute("aria-current")).toBe("page");
  });

  it("has no bell away from Beranda's root", () => {
    nav.pathname = mainWamPath.agenda();
    render(<MainWamShell greeting={greeting} unread={3}><p>Isi</p></MainWamShell>);
    expect(screen.queryByRole("link", { name: /Notifikasi/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Agenda" })).toBeTruthy();
  });

  it("Momen follows the theme like every tab: no dark surface, both bars drawn", () => {
    nav.pathname = mainWamPath.moments();
    const { container } = render(<MainWamShell greeting={greeting}><p>Isi</p></MainWamShell>);
    expect(container.querySelector('[data-mw-camera]')).toBeNull();
    expect(container.querySelector('[data-mw-tone]')).toBeNull();
    expect(screen.getByRole("link", { name: "Momen" }).getAttribute("aria-current")).toBe("page");
  });

  it("drops the bottom bar on a task screen (✕ Tutup), and both bars on the camera (it draws its own, in the theme)", () => {
    nav.pathname = mainWamPath.silentMeeting();
    const { unmount } = render(<MainWamShell greeting={greeting}><p>Isi</p></MainWamShell>);
    expect(screen.queryByRole("navigation", { name: "Navigasi utama" })).toBeNull();
    expect(screen.getByRole("link", { name: "Tutup" })).toBeTruthy();
    unmount();
    nav.pathname = mainWamPath.camera();
    const camera = render(<MainWamShell greeting={greeting}><p>Isi</p></MainWamShell>);
    expect(screen.queryByRole("navigation", { name: "Navigasi utama" })).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(camera.container.querySelector("[data-mw-camera]")).toBeNull();
  });

  it("puts a screen's actions in its top bar and lets a screen hide a bar", () => {
    nav.pathname = mainWamPath.session("s-1");
    render(<MainWamShell greeting={greeting}>
      <ShellActions><button type="button">Bagikan</button></ShellActions>
      <ShellChrome hideNav />
    </MainWamShell>);
    const bar = screen.getByRole("banner");
    expect(within(bar).getByRole("button", { name: "Bagikan" })).toBeTruthy();
    expect(document.querySelector("[data-mw-hide-nav]")).not.toBeNull();
  });
});
