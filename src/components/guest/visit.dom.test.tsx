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
  window.localStorage.setItem(`wk_rsvp_${event.id.slice(0, 16)}`, JSON.stringify({ name: "Budi", attendance: "yes", party: 3 }));
  render(<EventExperience event={event} />);
  expect(screen.getByText("Terkonfirmasi · 3 orang")).toBeTruthy();
  expect(screen.getByText(/Atas nama Budi/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Konfirmasi atas nama lain" }).getAttribute("href")).toBe("#konfirmasi");
});

const open = (hash: string) => act(() => { window.location.hash = hash; window.dispatchEvent(new HashChangeEvent("hashchange")); });
const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

it("confirms a party on one screen through the general link, then shows what was confirmed", async () => {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ ok: true, message: "Tersimpan", data: { id: crypto.randomUUID() } }), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  const event = visit({ status: "published" });
  render(<EventExperience event={event} openPartyMax={10} />);
  open("#konfirmasi");
  expect(screen.getByRole("heading", { level: 1, name: "Konfirmasi kedatangan" })).toBeTruthy();
  // The form has no tab bar: sending is the way on.
  expect(screen.queryByRole("navigation", { name: "Navigasi kunjungan" })).toBeNull();
  type("Nama lengkap", "Budi Santoso");
  type("Instansi / perusahaan", "PT Contoh");
  fireEvent.click(screen.getByRole("button", { name: /Datang bersama orang lain/ }));
  fireEvent.click(screen.getByRole("button", { name: "Tambah satu orang" }));
  type(/Nama yang ikut/, "Rina, Tono");
  fireEvent.click(screen.getByLabelText("Vegetarian"));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Kirim konfirmasi/ })); });
  const body = JSON.parse(String(fetch.mock.calls[0]![1]!.body));
  expect(body).toMatchObject({ name: "Budi Santoso", organization: "PT Contoh", attendance: "yes", party_size: 3, companion_names: ["Rina", "Tono"], dietary: ["vegetarian"], consent: true });
  expect(screen.getByRole("heading", { name: "Sampai jumpa, Budi Santoso!" })).toBeTruthy();
  expect(screen.getByText(/3 orang · Vegetarian/)).toBeTruthy();
  expect(JSON.parse(window.localStorage.getItem(`wk_rsvp_${event.id.slice(0, 16)}`)!)).toEqual({ name: "Budi Santoso", attendance: "yes", party: 3 });
});

it("offers no party before the general-link migration, and checks the names against the count", () => {
  render(<EventExperience event={visit({ status: "published" })} />);
  open("#konfirmasi");
  expect(screen.queryByRole("button", { name: /Datang bersama orang lain/ })).toBeNull();
  expect(screen.getByText(/Satu konfirmasi untuk satu orang/)).toBeTruthy();
  cleanup();
  render(<EventExperience event={visit({ status: "published" })} openPartyMax={10} />);
  open("#konfirmasi");
  type("Nama lengkap", "Budi Santoso");
  type("Instansi / perusahaan", "PT Contoh");
  fireEvent.click(screen.getByRole("button", { name: /Datang bersama orang lain/ }));
  type(/Nama yang ikut/, "Rina, Tono");
  fireEvent.click(screen.getByRole("button", { name: /Kirim konfirmasi/ }));
  expect(screen.getByText("Nama yang ditulis lebih banyak dari jumlah orang yang ikut.")).toBeTruthy();
});

it("lets a personal guest reopen their confirmation, with their name as a card", () => {
  const rsvp = { id: "r1", event_id: "e", name: "Ibu Sari", organization: "PT Contoh", attendance: "yes" as const, phone: "", email: "", has_allergy: false, allergy_details: "", party_size: 2, companion_names: ["Budi"], created_at: "2026-10-01T00:00:00Z" };
  render(<EventExperience event={visit({ invitation_mode: "personal", status: "published" })} invitation={{ name: "Ibu Sari", token: "a".repeat(64), rsvp, party_size_max: 3 }} />);
  open("#konfirmasi");
  expect(screen.getByRole("heading", { name: "Sampai jumpa, Ibu Sari!" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Ubah konfirmasi/ }));
  expect(screen.getByText("PT Contoh")).toBeTruthy();
  expect(screen.queryByLabelText("Nama lengkap")).toBeNull();
  expect(screen.getByRole("button", { name: /Datang bersama orang lain/ }).getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByLabelText(/Nama yang ikut/)).toHaveProperty("value", "Budi");
});

it("shows the thank-you page without the tab bar after the visit", () => {
  render(<EventExperience event={visit()} phase="after" />);
  expect(screen.getByRole("heading", { level: 1, name: /Terima kasih/ })).toBeTruthy();
  expect(screen.queryByRole("navigation", { name: "Navigasi kunjungan" })).toBeNull();
});

it("opens Cara datang on the route map, then the turns, the host, what to do on arrival and Google Maps", () => {
  const image = (url: string, alt: string) => ({ url, alt, srcset: [] });
  window.location.hash = "#cara-datang";
  render(<EventExperience event={visit({
    address: "Jl. Bhinneka No. 09, Condong Catur", location_url: "https://maps.app.goo.gl/contoh",
    route: {
      map_image: image("https://example.test/map.webp", "Peta menuju kantor"),
      steps: [{ title: "Lewat Jl. Pondok Raya", description: "Rute paling mudah.", image: image("", "") }, { title: "Belok di Jl. Bhinneka", description: "", image: image("https://example.test/turn.webp", "Titik belok") }],
      points: [{ icon: "door", title: "Lobi & resepsionis", description: "Resepsionis akan mengantar." }, { icon: "pin", title: "Titik temu", description: "" }],
    },
  })} />);
  const page = document.getElementById("location")!;
  // The map first, with its zoom link, then the address.
  expect(within(page).getByAltText("Peta menuju kantor")).toBeTruthy();
  expect(within(page).getByRole("link", { name: /Perbesar peta/ }).getAttribute("href")).toBe("https://example.test/map.webp");
  expect(within(page).getByText("Jl. Bhinneka No. 09, Condong Catur")).toBeTruthy();
  const steps = within(page).getByRole("list", { name: "Langkah menuju kantor" });
  expect(within(steps).getAllByRole("heading").map(heading => heading.textContent)).toEqual(["Lewat Jl. Pondok Raya", "Belok di Jl. Bhinneka"]);
  expect(within(steps).getByAltText("Titik belok")).toBeTruthy();
  expect(within(page).getByText("Tersesat? Tanya kami")).toBeTruthy();
  expect(within(page).getByRole("link", { name: /WhatsApp|Dewi/ }).getAttribute("href")).toMatch(/wa\.me/);
  const arrival = within(page).getByRole("list", { name: "Saat tiba" });
  expect(within(arrival).getAllByRole("heading").map(heading => heading.textContent)).toEqual(["Lobi & resepsionis", "Titik temu"]);
  expect(within(page).getByRole("link", { name: /Buka Google Maps/ }).getAttribute("href")).toBe("https://maps.app.goo.gl/contoh");
});

it("opens Cara datang on a photo of the place when there is no route map", () => {
  window.location.hash = "#cara-datang";
  render(<EventExperience event={visit({ gallery: [{ id: "g1", url: "https://example.test/lobi.webp", alt: "Lobi kantor", caption: "", sort_order: 0, srcset: [] }] })} />);
  const page = document.getElementById("location")!;
  expect(within(page).getByAltText("Lobi kantor").closest("figure")).toBeTruthy();
  expect(within(page).queryByRole("list", { name: "Saat tiba" })).toBeNull();
});

it("shows only the way here on /KODE/panduan: no tab bar, no confirmation, a link back to the visit", async () => {
  const { ArrivalGuide } = await import("./ArrivalGuide");
  const event = visit({
    code: "AB23CD", title: "Kunjungan PT Sinar Abadi", address: "Jl. Bhinneka No. 09", location_url: "https://maps.app.goo.gl/contoh",
    route: { map_image: { url: "https://example.test/map.webp", alt: "Peta menuju kantor", srcset: [] }, steps: [{ title: "Lewat Jl. Pondok Raya", description: "", image: { url: "", alt: "", srcset: [] } }], points: [{ icon: "door", title: "Lobi & resepsionis", description: "" }] },
  });
  render(<ArrivalGuide event={event} />);
  expect(screen.getByRole("heading", { level: 1, name: "Cara datang" })).toBeTruthy();
  expect(screen.getByText("Kunjungan PT Sinar Abadi")).toBeTruthy();
  expect(screen.getByAltText("Peta menuju kantor")).toBeTruthy();
  expect(screen.getByRole("list", { name: "Saat tiba" })).toBeTruthy();
  expect(screen.getByRole("link", { name: /Buka Google Maps/ })).toBeTruthy();
  expect(screen.queryByRole("navigation", { name: "Navigasi kunjungan" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Konfirmasi/ })).toBeNull();
  expect(screen.getByRole("link", { name: /Buka halaman kunjungan/ }).getAttribute("href")).toBe("/AB23CD");
});
