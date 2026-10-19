import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { EventEditor } from "./EventEditor";

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

it("saves the PIC and chosen telephone channel", async () => {
  render(<EventEditor event={createSeedEvent()} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Nama PIC" }), { target: { value: "Koordinator Acara" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Nomor PIC" }), { target: { value: "0812 3456 7890" } });
  fireEvent.click(screen.getByRole("radio", { name: "Telepon" }));
  fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
  const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(JSON.parse(init.body).contact).toEqual({ name: "Koordinator Acara", phone: "0812 3456 7890", channel: "phone", heading: "", description: "", role: "", organization: "" });
});

it("flags incomplete PIC details without sending the event", () => {
  render(<EventEditor event={createSeedEvent()} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Nama PIC" }), { target: { value: "Koordinator Acara" } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  expect(screen.getByRole("textbox", { name: "Nomor PIC" }).getAttribute("aria-invalid")).toBe("true");
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it("requires an embed before saving the selected map mode", () => {
  render(<EventEditor event={createSeedEvent()} />);
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
  fireEvent.click(screen.getByRole("radio", { name: "Peta sematan Google" }));
  fireEvent.change(screen.getByRole("textbox", { name: /Kode sematan Google Maps/ }), { target: { value: `<iframe src="${embedUrl}" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>` } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
  const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(JSON.parse(init.body).location_embed_url).toBe(embedUrl);
  expect(JSON.parse(init.body).location_display).toBe("embed");
  await vi.waitFor(() => expect(screen.getByText("Perubahan tersimpan.")).toBeTruthy());

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
  fireEvent.click(screen.getByRole("radio", { name: "Peta sematan Google" }));
  expect((screen.getByRole("textbox", { name: /Kode sematan Google Maps/ }) as HTMLTextAreaElement).value).toBe(embedUrl);
}, 10000);
