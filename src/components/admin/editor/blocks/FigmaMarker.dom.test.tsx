import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { boxes, type PosterField } from "@/lib/poster";
import type { FigmaImport as Imported } from "./figma-import";

const design = '<svg class="figma-design" xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="#fff"/><g><path class="judul" d="M60 60h600v80H60z"/></g><rect class="foto" x="0" y="300" width="1080" height="560"/></svg>';

// jsdom cannot lay out or draw an SVG: the measuring and drawing steps are stood in for. A source
// without isi_/foto_ names is turned away as the real importer does, so the marker opens.
const seen: string[] = [];
vi.mock("./figma-import", async original => {
  const actual = await original<typeof import("./figma-import")>();
  return {
    ...actual,
    importInBrowser: (source: string): Imported => {
      seen.push(source);
      if (!/id="(isi|foto)_/.test(source)) throw new actual.NoLayersError("SVG ini tidak membawa nama layer.");
      // A stacked mark brings its heading as a label part.
      const parts = source.includes("data-susun") ? [{ key: "info1", art: null, slot: null, label: "<svg/>" }] : [];
      return { format: "post", background: "<svg/>", overlay: null, parts, fields: [], notes: [] };
    },
    backgroundPng: async () => new Blob(["png"], { type: "image/png" }),
  };
});

// jsdom lays nothing out: each shape gets its box in the design, drawn at full size.
const places: Record<string, [number, number, number, number]> = {
  judul: [60, 60, 600, 80], foto: [0, 300, 1080, 560],
  // A square icon, a one-move rule, and the "Foto peserta" line written on the photo box.
  ikon: [500, 1000, 60, 60], garis: [60, 1200, 900, 4], tulisan: [400, 560, 280, 40],
  // The drawing shown at half size: screen pixels map to twice as many SVG units.
  "figma-design": [0, 0, 540, 675],
  // Bullet points: a small ▸ and an outlined line each, and a third line apart.
  ikon1: [600, 400, 24, 24], baris1: [630, 400, 300, 30], ikon2: [600, 450, 24, 24], baris2: [630, 450, 300, 30], baris3: [630, 600, 300, 30],
};
const at = (name: string) => ({ clientX: places[name][0] + 20, clientY: places[name][1] + 20 });
beforeEach(() => {
  seen.length = 0;
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const [x, y, w, h] = places[this.getAttribute("class") ?? ""] ?? (this.tagName.toLowerCase() === "rect" ? [0, 0, 1080, 1350] : [0, 0, 0, 0]);
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} } as DOMRect;
  });
});
/** Outlined text is one path of several letters (moves); an icon or a rule is not text. */
const busy = '<svg class="figma-design" xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="#fff"/>'
  + '<path class="judul" d="M60 60h10v10z M80 60h10v10z M100 60h10v10z"/><path class="ikon" d="M500 1000h10v10z M520 1000h10v10z M540 1000h10v10z"/>'
  + '<path class="garis" d="M60 1200h900v4H60z"/><rect class="foto" x="0" y="300" width="1080" height="560"/>'
  + '<path class="tulisan" d="M400 560h10v10z M420 560h10v10z M440 560h10v10z"/></svg>';
const indexOf = (source: string, name: string) => [...new DOMParser().parseFromString(source, "image/svg+xml").documentElement.querySelectorAll("*")].findIndex(element => element.getAttribute("class") === name);

/** The tap surface: the drawing's holder, where taps are read by position. */
const surface = () => document.querySelector("svg.figma-design")?.parentElement?.parentElement as HTMLElement;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("marks tapped shapes as text or photo, by their place in the SVG", async () => {
  const { FigmaMarker } = await import("./FigmaMarker");
  const done = vi.fn();
  render(<FigmaMarker source={design} onDone={done} onCancel={() => {}} />);

  fireEvent.click(surface(), at("judul"));
  fireEvent.click(screen.getByRole("button", { name: /Foto/ }));
  fireEvent.click(surface(), at("foto"));
  const list = screen.getByRole("list", { name: "Bagian yang ditandai" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  fireEvent.change(within(list).getByDisplayValue("Teks 1"), { target: { value: "Judul sesi" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Jumlah baris Judul sesi" }), { target: { value: "2" } });

  // Tapping a marked part again takes the mark off.
  fireEvent.click(surface(), at("foto"));
  expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  fireEvent.click(surface(), at("foto"));

  fireEvent.click(screen.getByRole("button", { name: "Selesai, buat 2 kolom" }));
  const all = [...new DOMParser().parseFromString(design, "image/svg+xml").documentElement.querySelectorAll("*")];
  expect(done).toHaveBeenCalledWith([
    { index: all.findIndex(element => element.getAttribute("class") === "judul"), kind: "text", label: "Judul sesi", lines: 2, font: "sans" },
    { index: all.findIndex(element => element.getAttribute("class") === "foto"), kind: "photo", label: "Foto 1", lines: 1, font: "sans" },
  ]);
});

it("opens the marker for an SVG without layer names, then imports the marked parts", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { url: "https://cdn.example/latar.webp", srcset: [] }, message: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } })));
  const { FigmaImport } = await import("./FigmaImport");
  const imported = vi.fn();
  render(<FigmaImport onImport={imported} />);

  const file = new File([design.replace("<svg ", '<svg onload="alert(1)" ')], "tanpa-nama.svg", { type: "image/svg+xml" });
  fireEvent.change(screen.getByLabelText(/Unggah desain dari Figma/), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByText(/belum punya nama layer/)).toBeTruthy());
  expect(screen.queryByRole("alert")).toBeNull();
  expect(seen[0]).not.toContain("onload");

  fireEvent.click(surface(), at("judul"));
  fireEvent.click(screen.getByRole("button", { name: "Selesai, buat 1 kolom" }));
  await waitFor(() => expect(imported).toHaveBeenCalledOnce());
  expect(seen[1]).toMatch(/<path[^>]*id="isi_teks1"/);
  expect(screen.queryByText(/belum punya nama layer/)).toBeNull();
  expect(screen.getByRole("status").textContent).toMatch(/kolom ditemukan/);
});

it("marks every line of text in one go, leaving icons and rules, and takes back the writing on a photo", async () => {
  const { FigmaMarker } = await import("./FigmaMarker");
  const done = vi.fn();
  render(<FigmaMarker source={busy} onDone={done} onCancel={() => {}} />);

  fireEvent.click(screen.getByRole("button", { name: /Tandai semua teks otomatis/ }));
  const list = screen.getByRole("list", { name: "Bagian yang ditandai" });
  expect(within(list).getAllByRole("textbox").map(input => (input as HTMLInputElement).value)).toEqual(["Teks 1", "Teks 2"]);
  // Pressed again, nothing is marked twice.
  fireEvent.click(screen.getByRole("button", { name: /Tandai semua teks otomatis/ }));
  expect(within(list).getAllByRole("listitem")).toHaveLength(2);

  // The photo box is marked after: the writing on it is its hint, not a field.
  fireEvent.click(screen.getByRole("button", { name: /Foto/ }));
  fireEvent.click(surface(), at("foto"));
  const rows = within(list).getAllByRole("listitem");
  expect(rows.map(row => (within(row).getByRole("textbox") as HTMLInputElement).value)).toEqual(["Teks 1", "Foto 1"]);
  fireEvent.click(within(rows[1]).getByRole("checkbox", { name: "Opsional" }));
  expect((within(rows[1]).getByRole("checkbox", { name: "Opsional" }) as HTMLInputElement).checked).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "Selesai, buat 2 kolom" }));
  expect(done).toHaveBeenCalledWith([
    { index: indexOf(busy, "judul"), kind: "text", label: "Teks 1", lines: 1, font: "sans" },
    { index: indexOf(busy, "foto"), kind: "photo", label: "Foto 1", lines: 1, font: "sans", optional: true },
  ]);
});

it("leaves the writing inside a photo already marked when marking all text", async () => {
  const { FigmaMarker } = await import("./FigmaMarker");
  const done = vi.fn();
  render(<FigmaMarker source={busy} onDone={done} onCancel={() => {}} />);

  fireEvent.click(screen.getByRole("button", { name: /Foto/ }));
  fireEvent.click(surface(), at("foto"));
  fireEvent.click(screen.getByRole("button", { name: /Tandai semua teks otomatis/ }));
  fireEvent.click(screen.getByRole("button", { name: "Selesai, buat 2 kolom" }));
  expect(done).toHaveBeenCalledWith([
    { index: indexOf(busy, "foto"), kind: "photo", label: "Foto 1", lines: 1, font: "sans" },
    { index: indexOf(busy, "judul"), kind: "text", label: "Teks 1", lines: 1, font: "sans" },
  ]);
  expect(done.mock.calls[0][0][0].optional).toBeUndefined();
});

const points = '<svg class="figma-design" xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="#fff"/>'
  + '<path class="ikon1" d="M600 400l6 4-6 4z"/><path class="baris1" d="M630 400h4v8z M640 400h4v8z M650 400h4v8z"/>'
  + '<path class="ikon2" d="M600 450l6 4-6 4z"/><path class="baris2" d="M630 450h4v8z M640 450h4v8z M650 450h4v8z"/>'
  + '<path class="baris3" d="M630 600h4v8z M640 600h4v8z M650 600h4v8z"/></svg>';

it("gathers taps in Poin into one list, with its shapes, lines and area in the SVG's units", async () => {
  const { FigmaMarker } = await import("./FigmaMarker");
  const done = vi.fn();
  render(<FigmaMarker source={points} onDone={done} onCancel={() => {}} />);

  fireEvent.click(screen.getByRole("button", { name: /Poin/ }));
  for (const name of ["ikon1", "baris1", "ikon2", "baris2"]) fireEvent.click(surface(), at(name));
  const list = screen.getByRole("list", { name: "Bagian yang ditandai" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  expect(within(list).getByText("4 bagian")).toBeTruthy();
  // Two lines of text; the icons add none.
  expect((screen.getByRole("combobox", { name: "Jumlah baris Poin 1" }) as HTMLSelectElement).value).toBe("2");

  // Tapped again, a line leaves the list; tapped once more, it is back.
  fireEvent.click(surface(), at("baris2"));
  expect(within(list).getByText("3 bagian")).toBeTruthy();
  expect((screen.getByRole("combobox", { name: "Jumlah baris Poin 1" }) as HTMLSelectElement).value).toBe("1");
  fireEvent.click(surface(), at("baris2"));

  // A new list for the next tap.
  fireEvent.click(screen.getByRole("button", { name: /Daftar poin baru/ }));
  fireEvent.click(surface(), at("baris3"));
  expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  fireEvent.change(screen.getByRole("combobox", { name: "Jumlah baris Poin 2" }), { target: { value: "12" } });

  fireEvent.click(screen.getByRole("button", { name: "Selesai, buat 2 kolom" }));
  expect(done).toHaveBeenCalledWith([
    { index: indexOf(points, "ikon1"), kind: "text", list: true, extra: ["baris1", "ikon2", "baris2"].map(name => indexOf(points, name)), label: "Poin 1", lines: 2, font: "sans", area: { x: 1200, y: 800, w: 660, h: 160 } },
    { index: indexOf(points, "baris3"), kind: "text", list: true, extra: [], label: "Poin 2", lines: 12, font: "sans", area: { x: 1260, y: 1200, w: 600, h: 60 } },
  ]);
});

const field = (key: string, label: string, kind: PosterField["kind"]): PosterField => ({
  key, label, kind, hint: label, editable: true, value: "", maxLength: 80, font: "nunito", weight: 600, tone: "", color: "#1f2a24", align: "left", uppercase: false, letterSpacing: 0,
  sizeMax: 40, sizeMin: 24, lineHeight: 1.2, maxLines: 1, radius: 0, fill: "#e9dfcb", box: boxes({ a4: { x: 0, y: 0, w: 100, h: 40 } }),
});
const existing = [field("judul", "Judul sesi", "text"), field("foto_utama", "Foto utama", "photo")];

it("offers the other size's names and takes the key of the one a mark is named after", async () => {
  const { FigmaMarker } = await import("./FigmaMarker");
  const done = vi.fn();
  render(<FigmaMarker source={design} existing={existing} onDone={done} onCancel={() => {}} />);
  expect(screen.getByText(/Desain ukuran lain sudah ada/)).toBeTruthy();

  fireEvent.click(surface(), at("judul"));
  const input = screen.getByDisplayValue("Teks 1") as HTMLInputElement;
  // The text's names to pick from: only the texts.
  const offered = document.getElementById(input.getAttribute("list") ?? "");
  expect([...offered?.querySelectorAll("option") ?? []].map(option => option.getAttribute("value"))).toEqual(["Judul sesi"]);
  fireEvent.change(input, { target: { value: "judul sesi" } });
  expect(screen.getByText("sama dengan ukuran lain")).toBeTruthy();
  // Another name leaves the field again.
  fireEvent.change(input, { target: { value: "Judul lain" } });
  expect(screen.queryByText("sama dengan ukuran lain")).toBeNull();
  fireEvent.change(input, { target: { value: "Judul sesi" } });

  fireEvent.click(screen.getByRole("button", { name: /Foto/ }));
  fireEvent.click(surface(), at("foto"));
  fireEvent.change(screen.getByDisplayValue("Foto 1"), { target: { value: "Foto utama" } });
  fireEvent.click(screen.getByRole("button", { name: "Selesai, buat 2 kolom" }));
  expect(done).toHaveBeenCalledWith([
    { index: indexOf(design, "judul"), kind: "text", label: "Judul sesi", lines: 1, font: "sans", key: "judul" },
    { index: indexOf(design, "foto"), kind: "photo", label: "Foto utama", lines: 1, font: "sans", key: "foto_utama" },
  ]);
});

it("hands the earlier import's fields to the marker, so a mark named after one fills it", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { url: "https://cdn.example/latar.webp", srcset: [] }, message: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } })));
  const { FigmaImport } = await import("./FigmaImport");
  render(<FigmaImport fields={existing} onImport={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(/Unggah desain dari Figma/), { target: { files: [new File([design], "a4.svg", { type: "image/svg+xml" })] } });
  await waitFor(() => expect(screen.getByText(/Desain ukuran lain sudah ada/)).toBeTruthy());

  fireEvent.click(surface(), at("judul"));
  fireEvent.change(screen.getByDisplayValue("Teks 1"), { target: { value: "Judul sesi" } });
  fireEvent.click(screen.getByRole("button", { name: "Selesai, buat 1 kolom" }));
  await waitFor(() => expect(seen[1]).toMatch(/<path[^>]*id="isi_judul"/));
});

it("marks stacked items in Info, optional, one group after another", async () => {
  const { FigmaMarker } = await import("./FigmaMarker");
  const done = vi.fn();
  render(<FigmaMarker source={points} onDone={done} onCancel={() => {}} />);

  fireEvent.click(screen.getByRole("button", { name: /Info/ }));
  // A new group only once the current one has an item.
  expect((screen.getByRole("button", { name: /Grup info baru/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(surface(), at("baris1"));
  fireEvent.click(surface(), at("baris2"));
  const list = screen.getByRole("list", { name: "Bagian yang ditandai" });
  expect(within(list).getAllByText("grup info")).toHaveLength(2);
  expect(within(list).getAllByRole("listitem").map(row => row.getAttribute("data-kind"))).toEqual(["info", "info"]);
  // Tapped again, an item is taken back; once more, it is in again.
  fireEvent.click(surface(), at("baris2"));
  expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  fireEvent.click(surface(), at("baris2"));

  fireEvent.click(screen.getByRole("button", { name: /Grup info baru/ }));
  fireEvent.click(surface(), at("baris3"));
  expect(within(list).getByText("grup info2")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Selesai, buat 3 kolom" }));
  expect(done).toHaveBeenCalledWith([
    { index: indexOf(points, "baris1"), kind: "text", stack: "info", optional: true, label: "Info 1", lines: 1, font: "sans" },
    { index: indexOf(points, "baris2"), kind: "text", stack: "info", optional: true, label: "Info 2", lines: 1, font: "sans" },
    { index: indexOf(points, "baris3"), kind: "text", stack: "info2", optional: true, label: "Info 3", lines: 1, font: "sans" },
  ]);
});

it("names stacked marks for the import and uploads each item's heading as its label", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { url: "https://cdn.example/label.webp", srcset: [] }, message: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } })));
  const { FigmaImport } = await import("./FigmaImport");
  const imported = vi.fn();
  render(<FigmaImport onImport={imported} />);
  fireEvent.change(screen.getByLabelText(/Unggah desain dari Figma/), { target: { files: [new File([points], "a4.svg", { type: "image/svg+xml" })] } });
  await waitFor(() => expect(screen.getByText(/belum punya nama layer/)).toBeTruthy());

  fireEvent.click(screen.getByRole("button", { name: /Info/ }));
  fireEvent.click(surface(), at("baris1"));
  fireEvent.click(screen.getByRole("button", { name: "Selesai, buat 1 kolom" }));
  await waitFor(() => expect(imported).toHaveBeenCalledOnce());
  expect(seen[1]).toMatch(/<path[^>]*id="isi_info1_opsional"[^>]*data-susun="info"/);
  expect(imported.mock.calls[0][0].parts).toEqual([{ key: "info1", art: { url: "", alt: "", srcset: [] }, slot: { url: "", alt: "", srcset: [] }, label: { url: "https://cdn.example/label.webp", alt: "", srcset: [] } }]);
});
