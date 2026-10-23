import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { FigmaImport as Imported } from "./figma-import";

const design = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="#fff"/><g><path class="judul" d="M60 60h600v80H60z"/></g><rect class="foto" x="0" y="300" width="1080" height="560"/></svg>';

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
      return { format: "post", background: "<svg/>", overlay: null, fields: [], notes: [] };
    },
    backgroundPng: async () => new Blob(["png"], { type: "image/png" }),
  };
});

beforeEach(() => {
  seen.length = 0;
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("marks tapped shapes as text or photo, by their place in the SVG", async () => {
  const { FigmaMarker } = await import("./FigmaMarker");
  const done = vi.fn();
  const { container } = render(<FigmaMarker source={design} onDone={done} onCancel={() => {}} />);

  fireEvent.click(container.querySelector("path.judul")!);
  fireEvent.click(screen.getByRole("button", { name: /Foto/ }));
  fireEvent.click(container.querySelector("rect.foto")!);
  const list = screen.getByRole("list", { name: "Bagian yang ditandai" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  fireEvent.change(within(list).getByDisplayValue("Teks 1"), { target: { value: "Judul sesi" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Jumlah baris Judul sesi" }), { target: { value: "2" } });

  // Tapping a marked part again takes the mark off.
  fireEvent.click(container.querySelector("rect.foto")!);
  expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  fireEvent.click(container.querySelector("rect.foto")!);

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
  const { container } = render(<FigmaImport onImport={imported} />);

  const file = new File([design.replace("<svg ", '<svg onload="alert(1)" ')], "tanpa-nama.svg", { type: "image/svg+xml" });
  fireEvent.change(screen.getByLabelText(/Unggah desain dari Figma/), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByText(/belum punya nama layer/)).toBeTruthy());
  expect(screen.queryByRole("alert")).toBeNull();
  expect(seen[0]).not.toContain("onload");

  fireEvent.click(container.querySelector("path.judul")!);
  fireEvent.click(screen.getByRole("button", { name: "Selesai, buat 1 kolom" }));
  await waitFor(() => expect(imported).toHaveBeenCalledOnce());
  expect(seen[1]).toMatch(/<path[^>]*id="isi_teks1"/);
  expect(screen.queryByText(/belum punya nama layer/)).toBeNull();
  expect(screen.getByRole("status").textContent).toMatch(/kolom ditemukan/);
});
