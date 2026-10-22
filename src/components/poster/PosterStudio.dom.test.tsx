import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PosterStudio } from "@/components/poster/PosterStudio";
import { presetPoster } from "@/lib/poster-presets";
import { createSeedEvent } from "@/lib/seed-event";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
  // jsdom draws nothing; the layout falls back to an average character width.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup() {
  const poster = presetPoster("rempah-nusantara", { ...createSeedEvent(), venue_name: "Loman Park Hotel" });
  poster.fields = poster.fields.map(field => field.key === "socials" ? { ...field, value: "@jcwf.id | jcwf.id" } : field);
  render(<PosterStudio eventId="10f3a511-2331-4000-8000-0000000000aa" eventTitle="JCWF 2026" poster={poster} />);
  return poster;
}
const posterImage = () => screen.getByRole("img", { name: /Poster Post/ });

it("shows grey hints before anything is filled, and locks downloads until Simpan", async () => {
  setup();
  await waitFor(() => expect(within(posterImage()).getByText("Judul sesi")).toBeTruthy());
  expect(within(posterImage()).getByText("@jcwf.id | jcwf.id")).toBeTruthy();
  expect((screen.getByRole("button", { name: /Unduh gambar/ }) as HTMLButtonElement).disabled).toBe(true);
});

it("opens only the boxes the admin made editable, and fills them from the panel", async () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  // Editable boxes are buttons on the poster; the locked Instagram box is not.
  await waitFor(() => expect(within(posterImage()).getByRole("button", { name: "Ubah Judul sesi" })).toBeTruthy());
  expect(within(posterImage()).queryByRole("button", { name: "Ubah Instagram & website" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Instagram & website" })).toBeNull();

  fireEvent.change(screen.getByRole("textbox", { name: "Judul sesi" }), { target: { value: "Meramu Rempah Nusantara" } });
  // Long text wraps into one span per line; the box holds the whole of it.
  expect([...within(posterImage()).getByRole("button", { name: "Ubah Judul sesi" }).querySelectorAll("span")].map(line => line.textContent).join(" ")).toBe("Meramu Rempah Nusantara");

  fireEvent.click(screen.getByRole("button", { name: "Foto utama" }));
  expect(screen.getByLabelText("Unggah foto")).toBeTruthy();
});

it("hides empty hints once saved and lets the poster be downloaded", async () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Judul sesi" }), { target: { value: "Meramu Rempah" } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
  expect(within(posterImage()).queryByText("Nama fasilitator")).toBeNull();
  expect(within(posterImage()).getByText("Meramu Rempah")).toBeTruthy();
  expect((screen.getByRole("button", { name: /Unduh gambar/ }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByRole("status").textContent).toMatch(/kotak masih kosong/);
});

it("lets the person pick a colour only when the admin allows it", async () => {
  const poster = presetPoster("ucapan-hangat", createSeedEvent());
  const { unmount } = render(<PosterStudio eventId="10f3a511-2331-4000-8000-0000000000ab" eventTitle="Ucapan" poster={poster} />);
  expect(screen.queryByRole("group", { name: "Warna" })).toBeNull();
  unmount();
  render(<PosterStudio eventId="10f3a511-2331-4000-8000-0000000000ac" eventTitle="Ucapan" poster={{ ...poster, paletteChoice: true }} />);
  const malam = within(screen.getByRole("group", { name: "Warna" })).getByRole("button", { name: "Warna Malam emas" });
  fireEvent.click(malam);
  expect(malam.getAttribute("aria-pressed")).toBe("true");
  await waitFor(() => expect(decodeURIComponent((screen.getByRole("img", { name: /Poster/ }).querySelector("img") as HTMLImageElement).src)).toContain("#111a2e"));
});
