import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TV_WELCOME_ART } from "@/lib/routes";
import { WelcomeSlide } from "./TvTemplates";

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
    + `<body style="margin:0;font-family:system-ui,sans-serif"><div style="position:relative;width:100vw;height:100vh;overflow:hidden;--u:1vmin">${html}</div></body></html>`);
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
