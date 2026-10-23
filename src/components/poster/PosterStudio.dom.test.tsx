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
const card = () => screen.getByRole("img", { name: /Poster Post/ });
const form = () => screen.getByRole("form", { name: "Isi kartu" });

it("shows a form field for each box guests fill, and none for the admin's fixed text", async () => {
  setup();
  expect(within(form()).getByRole("textbox", { name: "Judul sesi" })).toBeTruthy();
  expect(within(form()).getByLabelText("Pilih Foto utama")).toBeTruthy();
  expect(within(form()).queryByRole("textbox", { name: "Instagram & website" })).toBeNull();
  // The fixed text is on the card; empty fields show their hint there.
  await waitFor(() => expect(within(card()).getByText("@jcwf.id | jcwf.id")).toBeTruthy());
  expect(within(card()).getByText("Judul sesi")).toBeTruthy();
});

it("changes the card as the guest types, and can be downloaded at any time", async () => {
  setup();
  fireEvent.change(within(form()).getByRole("textbox", { name: "Judul sesi" }), { target: { value: "Meramu Rempah Nusantara" } });
  await waitFor(() => expect([...card().querySelectorAll("[data-field=title] span")].map(line => line.textContent).join(" ")).toBe("Meramu Rempah Nusantara"));
  expect((screen.getByRole("button", { name: /Unduh gambar/ }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
});

it("draws each line of a list field as its own bullet point", async () => {
  const poster = presetPoster("rempah-nusantara", { ...createSeedEvent(), venue_name: "Loman Park Hotel" });
  poster.fields = poster.fields.map(field => field.key === "title" ? { ...field, list: true, maxLines: 6 } : field);
  render(<PosterStudio eventId="10f3a511-2331-4000-8000-0000000000ad" eventTitle="JCWF 2026" poster={poster} />);
  const input = within(form()).getByRole("textbox", { name: "Judul sesi" });
  expect(input.tagName).toBe("TEXTAREA");
  expect(within(form()).getByText("Satu poin per baris.")).toBeTruthy();
  fireEvent.change(input, { target: { value: "Satu\n\nDua" } });
  await waitFor(() => expect([...card().querySelectorAll("[data-field=title] span")].map(line => line.textContent)).toEqual(["• Satu", "• Dua"]));
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

it("keeps the card in a frame that a phone can fold away, buttons still at hand", () => {
  setup();
  const frame = screen.getByRole("region", { name: "Pratinjau kartu" });
  const fold = within(frame).getByRole("button", { name: /Sembunyikan/ });
  expect(fold.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(fold);
  expect(within(frame).getByRole("button", { name: /Tampilkan/ }).getAttribute("aria-expanded")).toBe("false");
  expect(frame.hasAttribute("data-hidden")).toBe(true);
  expect(within(frame).getByRole("button", { name: "Unduh gambar" })).toBeTruthy();
});
