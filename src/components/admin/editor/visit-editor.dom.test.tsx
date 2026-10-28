import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import type { EventRecord } from "@/lib/types";
import { EventEditor } from "@/components/admin/editor/EventEditor";
import { editorMenu, menuButton, openBlock } from "@/components/admin/editor/editor-test-helpers";

vi.setConfig({ testTimeout: 20000 });
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  window.scrollTo = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function visit(): EventRecord {
  const event = createSeedEvent();
  return { ...event, event_kind: "kunjungan", sections: event.sections.map(section => ({ ...section, enabled: ["about", "agenda", "location", "team", "rsvp", "contact", "feedback"].includes(section.key) })) };
}

it("lists the visit's guest screens in the guest's order, not the invitation's blocks", () => {
  render(<EventEditor event={visit()} />);
  const menu = editorMenu();
  expect(within(menu).getAllByRole("listitem").map(item => item.textContent?.replace(/^\d+/, "").replace(/Aktif$/, ""))).toEqual([
    "Info kunjungan", "Sambutan", "Tentang kunjungan", "Konfirmasi kedatangan", "Cara datang", "Rundown", "Hari H", "Kenali Tim Werkudara", "Pendamping kunjungan",
    "Terima kasih & survei", "Foto kunjungan", "Bahasa & terjemahan", "Terbitkan",
  ]);
  for (const invitation of ["Identitas & undangan", "Foto latar pembuka", "Urutan & tampilan bagian", "Pengalaman kunjungan", "Persiapan tamu"]) expect(menuButton(invitation)).toBeNull();
});

it("numbers the screens, marks the optional ones, and walks on with Lanjut", () => {
  render(<EventEditor event={visit()} />);
  openBlock("Rundown");
  expect(screen.getByText(/Sebelum kunjungan · Layar 5 dari 10 · Opsional/i)).toBeTruthy();
  expect(screen.getByRole("switch", { name: "Tampilkan Rundown ke tamu" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Lanjut: Hari H/ }));
  expect(screen.getByRole("heading", { level: 2, name: "Hari H" })).toBeTruthy();
});

it("keeps the date and address in Info kunjungan and the greeting in Sambutan", () => {
  render(<EventEditor event={visit()} />);
  expect(screen.getByRole("textbox", { name: "Nama kunjungan" })).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Alamat" })).toBeTruthy();
  openBlock("Sambutan");
  expect(screen.getByRole("textbox", { name: "Judul sambutan" })).toBeTruthy();
  openBlock("Cara datang");
  // The address is typed once, in Info kunjungan.
  expect(screen.queryByRole("textbox", { name: "Alamat" })).toBeNull();
  openBlock("Terima kasih & survei");
  expect(screen.getByRole("checkbox", { name: /^Tampilkan survei di halaman terima kasih/ })).toBeTruthy();
});

it("adds Info kedatangan in Cara datang by hand; the office's example belongs to Panduan lokasi", () => {
  render(<EventEditor event={visit()} />);
  openBlock("Cara datang");
  expect(screen.getByRole("heading", { name: "Info kedatangan" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Pakai contoh/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tambah info" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Judul" }), { target: { value: "Lobi" } });
  expect((screen.getByRole("textbox", { name: "Judul" }) as HTMLInputElement).value).toBe("Lobi");
  fireEvent.click(screen.getByRole("button", { name: "Hapus info 1" }));
  expect(screen.queryByRole("textbox", { name: "Judul" })).toBeNull();
});
