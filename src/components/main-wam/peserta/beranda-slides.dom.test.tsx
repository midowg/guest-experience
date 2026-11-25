import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState, type ReactNode } from "react";
import type { HomeData, HomeSlides, NowView, SlideEmpty, SlideSession } from "@/lib/main-wam/peserta/home";
import { mainWamPath } from "@/lib/routes";
import { IndicatorSlotContext } from "@/components/main-wam/shell/ShellSlots";
import { TopBar } from "@/components/main-wam/ui/TopBar";
import { NowSlides } from "./beranda/NowSlides";

/* Beranda's main card as a slide of exactly three cards (placeholders for an empty side), and its indicator in the head. */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/wam2026" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const NOW = "2027-01-05T10:30:00+07:00";
const live: NowView = { kind: "sesi", sessionId: "s3", title: "Pemaparan departemen", time: "10.00–11.00", place: "Aula Utama", status: "live", statusText: null, when: null, whenAt: null, absen: true, absenCloses: "10.30", progress: 0.5, sessionKind: "sesi" };
const side = (id: string, title: string): SlideSession => ({ sessionId: id, title, time: "09.00–10.00", place: "Aula Barat", sessionKind: "makan" as const });
/** The three places as homeSlides gives them: a session on a side, or the reason it is empty. */
const slots = (done: SlideSession | SlideEmpty, upcoming: SlideSession | SlideEmpty): HomeSlides => ({ slots: [
  typeof done === "string" ? { slot: "done", session: null, empty: done } : { slot: "done", session: done, empty: null },
  { slot: "now", session: null, empty: null },
  typeof upcoming === "string" ? { slot: "upcoming", session: null, empty: upcoming } : { slot: "upcoming", session: upcoming, empty: null },
] });
const full = () => slots(side("s2", "Sarapan"), side("s4", "Makan siang"));
const data = (patch: Partial<HomeData>): HomeData => ({ migrated: true, now: live, session: null, card: null, refreshAt: null, serverNow: NOW, failed: false, ...patch });
const cardsOf = () => screen.getAllByRole("group").filter(el => el.getAttribute("aria-roledescription") === "slide");

/** The shell's slots, as the layout draws them: the head with the indicator's slot, then the screen. */
function Harness({ home }: { home: HomeData }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return <IndicatorSlotContext.Provider value={slot}>
    <TopBar variant="home" kicker="Selamat pagi" name="Rani" day="Hari ke-2 dari 4" indicator={<span ref={setSlot} />} />
    <NowSlides data={home} serverNow={NOW} absen={<button type="button">Absen</button>} />
  </IndicatorSlotContext.Provider>;
}

/**
 * The carousel's layout in numbers (jsdom has none): a track 300 wide, cards 86 % wide with 8 between, the first one centred by the
 * padding. Where a centred card scrolls to is `index * PITCH`. The layout is stubbed on the prototypes before rendering, so the opening
 * scroll is seen too; `scrollTo` is recorded and moves `scrollLeft`.
 */
const WIDTH = 300;
const CARD = WIDTH * 0.86;
const PITCH = CARD + 8;
const scrollTo = vi.fn();
const isTrack = (el: Element) => el.getAttribute("role") === "region";
const indexIn = (el: Element) => Array.from(el.parentElement!.children).indexOf(el);
beforeEach(() => {
  scrollTo.mockReset();
  scrollTo.mockImplementation(function (this: HTMLElement, options: { left: number }) { this.scrollLeft = options.left; });
  const define = (name: string, descriptor: PropertyDescriptor) => Object.defineProperty(HTMLElement.prototype, name, { configurable: true, ...descriptor });
  define("clientWidth", { get(this: HTMLElement) { return isTrack(this) ? WIDTH : 0; } });
  define("offsetWidth", { get(this: HTMLElement) { return this.parentElement && isTrack(this.parentElement) ? CARD : 0; } });
  define("offsetLeft", { get(this: HTMLElement) { return this.parentElement && isTrack(this.parentElement) ? (WIDTH - CARD) / 2 + indexIn(this) * PITCH : 0; } });
  define("scrollTo", { value: scrollTo, writable: true });
});
afterEach(() => { for (const name of ["clientWidth", "offsetWidth", "offsetLeft", "scrollTo"]) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name]; });
const trackEl = () => screen.getByRole("region", { name: /Sesi: baru selesai/ });
const segments = () => within(screen.getByRole("group", { name: "Pilih kartu sesi" })).getAllByRole("button");
/** The centre of card `index` in the track's own scroll space, and the centre of the viewport the track shows. */
const centreOfCard = (index: number) => (WIDTH - CARD) / 2 + index * PITCH + CARD / 2;
const centreOfView = (track: HTMLElement) => track.scrollLeft + WIDTH / 2;

describe("Slide kartu utama Beranda", () => {
  it("three cards: Selesai, Sekarang (with Absen), Akan datang, in that order", () => {
    render(<Harness home={data({ slides: full() })} />);
    const cards = cardsOf();
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

  it("the indicator is in the head: three segments named with their state, the Sekarang card in view; the day is a visible label", () => {
    render(<Harness home={data({ slides: full() })} />);
    expect(screen.getByText("Hari ke-2 dari 4")).toBeTruthy();
    const group = screen.getByRole("group", { name: "Pilih kartu sesi" });
    expect(segments().map(el => el.getAttribute("aria-label"))).toEqual(["Selesai: Sarapan", "Sedang berlangsung: Pemaparan departemen", "Akan datang: Makan siang"]);
    expect(segments().map(el => el.getAttribute("data-status"))).toEqual(["done", "live", "upcoming"]);
    expect(segments().map(el => el.getAttribute("aria-current"))).toEqual([null, "true", null]);
    expect(segments().map(el => el.hasAttribute("data-empty"))).toEqual([false, false, false]);
    expect(document.querySelector("header")!.contains(group)).toBe(true);
  });

  it("opens with the Sekarang card centred: the centre of the card is the centre of the track", () => {
    render(<Harness home={data({ slides: full() })} />);
    const track = trackEl();
    expect(centreOfView(track)).toBe(centreOfCard(1));
    expect(track.scrollLeft).toBe(PITCH);
    expect(segments()[1].getAttribute("aria-current")).toBe("true");
  });

  it("taps move to a card, swiping lights the segment", () => {
    render(<Harness home={data({ slides: full() })} />);
    const track = trackEl();
    const segment = (name: RegExp) => screen.getByRole("button", { name });
    fireEvent.click(segment(/Akan datang/));
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 2 * PITCH }));
    fireEvent.scroll(track);
    expect(segment(/Akan datang/).getAttribute("aria-current")).toBe("true");
    expect(segment(/Sedang berlangsung/).getAttribute("aria-current")).toBeNull();
    track.scrollLeft = 0; fireEvent.scroll(track);
    expect(segment(/Selesai/).getAttribute("aria-current")).toBe("true");
    // Half-way between the first and second rounds to the nearer one.
    track.scrollLeft = PITCH / 2 + 10; fireEvent.scroll(track);
    expect(segment(/Sedang berlangsung/).getAttribute("aria-current")).toBe("true");
  });

  it("Left and Right Arrow on the indicator move to the neighbouring card and its segment", () => {
    render(<Harness home={data({ slides: full() })} />);
    segments()[1].focus();
    fireEvent.keyDown(segments()[1], { key: "ArrowRight" });
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 2 * PITCH }));
    expect(segments()[2].getAttribute("aria-current")).toBe("true");
    expect(document.activeElement).toBe(segments()[2]);
    fireEvent.keyDown(segments()[2], { key: "ArrowRight" });
    expect(segments()[2].getAttribute("aria-current")).toBe("true");
    fireEvent.keyDown(segments()[2], { key: "ArrowLeft" });
    fireEvent.keyDown(segments()[1], { key: "ArrowLeft" });
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 0 }));
    expect(segments()[0].getAttribute("aria-current")).toBe("true");
    expect(document.activeElement).toBe(segments()[0]);
  });

  it("goes back to the middle when the session changes", () => {
    const first = data({ slides: full() });
    const { rerender } = render(<Harness home={first} />);
    const track = trackEl();
    track.scrollLeft = 2 * PITCH; fireEvent.scroll(track);
    expect(screen.getByRole("button", { name: /Akan datang/ }).getAttribute("aria-current")).toBe("true");
    scrollTo.mockClear();
    act(() => rerender(<Harness home={{ ...first, now: { ...live, sessionId: "s4", title: "Makan siang" }, slides: slots(side("s3", "Pemaparan departemen"), side("s5", "Silent Meeting")) }} />));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: PITCH }));
    expect(screen.getByRole("button", { name: /Sedang berlangsung: Makan siang/ }).getAttribute("aria-current")).toBe("true");
    expect(centreOfView(track)).toBe(centreOfCard(1));
  });

  it("nothing has ended: a calm placeholder on the left, no button or link, the Sekarang card still the middle one and centred", () => {
    render(<Harness home={data({ now: { ...live, status: "next", when: "20 menit lagi", whenAt: "2027-01-05T10:50:00+07:00" }, slides: slots("noDone", side("s4", "Makan siang")) })} />);
    const cards = cardsOf();
    expect(cards).toHaveLength(3);
    expect(cards[0].getAttribute("aria-label")).toBe("Kartu 1 dari 3, kosong");
    expect(cards[0].getAttribute("data-empty")).toBe("");
    expect(within(cards[0]).getByText("Belum ada sesi yang selesai")).toBeTruthy();
    expect(within(cards[0]).queryByRole("link")).toBeNull();
    expect(within(cards[0]).queryByRole("button")).toBeNull();
    expect(within(cards[1]).getByText("Pemaparan departemen")).toBeTruthy();
    expect(within(cards[2]).getByText("Makan siang")).toBeTruthy();
    expect(segments().map(el => el.getAttribute("aria-label"))).toEqual(["Selesai: kosong", "Berikutnya: Pemaparan departemen", "Akan datang: Makan siang"]);
    expect(segments().map(el => el.hasAttribute("data-empty"))).toEqual([true, false, false]);
    expect(segments()[1].getAttribute("aria-current")).toBe("true");
    expect(centreOfView(trackEl())).toBe(centreOfCard(1));
    // The placeholder is a place like any card: a tap moves to it.
    fireEvent.click(segments()[0]);
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 0 }));
  });

  it("the last session of the day: a placeholder on the right, 'Tidak ada sesi berikutnya hari ini', or 'Sampai jumpa besok' when a later day has sessions", () => {
    const { unmount } = render(<Harness home={data({ slides: slots(side("s2", "Sarapan"), "noUpcoming") })} />);
    expect(cardsOf()).toHaveLength(3);
    expect(within(cardsOf()[2]).getByText("Tidak ada sesi berikutnya hari ini")).toBeTruthy();
    expect(cardsOf()[2].getAttribute("aria-label")).toBe("Kartu 3 dari 3, kosong");
    expect(within(cardsOf()[2]).queryByRole("link")).toBeNull();
    expect(segments()[2].getAttribute("aria-label")).toBe("Akan datang: kosong");
    expect(centreOfView(trackEl())).toBe(centreOfCard(1));
    unmount();
    render(<Harness home={data({ slides: slots(side("s2", "Sarapan"), "tomorrow") })} />);
    expect(within(cardsOf()[2]).getByText("Sampai jumpa besok")).toBeTruthy();
  });

  it("only the Sekarang card: still three cards and three segments (both sides are placeholders), Absen kept, centred", () => {
    render(<Harness home={data({ slides: slots("noDone", "noUpcoming") })} />);
    expect(cardsOf()).toHaveLength(3);
    expect(segments()).toHaveLength(3);
    expect(cardsOf().map(el => el.hasAttribute("data-empty"))).toEqual([true, false, true]);
    expect(within(cardsOf()[1]).getByRole("button", { name: "Absen" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Absen" })).toHaveLength(1);
    expect(centreOfView(trackEl())).toBe(centreOfCard(1));
  });

  it("with no slides given the card is still the middle of three", () => {
    render(<Harness home={data({})} />);
    expect(cardsOf()).toHaveLength(3);
    expect(cardsOf().map(el => el.hasAttribute("data-empty"))).toEqual([true, false, true]);
  });

  it("Hari ini selesai takes the middle place: the session that has just ended on its left, a placeholder on its right", () => {
    render(<Harness home={data({ now: { kind: "selesai", tomorrow: { title: "Trekking Coban Rondo", when: "Besok 06.00", day: 3 } }, slides: slots(side("s9", "Gala dinner"), "tomorrow") })} />);
    const cards = cardsOf();
    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByText("Gala dinner")).toBeTruthy();
    expect(within(cards[1]).getByText("Hari ini selesai")).toBeTruthy();
    expect(within(cards[2]).getByText("Sampai jumpa besok")).toBeTruthy();
    expect(segments().map(el => el.getAttribute("aria-label"))).toEqual(["Selesai: Gala dinner", "Hari ini selesai", "Akan datang: kosong"]);
    expect(segments()[1].getAttribute("aria-current")).toBe("true");
    expect(centreOfView(trackEl())).toBe(centreOfCard(1));
  });

  it("no session at all: the empty card in the middle, a placeholder on each side", () => {
    render(<Harness home={data({ now: { kind: "kosong" } })} />);
    const cards = cardsOf();
    expect(cards.map(el => el.hasAttribute("data-empty"))).toEqual([true, false, true]);
    expect(within(cards[1]).getByText("Agenda belum terbit")).toBeTruthy();
    expect(segments().map(el => el.getAttribute("aria-label"))).toEqual(["Selesai: kosong", "Agenda belum terbit", "Akan datang: kosong"]);
    expect(trackEl().scrollLeft).toBe(PITCH);
  });

  it("is a carousel: the card in view about 86 % wide so both neighbours peek in evenly, one snap per card, and every card is one height (the track stretches them, nothing sets a height while swiping)", () => {
    const css = readFileSync(join(process.cwd(), "src/components/main-wam/peserta/beranda/beranda.module.css"), "utf8");
    expect(css).toMatch(/\.panel \{[^}]*flex: 0 0 100%[^}]*scroll-snap-align: center[^}]*scroll-snap-stop: always/);
    expect(css).toMatch(/\.track \{[^}]*align-items: stretch[^}]*scroll-snap-type: x mandatory/);
    expect(css).not.toMatch(/\.track \{[^}]*align-items: flex-start/);
    expect(css).toMatch(/padding-left: 7\.5%; padding-right: 7\.5%/);
    // The side cards keep their foot (Detail sesi) at the bottom of the taller card and centre the title and place above it; the placeholder centres its text.
    expect(css).toMatch(/\.sideFoot \{[^}]*margin-top: auto/);
    expect(css).toMatch(/\.sideBody \{[^}]*margin-top: auto/);
    expect(css).toMatch(/\.vacantBody \{[^}]*flex: 1 1 auto[^}]*justify-content: center/);
    // The placeholder's segment is dim.
    expect(css).toMatch(/\.seg\[data-empty\] > i \{[^}]*opacity: 0\.35/);
    render(<Harness home={data({ slides: full() })} />);
    const track = trackEl();
    expect(track.style.height).toBe("");
    act(() => { track.scrollLeft = 2 * PITCH; fireEvent.scroll(track); });
    expect(screen.getByRole("button", { name: /Akan datang/ }).getAttribute("aria-current")).toBe("true");
    expect(track.style.height).toBe("");
    act(() => { track.scrollLeft = 0; fireEvent.scroll(track); });
    expect(track.style.height).toBe("");
  });

  it("the Sekarang card has no 'Berikutnya' row any more: the next session is the Akan datang card beside it", () => {
    render(<Harness home={data({ now: { ...live, next: { time: "12.00", title: "Makan siang", place: "Restoran" } }, slides: slots("noDone", side("s4", "Makan siang")) })} />);
    const cards = cardsOf();
    expect(within(cards[1]).queryByText("Berikutnya")).toBeNull();
    expect(within(cards[1]).queryByText("Makan siang")).toBeNull();
    expect(within(cards[2]).getByText("Akan datang")).toBeTruthy();
    expect(within(cards[2]).getByRole("link", { name: /Detail sesi: Makan siang/ })).toBeTruthy();
  });

  it("the indicator and the placeholders are the English words in English", async () => {
    const { setActiveLang } = await import("@/lib/main-wam/i18n");
    const { LangProvider } = await import("@/components/main-wam/i18n");
    setActiveLang("en");
    render(<LangProvider lang="en"><Harness home={data({ slides: slots(side("s2", "Sarapan"), "noUpcoming") })} /></LangProvider>);
    expect(within(screen.getByRole("group", { name: "Choose a session card" })).getAllByRole("button").map(el => el.getAttribute("aria-label")))
      .toEqual(["Finished: Sarapan", "In progress: Pemaparan departemen", "Coming up: empty"]);
    expect(cardsOf()[2].getAttribute("aria-label")).toBe("Card 3 of 3, empty");
    expect(within(cardsOf()[2]).getByText("No more sessions today")).toBeTruthy();
    setActiveLang("id");
  });
});
