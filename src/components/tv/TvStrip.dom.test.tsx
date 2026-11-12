import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { sampleTvFeed } from "@/app/dev-preview/tv/sample";
import { TvBoard } from "./TvBoard";
import { PhonePhotos, TvStrip } from "./TvStrip";

afterEach(cleanup);

const photos = [
  { id: "f1", src: "/uji/satu.webp", title: "Rapat Contoh Satu · 10 Nov" },
  { id: "f2", src: "/uji/dua.webp", title: "" },
  { id: "f3", src: "/uji/tiga.webp", title: "Forum Contoh · 11 Nov" },
];

/** The window a board is drawn for. */
function size(width: number, height: number, touch = 0) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: touch });
}

/** With TV_PLAYLIST_HTML set to a folder, the board is also written there as plain HTML with its stylesheets, to look at in a browser. */
function keep(name: string, container: HTMLElement) {
  const folder = process.env.TV_PLAYLIST_HTML;
  if (!folder) return;
  const sheets = ["src/components/pra-wam/pra-wam.module.css", "src/components/tv/tv.module.css"].map(file => readFileSync(file, "utf8")).join("\n");
  const html = container.innerHTML.replace(/_([A-Za-z][A-Za-z0-9]*)_[0-9a-f]{6}(?=[ "])/g, "$1");
  writeFileSync(`${folder}/${name}.html`, `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title><style>${sheets}</style></head><body style="margin:0">${html}</body></html>`);
}

describe("the photo row of a TV in two rows", () => {
  it("runs the photos twice over, enough of them to fill a screen, and names each once", () => {
    const { container } = render(<TvStrip photos={photos} />);
    const runs = container.querySelectorAll("ul");
    expect(runs).toHaveLength(2);
    // Three photos are repeated to nine, so a wide screen is never left with a gap.
    expect(runs[0].querySelectorAll("img")).toHaveLength(9);
    expect(runs[1].getAttribute("aria-hidden")).toBe("true");
    expect(runs[0].querySelector("img")?.getAttribute("alt")).toBe("Rapat Contoh Satu · 10 Nov");
    expect(runs[1].querySelector("img")?.getAttribute("alt")).toBe("");
    // Slowly: fourteen seconds a photo.
    expect((container.querySelector("ul")!.parentElement as HTMLElement).style.animationDuration).toBe("126s");
  });

  it("splits the photos over two lines for a TV standing up, the lower line a little slower", () => {
    const { container } = render(<TvStrip photos={photos} lines={2} />);
    const tracks = [...container.querySelectorAll("aside > div > div")] as HTMLElement[];
    expect(tracks).toHaveLength(2);
    expect(tracks[0].querySelector("img")?.getAttribute("src")).toBe("/uji/satu.webp");
    expect(tracks[1].querySelector("img")?.getAttribute("src")).toBe("/uji/dua.webp");
    // Two photos above are repeated to eight (112 s); the one below to eight as well, 15 % slower.
    expect(tracks.map(track => track.style.animationDuration)).toEqual(["112s", "129s"]);
  });

  it("draws nothing without photos, and steps aside without stopping when hidden", () => {
    expect(render(<TvStrip photos={[]} />).container.innerHTML).toBe("");
    cleanup();
    const { container } = render(<TvStrip photos={photos} hidden />);
    expect(container.querySelector("aside")?.getAttribute("data-hidden")).toBe("true");
    expect(container.querySelectorAll("img").length).toBeGreaterThan(0);
  });
});

describe("the board in two rows", () => {
  const feed = () => ({ ...sampleTvFeed({ isi: "dua" }) });

  it("gives the playlist the top of a landscape TV and draws it in the top's own units", () => {
    size(1920, 1080);
    const { container } = render(<TvBoard initial={feed()} />);
    const board = container.querySelector("main") as HTMLElement;
    expect(board.getAttribute("data-rows")).toBe("dua");
    expect(board.getAttribute("data-orientation")).toBe("mendatar");
    // 65 % of 1080 is 702: one unit is a hundredth of that.
    expect(board.style.getPropertyValue("--u")).toBe("7.02px");
    expect(screen.getByLabelText("Foto kegiatan").getAttribute("data-hidden")).toBe("false");
    expect(screen.getByLabelText("Foto kegiatan").getAttribute("data-lines")).toBe("1");
    keep("dua-baris", container);
  });

  it("keeps a TV standing up upright, with the same two rows", () => {
    size(1080, 1920);
    const { container } = render(<TvBoard initial={feed()} />);
    const board = container.querySelector("main") as HTMLElement;
    expect(board.getAttribute("data-rows")).toBe("dua");
    expect(board.getAttribute("data-orientation")).toBe("tegak");
    expect(board.style.getPropertyValue("--u")).toBe("10.8px");
    // Tall and narrow: the photos run in two lines, every other photo in each.
    expect(screen.getByLabelText("Foto kegiatan").getAttribute("data-lines")).toBe("2");
    keep("dua-baris-tegak", container);
  });

  it("stays full screen without photos to run", () => {
    size(1920, 1080);
    const { container } = render(<TvBoard initial={{ ...feed(), strip: undefined }} />);
    const board = container.querySelector("main") as HTMLElement;
    expect(board.getAttribute("data-rows")).toBeNull();
    expect(board.style.getPropertyValue("--u")).toBe("");
    expect(screen.queryByLabelText("Foto kegiatan")).toBeNull();
  });

  it("gives the whole screen to an item drawn for it, and keeps the photo row waiting", () => {
    size(1920, 1080);
    const whole = { ...feed(), playlist: [{ id: "u1", kind: "ultah" as const, title: "Contoh Satu", body: "", seconds: 10, call: "Contoh", date: "2026-11-10" }] };
    const { container } = render(<TvBoard initial={whole} />);
    expect(container.querySelector("main")?.getAttribute("data-rows")).toBeNull();
    expect(container.querySelector("aside[aria-label='Foto kegiatan']")?.getAttribute("data-hidden")).toBe("true");
  });

  it("shows the photos on a phone as a row to swipe, with no row that runs by itself", () => {
    size(375, 812, 5);
    // jsdom has no scrolling: the phone's list asks for its top on every new item.
    Element.prototype.scrollTo = () => undefined;
    const { container } = render(<TvBoard initial={feed()} />);
    expect(container.querySelector("aside")).toBeNull();
    expect(screen.getByRole("region", { name: "Foto kegiatan" })).toBeTruthy();
    keep("dua-baris-hp", container);
  });
});

describe("the photos on a phone", () => {
  it("opens a photo large on a touch, steps to the next and the one before, and closes", () => {
    render(<PhonePhotos photos={photos} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Buka foto 1 dari 3/ }));
    const viewer = screen.getByRole("dialog", { name: "Foto 1 dari 3" });
    expect(viewer.querySelector(":scope > img")?.getAttribute("src")).toBe("/uji/satu.webp");
    fireEvent.click(screen.getByRole("button", { name: "Foto berikutnya" }));
    expect(screen.getByRole("dialog", { name: "Foto 2 dari 3" }).querySelector(":scope > img")?.getAttribute("src")).toBe("/uji/dua.webp");
    fireEvent.click(screen.getByRole("button", { name: "Foto sebelumnya" }));
    fireEvent.click(screen.getByRole("button", { name: "Foto sebelumnya" }));
    expect(screen.getByRole("dialog", { name: "Foto 3 dari 3" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("draws nothing without photos", () => {
    expect(render(<PhonePhotos photos={[]} />).container.innerHTML).toBe("");
  });
});
