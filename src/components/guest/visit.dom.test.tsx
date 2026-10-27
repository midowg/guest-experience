import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import type { EventRecord } from "@/lib/types";
import { EventExperience } from "./EventExperience";

beforeEach(() => { vi.spyOn(window, "scrollTo").mockImplementation(() => {}); });
afterEach(() => { cleanup(); window.location.hash = ""; window.localStorage.clear(); vi.restoreAllMocks(); });

function visit(patch: Partial<EventRecord> = {}): EventRecord {
  const event = createSeedEvent();
  return {
    ...event,
    event_kind: "kunjungan",
    contact: { ...event.contact, name: "Dewi", phone: "0811 2831 929", role: "Hospitality", channel: "whatsapp" },
    sections: event.sections.map(section => ({ ...section, enabled: ["about", "agenda", "location", "team", "rsvp", "contact"].includes(section.key) })),
    greeting: "", rsvp_enabled: true, rsvp_closes_at: null,
    ...patch,
  };
}

it("opens on Home with the facts, tiles for the optional parts and a tab bar", () => {
  render(<EventExperience event={visit()} />);
  expect(screen.getByRole("heading", { level: 1, name: "Selamat datang di Werkudara" })).toBeTruthy();
  const explore = screen.getByRole("navigation", { name: "Jelajahi" });
  expect(within(explore).getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["#tentang", "#jadwal", "#tim"]);
  const tabs = screen.getByRole("navigation", { name: "Navigasi kunjungan" });
  expect(within(tabs).getAllByRole("link").map(link => link.textContent)).toEqual(["Beranda", "Cara datang", "Jadwal", "Kontak"]);
  expect(within(tabs).getByRole("link", { name: "Beranda" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByText(/boleh dibagikan ke rombongan/)).toBeTruthy();
});

it("greets a personal guest by name and shows no ticket", () => {
  render(<EventExperience event={visit({ invitation_mode: "personal" })} invitation={{ name: "Ibu Sari", token: "a".repeat(64), rsvp: { id: "r1", event_id: "e", name: "Ibu Sari", organization: "PT Contoh", attendance: "yes", phone: "", email: "", has_allergy: false, allergy_details: "", created_at: "2026-10-01T00:00:00Z" } }} />);
  expect(screen.getByRole("heading", { level: 1, name: "Halo, Ibu Sari" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: /tiket/i })).toBeNull();
  expect(screen.getByRole("link", { name: /Lihat cara datang/ }).getAttribute("href")).toBe("#cara-datang");
});

it("moves between screens with the address hash, and the host can be asked or called", () => {
  render(<EventExperience event={visit()} />);
  act(() => { window.location.hash = "#kontak"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
  expect(screen.getByRole("heading", { level: 1, name: "Kontak" })).toBeTruthy();
  expect(screen.getByText("Pendamping kunjungan Anda")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Tanya kami/ }).getAttribute("href")).toMatch(/^https:\/\/wa\.me\//);
  expect(screen.getByRole("link", { name: /Telepon/ }).getAttribute("href")).toMatch(/^tel:/);
  // A part that is switched off has no screen: its address falls back to Home.
  act(() => { window.location.hash = "#persiapan"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
  expect(screen.getByRole("heading", { level: 1, name: "Selamat datang di Werkudara" })).toBeTruthy();
});

it("remembers a confirmation made on this device through the general link", () => {
  const event = visit();
  window.localStorage.setItem(`wk_rsvp_${event.id.slice(0, 16)}`, JSON.stringify({ name: "Budi", attendance: "yes" }));
  render(<EventExperience event={event} />);
  expect(screen.getByText("Terkonfirmasi atas nama Budi")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Konfirmasi atas nama lain" }));
  expect(screen.getByRole("button", { name: "Mulai konfirmasi" })).toBeTruthy();
});

it("shows the thank-you page without the tab bar after the visit", () => {
  render(<EventExperience event={visit()} phase="after" />);
  expect(screen.getByRole("heading", { level: 1, name: /Terima kasih/ })).toBeTruthy();
  expect(screen.queryByRole("navigation", { name: "Navigasi kunjungan" })).toBeNull();
});
