import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TV_WELCOME_ART } from "@/lib/routes";
import { BirthdaySlide, TvLoader, VideoSlide, WelcomeSlide } from "./TvTemplates";

afterEach(cleanup);

const visit = { id: "v1", name: "PT Contoh Dua Sejahtera", greeting: "Selamat datang di Werkudara", note: "", hours: "10.00–12.00 WIB", place: "Kantor Werkudara", image: "https://example.com/sampul.webp" };
const typed = { id: "t1", name: "Contoh Satu", greeting: "Selamat datang", note: "Terima kasih sudah berkunjung ke kantor kami.", hours: "", place: "", image: "" };

/** With TV_PLAYLIST_HTML set to a folder, the slide is also written there as plain HTML with the board's stylesheet, to look at in a browser. */
function keep(name: string, container: HTMLElement) {
  const folder = process.env.TV_PLAYLIST_HTML;
  if (!folder) return;
  const sheet = readFileSync("src/components/tv/tv.module.css", "utf8");
  const html = container.innerHTML.replace(/_([A-Za-z][A-Za-z0-9]*)_[0-9a-f]{6}(?=[ "])/g, "$1");
  writeFileSync(`${folder}/${name}.html`, `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title><style>${sheet}</style></head>`
    + `<body style="margin:0;font-family:system-ui,sans-serif"><main class="board" data-orientation="mendatar" style="position:relative;width:100vw;height:100vh;overflow:hidden;--u:1vmin;--tv-display:Georgia,serif">${html}</main>`
    + `<script>const b=document.querySelector("main");const o=()=>{b.dataset.orientation=innerWidth>=innerHeight?"mendatar":"tegak"};o();addEventListener("resize",o)</script></body></html>`);
}

describe("the welcome slide", () => {
  it("writes the guest's name, hours and place on the Werkudara sign", () => {
    const { container } = render(<WelcomeSlide welcome={visit} design="werkudara" />);
    expect(screen.getByRole("heading", { name: "PT Contoh Dua Sejahtera" })).toBeTruthy();
    expect((screen.getByRole("img", { name: /Welcome/ }) as HTMLImageElement).getAttribute("src")).toBe(TV_WELCOME_ART);
    expect(container.textContent).toContain("10.00–12.00 WIB");
    expect(container.textContent).toContain("Kantor Werkudara");
    // The sign says WELCOME itself, and never shows the visit's cover photo.
    expect(container.textContent).not.toContain("Selamat datang");
    expect(container.querySelector(`img[src="${visit.image}"]`)).toBeNull();
    keep("sambutan-werkudara", container);
  });

  it("writes a typed welcome's greeting under the name on the sign", () => {
    const { container } = render(<WelcomeSlide welcome={typed} design="werkudara" />);
    expect(container.textContent).toContain("Terima kasih sudah berkunjung ke kantor kami.");
    keep("sambutan-ketik", container);
  });

  it("puts the cover photo behind the words only in the photo design", () => {
    const photo = render(<WelcomeSlide welcome={visit} design="foto" />);
    expect(photo.container.querySelector(`img[src="${visit.image}"]`)).toBeTruthy();
    expect(photo.container.textContent).toContain("Selamat datang di Werkudara");
    cleanup();
    const plain = render(<WelcomeSlide welcome={visit} design="polos" />);
    expect(plain.container.querySelector("img")).toBeNull();
    expect(plain.container.textContent).toContain("PT Contoh Dua Sejahtera");
  });
});

describe("the waiting screen and videos", () => {
  it("says what is being made ready, with Werkudara's mark", () => {
    const { container } = render(<TvLoader note="Menyiapkan tayangan" />);
    expect(screen.getByRole("status").textContent).toBe("Menyiapkan tayangan");
    keep("tunggu", container);
  });

  it("covers a video file with the waiting screen until it plays, and mutes it by hand", () => {
    const { container } = render(<VideoSlide video="" file="/api/tv/video/contoh" title="Profil" loop={false} onEnd={() => undefined} />);
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video.hasAttribute("muted")).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("Menyiapkan video");
    expect(container.querySelector("section")?.getAttribute("data-playing")).toBe("false");
    fireEvent.playing(video);
    expect(screen.queryByRole("status")).toBeNull();
    expect(container.querySelector("section")?.getAttribute("data-playing")).toBe("true");
  });

  it("moves on when a video file ends or cannot be played, but not when it is alone", () => {
    let ended = 0;
    const first = render(<VideoSlide video="" file="/api/tv/video/contoh" title="Profil" loop={false} onEnd={() => { ended += 1; }} />);
    fireEvent.ended(first.container.querySelector("video")!);
    fireEvent.error(first.container.querySelector("video")!);
    expect(ended).toBe(2);
    cleanup();
    const alone = render(<VideoSlide video="" file="/api/tv/video/contoh" title="Profil" loop onEnd={() => { ended += 1; }} />);
    fireEvent.error(alone.container.querySelector("video")!);
    expect(ended).toBe(2);
    expect(screen.getByRole("status").textContent).toBe("TV ini belum bisa memulai video sendiri");
  });

  it("covers a YouTube video too until its player says it plays", () => {
    const { container } = render(<VideoSlide video="FWN1B1B7Gu8" title="Annual Meeting" loop={false} onEnd={() => undefined} />);
    expect(container.querySelector("iframe")?.getAttribute("src")).toContain("/embed/FWN1B1B7Gu8?autoplay=1&mute=1");
    expect(screen.getByRole("status").textContent).toBe("Menyiapkan video");
  });
});

describe("the birthday greeting", () => {
  const birthday = { name: "Contoh Satu Dua", call: "Pak Contoh", day: "20", month: "Sept", wish: "Wishing you a year ahead filled with meaningful moments, new opportunities, and continued growth. May it be a year of happiness, fulfillment, and many wonderful things to come.", photo: "" };

  it("writes the name, the date, the greeting, the wish and the foot", () => {
    const { container } = render(<BirthdaySlide birthday={birthday} />);
    expect(screen.getByRole("heading", { level: 1, name: "Contoh Satu Dua" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Happy Birthday, Pak Contoh" })).toBeTruthy();
    expect(container.textContent).toContain("20Sept");
    expect(container.textContent).toContain("Wishing you a year ahead");
    expect(container.textContent).toContain("Werkudara Group | werkudara.com");
    expect(container.querySelector("img")).toBeNull();
    keep("ultah", container);
  });

  it("shows the photo in the frame, and leaves the date out when there is none", () => {
    const { container } = render(<BirthdaySlide birthday={{ ...birthday, day: "", month: "", photo: "/foto.webp" }} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/foto.webp");
    expect(container.textContent).not.toContain("Sept");
  });
});
