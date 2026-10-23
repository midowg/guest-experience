import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { presetPoster } from "@/lib/poster-presets";

// jsdom cannot lay out or draw an SVG: the measuring and drawing steps are stood in for.
const read = vi.hoisted(() => {
  const text = { label: "Judul", hint: "Judul sesi", kind: "text", editable: true, value: "", maxLength: 60, font: "playfair", weight: 400, tone: "", color: "#0f4a3a", align: "left", uppercase: false, letterSpacing: 0, sizeMax: 88, sizeMin: 53, lineHeight: 1, maxLines: 2, radius: 0, fill: "#e9dfcb" } as const;
  const photo = { label: "Utama", hint: "Unggah utama", kind: "photo", editable: true, value: "", maxLength: 1, font: "nunito", weight: 600, tone: "", color: "#1f2a24", align: "left", uppercase: false, letterSpacing: 0, sizeMax: 24, sizeMin: 12, lineHeight: 1.2, maxLines: 1, radius: 0, fill: "#e9dfcb" } as const;
  const none = { post: null, story: null, square: null, landscape: null, a4: null, a4_landscape: null, a5: null, idcard: null };
  /** One size's import: the same two layers, boxed for that size only. */
  const size = (format: "post" | "a4", notes: string[]) => ({
    format, background: "<svg/>", overlay: null, parts: [], notes,
    fields: [
      { key: "judul", ...text, box: { ...none, [format]: { x: 64, y: 40, w: 600, h: 180 } } },
      { key: "utama", ...photo, box: { ...none, [format]: { x: 0, y: 215, w: 1080, h: 660 } } },
    ],
  });
  return { size, importInBrowser: vi.fn((source: string) => { void source; return size("post", ["1 kolom teks berasal dari teks yang di-outline."]); }) };
});
vi.mock("@/components/admin/editor/blocks/figma-import", async original => ({
  ...(await original<typeof import("@/components/admin/editor/blocks/figma-import")>()),
  importInBrowser: read.importInBrowser,
  backgroundPng: async () => new Blob(["png"], { type: "image/png" }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// The whole editor renders here; its role queries outlast the 5 s default when the suite runs in parallel.
vi.setConfig({ testTimeout: 20000 });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); read.importInBrowser.mockClear(); });

it("turns a Figma SVG into the card's fields and background, and lists them for the admin", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("confirm", () => true);
  const upload = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { url: "https://cdn.example/latar-2048.webp", srcset: [{ width: 2048, url: "https://cdn.example/latar-2048.webp" }] }, message: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", upload);
  const { EventEditor } = await import("@/components/admin/editor/EventEditor");
  const seed = createSeedEvent();
  render(<EventEditor event={{ ...seed, event_kind: "kartu", poster: presetPoster("rempah-nusantara", seed) }} />);

  const file = new File(['<svg width="1080" height="1350"></svg>'], "poster.svg", { type: "image/svg+xml" });
  fireEvent.change(screen.getByLabelText(/Unggah desain dari Figma/), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByText(/2 kolom ditemukan untuk ukuran Post 4:5/)).toBeTruthy());
  expect(screen.getByText(/di-outline/)).toBeTruthy();
  expect((upload.mock.calls[0] as unknown[])[0]).toBe("/api/admin/photos");

  // The two Figma layers are now the card's fields, each with its switch and hint.
  const list = screen.getByRole("list", { name: "Kolom kartu" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  const filled = within(list).getByRole("switch", { name: "Judul diisi peserta" }) as HTMLInputElement;
  expect(filled.checked).toBe(true);
  fireEvent.click(filled);
  expect(within(list).getByRole("textbox", { name: "Isi tetap Judul" })).toBeTruthy();
});

const uploads = () => vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { url: "https://cdn.example/latar.webp", srcset: [] }, message: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } }));
const svgFile = (name: string) => new File(['<svg width="1080" height="1350"></svg>'], name, { type: "image/svg+xml" });

it("reads several SVGs in the order chosen, one size each, and names every size it imported", async () => {
  vi.stubGlobal("fetch", uploads());
  read.importInBrowser.mockReturnValueOnce(read.size("post", ["Catatan Post."])).mockReturnValueOnce(read.size("a4", ["Catatan A4."]));
  const { FigmaImport } = await import("./FigmaImport");
  const imported = vi.fn();
  render(<FigmaImport onImport={imported} />);
  const input = screen.getByLabelText(/Unggah desain dari Figma/) as HTMLInputElement;
  expect(input.multiple).toBe(true);

  fireEvent.change(input, { target: { files: [svgFile("post.svg"), svgFile("a4.svg")] } });
  await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/2 kolom ditemukan untuk ukuran Post 4:5 dan A4\./));
  expect(imported.mock.calls.map(call => call[0].format)).toEqual(["post", "a4"]);
  // Each size's notes say which size they are about.
  expect(screen.getByText("Post 4:5: Catatan Post.")).toBeTruthy();
  expect(screen.getByText("A4: Catatan A4.")).toBeTruthy();
});

it("adds the second file's size to the first file's boxes in the editor, asking only once to replace the gallery design", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
  const confirm = vi.fn(() => true);
  vi.stubGlobal("confirm", confirm);
  vi.stubGlobal("fetch", uploads());
  read.importInBrowser.mockReturnValueOnce(read.size("post", [])).mockReturnValueOnce(read.size("a4", []));
  const { EventEditor } = await import("@/components/admin/editor/EventEditor");
  const seed = createSeedEvent();
  render(<EventEditor event={{ ...seed, event_kind: "kartu", poster: presetPoster("rempah-nusantara", seed) }} />);

  fireEvent.change(screen.getByLabelText(/Unggah desain dari Figma/), { target: { files: [svgFile("post.svg"), svgFile("a4.svg")] } });
  await waitFor(() => expect(screen.getByText(/2 kolom ditemukan untuk ukuran Post 4:5 dan A4/)).toBeTruthy());
  expect(confirm).toHaveBeenCalledOnce();
  expect(within(screen.getByRole("list", { name: "Kolom kartu" })).getAllByRole("listitem")).toHaveLength(2);
  // Both sizes are on: the A4 file joined the Post file's design instead of replacing it.
  expect((screen.getByRole("checkbox", { name: /^Post 4:5/, hidden: true }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole("checkbox", { name: /^A4 1240/, hidden: true }) as HTMLInputElement).checked).toBe(true);
});
