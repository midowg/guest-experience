import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { CabinetEntry, CabinetView } from "@/lib/pra-wam/mom-cabinet";
import { PraWamMomCabinet } from "./PraWamMomCabinet";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const photo = (n: number, onTv = false) => ({ id: `0a000000-0000-4000-8000-00000000000${n}`, width: 1920, height: 1440, size: 600_000, at: "2026-11-10T07:00:00Z", onTv });
const entry = (patch: Partial<CabinetEntry>): CabinetEntry => ({
  sessionId: "5e550000-0000-4000-8000-000000000001", code: "MoM/2026/11/0012", title: "Appraisal team SS", date: "2026-11-10", from: "13.00", to: "14.00",
  place: "CFC Ananta Room", department: "Sales & Marketing", short: "SM", hod: false, chair: "Etik", notetaker: "Raja",
  present: 3, total: 4, guests: 0, topics: 2, decisions: 3, actions: 2, open: 1, version: 1, sentAt: "2026-11-10T07:00:00Z", telegramOff: false, photos: [], ...patch,
});
const view: CabinetView = {
  migrated: true, tvReady: true,
  entries: [
    entry({ photos: [photo(1), photo(2, true)] }),
    entry({ sessionId: "5e550000-0000-4000-8000-000000000002", code: "MoM/2026/11/0013", title: "Evaluasi Meeting", date: "2026-11-11", photos: [photo(3)] }),
    entry({ sessionId: "5e550000-0000-4000-8000-000000000003", code: "MoM/2026/11/0014", title: "Tanpa foto", date: "2026-11-12" }),
  ],
};

it("shows every photo in one gallery, newest meeting first, and sends the chosen ones not yet on the TV", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, data: view, message: "2 foto masuk ke daftar tayangan TV." }), { status: 200 }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<PraWamMomCabinet initial={view} />);
  // Daftar is shown first (13 Nov 2026); the gallery is one tap away.
  fireEvent.click(screen.getByRole("button", { name: /Galeri foto/ }));
  const gallery = within(screen.getByRole("region", { name: "Galeri foto" }));
  // Grouped by meeting, newest first; a meeting without photos is left out.
  expect(gallery.getAllByText(/Appraisal team SS|Evaluasi Meeting|Tanpa foto/).map(item => item.textContent)).toEqual(["Evaluasi Meeting", "Appraisal team SS"]);
  const tiles = gallery.getAllByRole("button", { pressed: false });
  expect(tiles).toHaveLength(3);
  expect(screen.getByRole("button", { name: /Masukkan ke TV/ }).hasAttribute("disabled")).toBe(true);

  // One tile, then a whole meeting, then everything.
  fireEvent.click(gallery.getByRole("button", { name: "Foto 1 Evaluasi Meeting" }));
  expect(gallery.getByText("1 dipilih")).toBeTruthy();
  fireEvent.click(gallery.getByRole("button", { name: "Pilih" }));
  expect(gallery.getByText("3 dipilih")).toBeTruthy();
  fireEvent.click(within(gallery.getByRole("toolbar")).getByRole("button", { name: "Batal pilih" }));
  expect(gallery.getByText("3 foto")).toBeTruthy();
  fireEvent.click(gallery.getByRole("button", { name: "Pilih semua" }));
  expect(gallery.getAllByRole("button", { pressed: true })).toHaveLength(3);

  // The photo already on the TV is left out of what goes.
  fireEvent.click(screen.getByRole("button", { name: "Masukkan ke TV (3)" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe("/api/admin/wam/mom/photos/tv");
  expect(JSON.parse(String((init as RequestInit).body)).photos.map((item: { id: string; title: string }) => item.id)).toEqual([photo(3).id, photo(1).id]);
  expect(JSON.parse(String((init as RequestInit).body)).photos[0].title).toMatch(/^Evaluasi Meeting · /);
  expect(await screen.findByText("2 foto masuk ke daftar tayangan TV.")).toBeTruthy();
  expect(gallery.getByText("3 foto")).toBeTruthy();
});

it("asks before a sensitive meeting's photo goes to the TV, and sends nothing when cancelled", () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const ask = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<PraWamMomCabinet initial={{ ...view, entries: [entry({ telegramOff: true, photos: [photo(1)] })] }} />);
  fireEvent.click(screen.getByRole("button", { name: /Galeri foto/ }));
  fireEvent.click(screen.getByRole("button", { name: "Pilih semua" }));
  fireEvent.click(screen.getByRole("button", { name: "Masukkan ke TV (1)" }));
  expect(ask.mock.calls[0][0]).toMatch(/meeting sensitif/);
  expect(fetch).not.toHaveBeenCalled();
});

it("shows every MoM first, one without photos too; the gallery says which it leaves out", () => {
  render(<PraWamMomCabinet initial={view} />);
  expect(screen.getByRole("button", { name: /Daftar/ }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("Tanpa foto")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Galeri foto/ }));
  expect(screen.getByText(/1 MoM tanpa foto tidak tampil di Galeri/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Lihat semua MoM" }));
  expect(screen.getByText("Tanpa foto")).toBeTruthy();
});
