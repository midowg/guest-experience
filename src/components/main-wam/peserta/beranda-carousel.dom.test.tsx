import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BerandaCarousel, type SummaryCard } from "./beranda/BerandaCarousel";

/* Beranda's secondary cards as ONE carousel with an indicator under it. */

afterEach(cleanup);

const card = (key: SummaryCard["key"], text = key): SummaryCard => ({ key, node: <article>{text}</article> });
const panels = () => Array.from(screen.getByRole("region", { name: "Ringkasan" }).children) as HTMLElement[];

/** jsdom has no layout: give the track a width and its cards the carousel's geometry (90 % wide, 8 apart). */
function stub(width = 300) {
  const track = screen.getByRole("region", { name: "Ringkasan" });
  Object.defineProperty(track, "clientWidth", { configurable: true, value: width });
  panels().forEach((panel, index) => {
    Object.defineProperty(panel, "offsetWidth", { configurable: true, value: width * 0.9 });
    Object.defineProperty(panel, "offsetLeft", { configurable: true, value: width * 0.05 + index * (width * 0.9 + 8) });
  });
  const scrollTo = vi.fn(({ left }: { left: number }) => { track.scrollLeft = left; });
  track.scrollTo = scrollTo as unknown as typeof track.scrollTo;
  return { track, scrollTo };
}

describe("Carousel kartu sekunder Beranda", () => {
  it("one labelled region, each card a labelled group, in the order Kuis, Misi, Jejak karbon, Momen, Mozaik", () => {
    render(<BerandaCarousel cards={[card("kuis"), card("misi"), card("karbon"), card("momen"), card("mozaik")]} />);
    expect(screen.getAllByRole("region", { name: "Ringkasan" })).toHaveLength(1);
    expect(panels().map(panel => panel.getAttribute("aria-label"))).toEqual(["Kuis live", "Misi", "Jejak karbon", "Momen", "Mozaik"]);
    const dots = within(screen.getByRole("group", { name: "Pilih kartu ringkasan" })).getAllByRole("button");
    expect(dots).toHaveLength(5);
    expect(dots[0].getAttribute("aria-label")).toContain("Kuis live");
    expect(dots[0].getAttribute("aria-current")).toBe("true");
  });

  it("the number of cards follows the modules: only those given are in the carousel and the indicator", () => {
    render(<BerandaCarousel cards={[card("misi"), card("momen")]} />);
    expect(panels()).toHaveLength(2);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("a card that renders nothing is left out of the indicator; the one left alone has no indicator", () => {
    render(<BerandaCarousel cards={[{ key: "misi", node: <article>Misi</article> }, { key: "momen", node: null }, { key: "mozaik", node: <></> }]} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("region", { name: "Ringkasan" }).hasAttribute("data-single")).toBe(true);
  });

  it("a tap on a segment moves to that card; scrolling moves the active segment", () => {
    render(<BerandaCarousel cards={[card("misi"), card("karbon"), card("momen")]} />);
    const { track, scrollTo } = stub();
    const dots = screen.getAllByRole("button");
    fireEvent.click(dots[2]);
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 2 * 278 }));
    fireEvent.scroll(track);
    expect(screen.getAllByRole("button")[2].getAttribute("aria-current")).toBe("true");
    track.scrollLeft = 278;
    fireEvent.scroll(track);
    expect(screen.getAllByRole("button")[1].getAttribute("aria-current")).toBe("true");
    expect(screen.getAllByRole("button")[2].getAttribute("aria-current")).toBeNull();
  });

  it("arrow keys on the indicator move the focus and the card", () => {
    render(<BerandaCarousel cards={[card("misi"), card("karbon"), card("momen")]} />);
    const { scrollTo } = stub();
    const dots = screen.getAllByRole("button");
    dots[0].focus();
    fireEvent.keyDown(dots[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(dots[1]);
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 278 }));
    fireEvent.keyDown(dots[1], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(dots[0]);
  });

  it("no two columns and all cards as tall as the tallest (stretch) in the CSS", () => {
    const css = readFileSync(join(__dirname, "beranda", "beranda.module.css"), "utf8");
    expect(css).not.toMatch(/\.pair\b/);
    expect(css).not.toMatch(/grid-template-columns:\s*1fr 1fr/);
    expect(css).toMatch(/\.sumTrack\s*\{[^}]*align-items:\s*stretch/);
    expect(css).toMatch(/\.sumTrack\s*\{[^}]*scroll-snap-type:\s*x mandatory/);
    expect(css).toMatch(/\.sumPanel\s*\{[^}]*flex:\s*0 0 100%/);
  });
});
