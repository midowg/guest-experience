import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { presetPoster } from "@/lib/poster-presets";
import { boxes } from "@/lib/poster";

// jsdom cannot lay out or draw an SVG: the measuring and drawing steps are stood in for.
vi.mock("@/components/admin/editor/blocks/figma-import", async original => ({
  ...(await original<typeof import("@/components/admin/editor/blocks/figma-import")>()),
  importInBrowser: () => ({
    format: "post", background: "<svg/>", notes: ["1 kolom teks berasal dari teks yang di-outline."],
    fields: [
      { key: "judul", label: "Judul", hint: "Judul sesi", kind: "text", editable: true, value: "", maxLength: 60, font: "playfair", weight: 400, tone: "", color: "#0f4a3a", align: "left", uppercase: false, letterSpacing: 0, sizeMax: 88, sizeMin: 53, lineHeight: 1, maxLines: 2, radius: 0, fill: "#e9dfcb", box: boxes({ post: { x: 64, y: 40, w: 600, h: 180 } }) },
      { key: "utama", label: "Utama", hint: "Unggah utama", kind: "photo", editable: true, value: "", maxLength: 1, font: "nunito", weight: 600, tone: "", color: "#1f2a24", align: "left", uppercase: false, letterSpacing: 0, sizeMax: 24, sizeMin: 12, lineHeight: 1.2, maxLines: 1, radius: 0, fill: "#e9dfcb", box: boxes({ post: { x: 0, y: 215, w: 1080, h: 660 } }) },
    ],
  }),
  backgroundPng: async () => new Blob(["png"], { type: "image/png" }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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
