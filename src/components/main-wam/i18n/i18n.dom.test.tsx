import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { LANG_COOKIE } from "@/lib/main-wam/i18n";
import { homeGreeting } from "@/lib/main-wam/greeting";
import { sampleSettings } from "@/lib/main-wam/sample";
import { mainWamScreen } from "@/lib/main-wam/screen";
import { mainWamPath } from "@/lib/routes";
import { BottomNav } from "../shell/BottomNav";
import { MainWamShell } from "../shell/MainWamShell";
import { SayaScreen } from "../peserta/saya/SayaScreen";
import { StatusPill } from "../ui/Status";
import { LangProvider, LanguageSetting, useLang } from "./index";

/* Choosing English changes the frame's words and a screen's, at once, and is remembered on the device. */

const router = vi.hoisted(() => ({ refresh: vi.fn(), back: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
const nav = vi.hoisted(() => ({ pathname: "/wam2026/agenda" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => router }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

beforeEach(() => { document.cookie = `${LANG_COOKIE}=; Max-Age=0; Path=/`; Object.values(router).forEach(fn => fn.mockClear()); });
afterEach(() => { cleanup(); nav.pathname = "/wam2026/agenda"; });

const greeting = (lang: "id" | "en") => homeGreeting(new Date("2027-01-05T07:40:00+07:00"), "Rani", sampleSettings().event, undefined, lang);

describe("the frame in English", () => {
  it("names the four tabs Home, Agenda, Moments, Me, and the bar and skip link too", () => {
    render(<LangProvider lang="en"><MainWamShell greeting={greeting("en")}><p>Body</p></MainWamShell></LangProvider>);
    const bar = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(bar).getAllByRole("link").map(link => link.textContent)).toEqual(["Home", "Agenda", "Moments", "Me"]);
    expect(screen.getByRole("link", { name: "Skip to content" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Agenda" })).toBeTruthy();
  });

  it("says a badge in English and says nothing English in Indonesian", () => {
    const { rerender } = render(<LangProvider lang="en"><BottomNav current={null} badges={{ momen: 12, saya: "dot" }} /></LangProvider>);
    expect(screen.getByRole("link", { name: "Moments, 12 new" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Me, something new" })).toBeTruthy();
    rerender(<LangProvider lang="id"><BottomNav current={null} badges={{ momen: 12, saya: "dot" }} /></LangProvider>);
    expect(screen.getByRole("link", { name: "Momen, 12 baru" })).toBeTruthy();
  });

  it("marks the root with lang, and Beranda's greeting is English (day line on event days, the date before them)", () => {
    const { container } = render(<LangProvider lang="en"><p>x</p></LangProvider>);
    expect(container.querySelector("[lang]")?.getAttribute("lang")).toBe("en");
    expect(greeting("en")).toEqual({ kicker: "Good morning", name: "Rani", day: "Day 2 of 4" });
    expect(greeting("id")).toEqual({ kicker: "Selamat pagi", name: "Rani", day: "Hari ke-2 dari 4" });
    // Before the event the kicker carries the date.
    const before = (lang: "id" | "en") => homeGreeting(new Date("2026-12-20T07:40:00+07:00"), "Rani", sampleSettings().event, undefined, lang);
    expect(before("en").kicker).toBe("Good morning · Sun, 20 Dec");
    expect(before("id").kicker).toBe("Selamat pagi · Min, 20 Des");
  });

  it("draws screen titles from the address in the language", () => {
    expect(mainWamScreen(mainWamPath.room, "en")?.title).toBe("Room");
    expect(mainWamScreen(mainWamPath.room, "id")?.title).toBe("Kamar");
    expect(mainWamScreen(mainWamPath.carbon(), "en")?.title).toBe("Carbon footprint");
    expect(mainWamScreen(mainWamPath.moments(), "en")?.title).toBe("Latest");
  });
});

describe("a screen in English", () => {
  it("Saya reads in English, Indonesian without a provider", () => {
    const props = { name: "Rani", fullName: "Rani Contoh", line: "CoE", photo: null, room: null, mcp: false };
    const { unmount } = render(<LangProvider lang="en"><SayaScreen {...props} /></LangProvider>);
    expect(screen.getByText("Event info")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Travel" })).toBeTruthy();
    expect(screen.getByText("Room not published yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Rani Contoh.*change profile photo/ })).toBeTruthy();
    unmount();
    render(<SayaScreen {...props} />);
    expect(screen.getByText("Info acara")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Rani Contoh.*ganti foto profil/ })).toBeTruthy();
  });

  it("a status pill in a server component follows the language", () => {
    render(<LangProvider lang="en"><StatusPill status="live" /><StatusPill status="changed" /></LangProvider>);
    expect(screen.getByText("In progress")).toBeTruthy();
    expect(screen.getByText("Time changed")).toBeTruthy();
  });
});

function Probe() {
  const { lang } = useLang();
  return <p data-testid="lang">{lang}</p>;
}

describe("Bahasa / Language in Pengaturan", () => {
  it("shows Indonesia and English; choosing English writes the cookie, changes the words at once and asks the server again", () => {
    render(<LangProvider lang="id"><LanguageSetting /><BottomNav current={null} /><Probe /></LangProvider>);
    expect(screen.getByText("Bahasa / Language")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Indonesia" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("link", { name: "Beranda" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(document.cookie).toContain(`${LANG_COOKIE}=en`);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("lang").textContent).toBe("en");
    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    expect(screen.getByText("Language / Bahasa")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "English" }).getAttribute("aria-checked")).toBe("true");
  });

  it("follows the server when it answers with the other language, and a choice made back wins again", () => {
    const { rerender } = render(<LangProvider lang="id"><LanguageSetting /><Probe /></LangProvider>);
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    rerender(<LangProvider lang="en"><LanguageSetting /><Probe /></LangProvider>);
    expect(screen.getByTestId("lang").textContent).toBe("en");
    fireEvent.click(screen.getByRole("radio", { name: "Indonesia" }));
    expect(document.cookie).toContain(`${LANG_COOKIE}=id`);
    expect(screen.getByTestId("lang").textContent).toBe("id");
  });
});
