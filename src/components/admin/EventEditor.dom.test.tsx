import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { EventEditor } from "./EventEditor";

// The full editor is a large DOM; role queries over it outlast the 5 s default when the
// whole suite runs in parallel. The cost is in the queries, not in the behaviour under test.
vi.setConfig({ testTimeout: 20000 });

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const embedUrl = "https://www.google.com/maps/embed?pb=!1m18";

beforeEach(() => {
  refresh.mockClear();
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal("fetch", vi.fn(async (_url, init: RequestInit) => {
    const event = JSON.parse(init.body as string);
    return new Response(JSON.stringify({ ok: true, data: event, message: "Perubahan tersimpan." }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  window.scrollTo = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Fields live in the side panel: open a block the way an admin does, through its card. */
const openPanel = (title: string) => fireEvent.click(screen.getByRole("button", { name: `Ubah ${title}` }));

it("saves the PIC and chosen telephone channel", async () => {
  render(<EventEditor event={createSeedEvent()} />);
  openPanel("Kontak");
  fireEvent.change(screen.getByRole("textbox", { name: "Nama PIC" }), { target: { value: "Koordinator Acara" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Nomor PIC" }), { target: { value: "0812 3456 7890" } });
  fireEvent.click(screen.getByRole("radio", { name: "Telepon" }));
  fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
  const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(JSON.parse(init.body).contact).toEqual({ name: "Koordinator Acara", phone: "0812 3456 7890", channel: "phone", heading: "", description: "", role: "", organization: "" });
}, 10000);

it("flags incomplete PIC details without sending the event", () => {
  render(<EventEditor event={createSeedEvent()} />);
  openPanel("Kontak");
  fireEvent.change(screen.getByRole("textbox", { name: "Nama PIC" }), { target: { value: "Koordinator Acara" } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  expect(screen.getByRole("textbox", { name: "Nomor PIC" }).getAttribute("aria-invalid")).toBe("true");
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it("requires an embed before saving the selected map mode", () => {
  render(<EventEditor event={createSeedEvent()} />);
  openPanel("Lokasi");
  fireEvent.click(screen.getByRole("radio", { name: "Peta sematan Google" }));
  fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  expect(screen.getByText("Isi kode sematan Google Maps.")).toBeTruthy();
  expect(screen.getByRole("textbox", { name: /Kode sematan Google Maps/ }).getAttribute("aria-invalid")).toBe("true");
  expect(screen.queryByRole("textbox", { name: "Tautan lokasi Maps" })).toBeNull();
  expect(screen.getByText(/Bagikan \(Share\).*Sematkan peta/)).toBeTruthy();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it("saves only the Google URL from a pasted iframe and restores manual mode without erasing the pin", async () => {
  render(<EventEditor event={createSeedEvent()} />);
  openPanel("Lokasi");
  fireEvent.click(screen.getByRole("radio", { name: "Peta sematan Google" }));
  fireEvent.change(screen.getByRole("textbox", { name: /Kode sematan Google Maps/ }), { target: { value: `<iframe src="${embedUrl}" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>` } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
  const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(JSON.parse(init.body).location_embed_url).toBe(embedUrl);
  expect(JSON.parse(init.body).location_display).toBe("embed");
  await vi.waitFor(() => expect(screen.getByText("Perubahan tersimpan.")).toBeTruthy());

  openPanel("Lokasi");
  fireEvent.click(screen.getByRole("radio", { name: "Alamat & tombol" }));
  expect(screen.queryByRole("textbox", { name: /Kode sematan Google Maps/ })).toBeNull();
  expect(screen.getByRole("textbox", { name: "Tautan lokasi Maps" })).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Petunjuk kedatangan (opsional)" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  const [, manualInit] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
  const saved = JSON.parse(manualInit.body);
  expect(saved.location_embed_url).toBe(embedUrl);
  expect(saved.location_display).toBe("manual");
  expect(saved.location_url).toBe(createSeedEvent().location_url);
  await vi.waitFor(() => expect(screen.getByText("Perubahan tersimpan.")).toBeTruthy());
  openPanel("Lokasi");
  fireEvent.click(screen.getByRole("radio", { name: "Peta sematan Google" }));
  expect((screen.getByRole("textbox", { name: /Kode sematan Google Maps/ }) as HTMLTextAreaElement).value).toBe(embedUrl);
}, 20000);

it("saves the event kind, audience, theme, and experience story", async () => {
  render(<EventEditor event={createSeedEvent()} />);
  openPanel("Jenis, audiens, dan tampilan");
  fireEvent.click(screen.getByRole("radio", { name: /^Kunjungan/ }));
  fireEvent.click(screen.getByRole("radio", { name: /^Internal/ }));
  fireEvent.click(screen.getByRole("radio", { name: /^Malam Apresiasi/ }));
  openPanel("Pengalaman kunjungan");
  fireEvent.change(screen.getByRole("textbox", { name: "Cerita singkat" }), { target: { value: "Kami menyambut Anda seperti kerabat." } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
  const saved = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
  expect(saved).toMatchObject({ event_kind: "kunjungan", audience: "internal", theme: { key: "gala", corners: "square" } });
  expect(saved.experience.story).toBe("Kami menyambut Anda seperti kerabat.");
  await vi.waitFor(() => expect(screen.getByText("Perubahan tersimpan.")).toBeTruthy());
  openPanel("Setelah acara");
  expect(screen.getByText("Acara internal: ajakan kolaborasi dan ulasan Google tidak ditampilkan.")).toBeTruthy();
}, 10000);

it("summarises blocks on cards and marks unsaved changes", () => {
  render(<EventEditor event={createSeedEvent()} />);
  expect(screen.getByRole("button", { name: "Ubah Kontak" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Kesiapan tayang" })).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Nama PIC" })).toBeNull();
  openPanel("Kontak");
  expect(screen.getByRole("dialog", { name: "Kontak" })).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "Nama PIC" }), { target: { value: "Raja" } });
  fireEvent.click(screen.getByRole("button", { name: "Selesai" }));
  expect(screen.queryByRole("textbox", { name: "Nama PIC" })).toBeNull();
  expect(screen.getAllByText("Belum disimpan").length).toBeGreaterThan(0);
});
