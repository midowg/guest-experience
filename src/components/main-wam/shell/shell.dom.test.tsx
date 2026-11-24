import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { mainWamPath } from "@/lib/routes";
import { BottomNav } from "./BottomNav";
import { MainWamShell } from "./MainWamShell";
import { ShellActions, ShellChrome } from "./ShellSlots";

const nav = vi.hoisted(() => ({ pathname: "/wam2026", back: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ back: nav.back, refresh: nav.refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(() => { cleanup(); nav.pathname = "/wam2026"; });

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

  it("a detail screen has ‹ and its title in the top bar and no bottom bar (a page opened from a tab)", () => {
    nav.pathname = mainWamPath.mosaic();
    render(<MainWamShell greeting={greeting}><p>Isi</p></MainWamShell>);
    expect(screen.queryByRole("navigation", { name: "Navigasi utama" })).toBeNull();
    expect(screen.getByRole("link", { name: "Kembali" }).getAttribute("href")).toBe(mainWamPath.moments());
    expect(document.querySelector("[data-mw-nav]")).toBeNull();
  });

  it("draws the bottom bar on the four tab roots alone (the lit tab each), and on none of the pages opened from them", () => {
    const roots: [string, string][] = [[mainWamPath.home, "Beranda"], [mainWamPath.agenda(), "Agenda"], [mainWamPath.moments(), "Momen"], [mainWamPath.me, "Saya"]];
    for (const [path, tab] of roots) {
      nav.pathname = path;
      const { unmount } = render(<MainWamShell greeting={greeting}><p>Isi</p></MainWamShell>);
      expect(within(screen.getByRole("navigation", { name: "Navigasi utama" })).getAllByRole("link"), path).toHaveLength(4);
      expect(screen.getByRole("link", { name: tab }).getAttribute("aria-current"), path).toBe("page");
      expect(document.querySelector("[data-mw-nav]"), path).not.toBeNull();
      unmount();
    }
    const pages = [mainWamPath.notifications, mainWamPath.missions, mainWamPath.mosaic(), mainWamPath.room, mainWamPath.travel("pulang"), mainWamPath.guides, mainWamPath.guide("denah-venue"),
      mainWamPath.settings, mainWamPath.help, mainWamPath.carbon(), mainWamPath.awards, mainWamPath.silentMeeting(), mainWamPath.camera(), mainWamPath.rundownLive(2), mainWamPath.moderation()];
    for (const path of pages) {
      nav.pathname = path;
      const { unmount } = render(<MainWamShell greeting={greeting} committee><p>Isi</p></MainWamShell>);
      expect(screen.queryByRole("navigation", { name: "Navigasi utama" }), path).toBeNull();
      expect(document.querySelector("[data-mw-nav]"), path).toBeNull();
      unmount();
    }
  });

  it("every page without the bottom bar still has a way back in its top bar (‹ or ✕), except the screens that draw their own (the camera)", () => {
    for (const path of [mainWamPath.notifications, mainWamPath.missions, mainWamPath.room, mainWamPath.guides, mainWamPath.settings, mainWamPath.help, mainWamPath.carbon(), mainWamPath.awards, mainWamPath.silentMeeting(), mainWamPath.rundownLive(2)]) {
      nav.pathname = path;
      const { unmount } = render(<MainWamShell greeting={greeting}><p>Isi</p></MainWamShell>);
      const back = screen.queryByRole("link", { name: "Kembali" }) ?? screen.queryByRole("link", { name: "Tutup" });
      expect(back, path).not.toBeNull();
      unmount();
    }
  });

  it("Detail sesi opened from inside the app is a sheet over the screen that stays: Beranda keeps its greeting, bell and bar; a page behind keeps none", () => {
    nav.pathname = mainWamPath.home;
    const view = render(<MainWamShell greeting={greeting} unread={2}><p>Isi</p></MainWamShell>);
    nav.pathname = mainWamPath.session("s-1");
    view.rerender(<MainWamShell greeting={greeting} unread={2}><p>Isi</p></MainWamShell>);
    expect(screen.getByRole("heading", { level: 1, name: "Rani" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Notifikasi/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Beranda" }).getAttribute("aria-current")).toBe("page");
    // Closing goes back to the screen itself; a page that has no bar behind the sheet stays without one.
    nav.pathname = mainWamPath.notifications;
    view.rerender(<MainWamShell greeting={greeting} unread={2}><p>Isi</p></MainWamShell>);
    nav.pathname = mainWamPath.session("s-2");
    view.rerender(<MainWamShell greeting={greeting} unread={2}><p>Isi</p></MainWamShell>);
    expect(screen.queryByRole("navigation", { name: "Navigasi utama" })).toBeNull();
    expect(screen.getByRole("link", { name: "Kembali" }).getAttribute("href")).toBe(mainWamPath.home);
  });

  it("lights Panitia on the hub, the only panitia screen with the bar (its tools are pages with ‹ back to the hub); the bar has no Panitia tab otherwise", () => {
    nav.pathname = mainWamPath.committee;
    const hub = render(<MainWamShell greeting={greeting} committee><p>Isi</p></MainWamShell>);
    expect(screen.getByRole("link", { name: "Panitia" }).getAttribute("aria-current")).toBe("page");
    hub.unmount();
    for (const path of [mainWamPath.rundownLive(), mainWamPath.attendanceManual(), mainWamPath.moderation()]) {
      nav.pathname = path;
      const { unmount } = render(<MainWamShell greeting={greeting} committee><p>Isi</p></MainWamShell>);
      expect(screen.queryByRole("link", { name: "Panitia" }), path).toBeNull();
      expect(screen.getByRole("link", { name: "Kembali" }).getAttribute("href"), path).toBe(mainWamPath.committee);
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

  it("has no bell away from Beranda's root: not on Agenda, Momen, Saya, nor on any page", () => {
    nav.pathname = mainWamPath.agenda();
    const first = render(<MainWamShell greeting={greeting} unread={3}><p>Isi</p></MainWamShell>);
    expect(screen.queryByRole("link", { name: /Notifikasi/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Agenda" })).toBeTruthy();
    first.unmount();
    for (const path of [mainWamPath.moments(), mainWamPath.me, mainWamPath.committee, mainWamPath.missions, mainWamPath.settings, mainWamPath.session("s-1")]) {
      nav.pathname = path;
      const { unmount } = render(<MainWamShell greeting={greeting} unread={3} committee><p>Isi</p></MainWamShell>);
      expect(screen.queryByRole("link", { name: /Notifikasi/ }), path).toBeNull();
      unmount();
    }
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
