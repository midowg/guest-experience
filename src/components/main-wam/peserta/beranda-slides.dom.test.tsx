import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import type { HomeData, NowView } from "@/lib/main-wam/peserta/home";
import { mainWamPath } from "@/lib/routes";
import { IndicatorSlotContext } from "@/components/main-wam/shell/ShellSlots";
import { TopBar } from "@/components/main-wam/ui/TopBar";
import { NowSlides } from "./beranda/NowSlides";

/* Beranda's main card as a slide of at most three cards, and its indicator in the head. */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/wam2026" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const NOW = "2027-01-05T10:30:00+07:00";
const live: NowView = { kind: "sesi", sessionId: "s3", title: "Pemaparan departemen", time: "10.00–11.00", place: "Aula Utama", status: "live", statusText: null, when: null, whenAt: null, absen: true, absenCloses: "10.30", progress: 0.5, sessionKind: "sesi" };
const side = (id: string, title: string) => ({ sessionId: id, title, time: "09.00–10.00", place: "Aula Barat", sessionKind: "makan" as const });
const data = (patch: Partial<HomeData>): HomeData => ({ migrated: true, now: live, session: null, card: null, refreshAt: null, serverNow: NOW, failed: false, ...patch });

/** The shell's slots, as the layout draws them: the head with the indicator's slot, then the screen. */
function Harness({ home }: { home: HomeData }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return <IndicatorSlotContext.Provider value={slot}>
    <TopBar variant="home" kicker="Selamat pagi" name="Rani" day="Hari ke-2 dari 4" indicator={<span ref={setSlot} />} />
    <NowSlides data={home} serverNow={NOW} absen={<button type="button">Absen</button>} />
  </IndicatorSlotContext.Provider>;
}

/** jsdom has no layout: give the track a width and record where the slide was sent. */
function stubTrack(width = 300) {
  const track = screen.getByRole("region", { name: /Sesi: baru selesai/ });
  Object.defineProperty(track, "clientWidth", { configurable: true, value: width });
  const scrollTo = vi.fn(({ left }: { left: number }) => { track.scrollLeft = left; });
  track.scrollTo = scrollTo as unknown as typeof track.scrollTo;
  return { track, scrollTo };
}

describe("Slide kartu utama Beranda", () => {
  it("three cards: Selesai, Sekarang (with Absen), Akan datang, in that order", () => {
    render(<Harness home={data({ slides: { done: side("s2", "Sarapan"), upcoming: side("s4", "Makan siang") } })} />);
    const cards = screen.getAllByRole("group").filter(el => el.getAttribute("aria-roledescription") === "slide");
    expect(cards.map(el => el.getAttribute("aria-label"))).toEqual(["Kartu 1 dari 3", "Kartu 2 dari 3", "Kartu 3 dari 3"]);
    expect(within(cards[0]).getByText("Selesai")).toBeTruthy();
    expect(within(cards[0]).queryByRole("button", { name: "Absen" })).toBeNull();
    expect(within(cards[0]).getByRole("link", { name: /Detail sesi/ }).getAttribute("href")).toBe(mainWamPath.session("s2"));
    expect(within(cards[1]).getByText("Sedang berlangsung")).toBeTruthy();
    expect(within(cards[1]).getByRole("button", { name: "Absen" })).toBeTruthy();
    expect(within(cards[2]).getByText("Akan datang")).toBeTruthy();
    expect(within(cards[2]).queryByRole("button", { name: "Absen" })).toBeNull();
    expect(within(cards[2]).getByRole("link", { name: /Detail sesi: Makan siang/ }).getAttribute("href")).toBe(mainWamPath.session("s4"));
    expect(within(cards[2]).getByText("09.00")).toBeTruthy();
  });

  it("the indicator is in the head: one segment per card, named with its state, the Sekarang card in view; the day is a visible label", () => {
    render(<Harness home={data({ slides: { done: side("s2", "Sarapan"), upcoming: side("s4", "Makan siang") } })} />);
    expect(screen.getByText("Hari ke-2 dari 4")).toBeTruthy();
    const group = screen.getByRole("group", { name: "Pilih kartu sesi" });
    const segments = within(group).getAllByRole("button");
    expect(segments.map(el => el.getAttribute("aria-label"))).toEqual(["Selesai: Sarapan", "Sedang berlangsung: Pemaparan departemen", "Akan datang: Makan siang"]);
    expect(segments.map(el => el.getAttribute("data-status"))).toEqual(["done", "live", "upcoming"]);
    expect(segments.map(el => el.getAttribute("aria-current"))).toEqual([null, "true", null]);
    expect(document.querySelector("header")!.contains(group)).toBe(true);
  });

  it("opens on the Sekarang card, taps move to a card, swiping lights the segment", () => {
    render(<Harness home={data({ slides: { done: side("s2", "Sarapan"), upcoming: side("s4", "Makan siang") } })} />);
    const { track, scrollTo } = stubTrack(300);
    const segment = (name: RegExp) => screen.getByRole("button", { name });
    // Tap the third: slides to 2 x width.
    fireEvent.click(segment(/Akan datang/));
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 600 }));
    fireEvent.scroll(track);
    expect(segment(/Akan datang/).getAttribute("aria-current")).toBe("true");
    expect(segment(/Sedang berlangsung/).getAttribute("aria-current")).toBeNull();
    // Swipe back to the first.
    track.scrollLeft = 0; fireEvent.scroll(track);
    expect(segment(/Selesai/).getAttribute("aria-current")).toBe("true");
    // Half-way between the first and second rounds to the nearer one.
    track.scrollLeft = 170; fireEvent.scroll(track);
    expect(segment(/Sedang berlangsung/).getAttribute("aria-current")).toBe("true");
  });

  it("goes back to the Sekarang card when the session changes", () => {
    const first = data({ slides: { done: side("s2", "Sarapan"), upcoming: side("s4", "Makan siang") } });
    const { rerender } = render(<Harness home={first} />);
    const { track, scrollTo } = stubTrack(300);
    track.scrollLeft = 600; fireEvent.scroll(track);
    expect(screen.getByRole("button", { name: /Akan datang/ }).getAttribute("aria-current")).toBe("true");
    scrollTo.mockClear();
    act(() => rerender(<Harness home={{ ...first, now: { ...live, sessionId: "s4", title: "Makan siang" }, slides: { done: side("s3", "Pemaparan departemen"), upcoming: side("s5", "Silent Meeting") } }} />));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 300 }));
    expect(screen.getByRole("button", { name: /Sedang berlangsung: Makan siang/ }).getAttribute("aria-current")).toBe("true");
  });

  it("nothing has ended: two cards (Sekarang, Akan datang), two segments, opening on the first", () => {
    render(<Harness home={data({ now: { ...live, status: "next", when: "20 menit lagi", whenAt: "2027-01-05T10:50:00+07:00" }, slides: { done: null, upcoming: side("s4", "Makan siang") } })} />);
    const segments = within(screen.getByRole("group", { name: "Pilih kartu sesi" })).getAllByRole("button");
    expect(segments.map(el => el.getAttribute("aria-label"))).toEqual(["Berikutnya: Pemaparan departemen", "Akan datang: Makan siang"]);
    expect(segments[0].getAttribute("aria-current")).toBe("true");
    const { scrollTo } = stubTrack(300);
    fireEvent.click(segments[1]);
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 300 }));
  });

  it("the last session of the day: Selesai and Sekarang, no card after it", () => {
    render(<Harness home={data({ slides: { done: side("s2", "Sarapan"), upcoming: null } })} />);
    expect(within(screen.getByRole("group", { name: "Pilih kartu sesi" })).getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByText("Akan datang")).toBeNull();
  });

  it("a single card: no indicator, the card alone (Absen kept)", () => {
    render(<Harness home={data({ slides: { done: null, upcoming: null } })} />);
    expect(screen.queryByRole("group", { name: "Pilih kartu sesi" })).toBeNull();
    expect(screen.getByRole("button", { name: "Absen" })).toBeTruthy();
    expect(screen.getAllByRole("group").filter(el => el.getAttribute("aria-roledescription") === "slide")).toHaveLength(1);
  });

  it("Hari ini selesai takes the Sekarang place; the session that has just ended is beside it", () => {
    render(<Harness home={data({ now: { kind: "selesai", tomorrow: { title: "Trekking Coban Rondo", when: "Besok 06.00", day: 3 } }, slides: { done: side("s9", "Gala dinner"), upcoming: null } })} />);
    const segments = within(screen.getByRole("group", { name: "Pilih kartu sesi" })).getAllByRole("button");
    expect(segments).toHaveLength(2);
    expect(screen.getByText("Hari ini selesai")).toBeTruthy();
    expect(segments[1].getAttribute("aria-current")).toBe("true");
  });

  it("the indicator is the English words in English", async () => {
    const { setActiveLang } = await import("@/lib/main-wam/i18n");
    const { LangProvider } = await import("@/components/main-wam/i18n");
    setActiveLang("en");
    render(<LangProvider lang="en"><Harness home={data({ slides: { done: side("s2", "Sarapan"), upcoming: side("s4", "Makan siang") } })} /></LangProvider>);
    expect(within(screen.getByRole("group", { name: "Choose a session card" })).getAllByRole("button").map(el => el.getAttribute("aria-label")))
      .toEqual(["Finished: Sarapan", "In progress: Pemaparan departemen", "Coming up: Makan siang"]);
    setActiveLang("id");
  });
});
