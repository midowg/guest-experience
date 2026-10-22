import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import type { EventRecord } from "@/lib/types";
import { EventExperience } from "./EventExperience";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const ids = ["7d000000-0000-4000-8000-000000000001", "7d000000-0000-4000-8000-000000000002", "7d000000-0000-4000-8000-000000000003"];
function trip(patch: Partial<EventRecord> = {}): EventRecord {
  const base = createSeedEvent();
  return {
    ...base, event_kind: "program", timezone: "Asia/Makassar", starts_at: "2026-11-02T08:00:00+08:00", ends_at: "2026-11-03T17:00:00+08:00",
    agenda: [
      { id: ids[0], starts_at: "2026-11-02T08:00:00+08:00", ends_at: "2026-11-02T09:30:00+08:00", title: "Penjemputan di bandara", description: "", sort_order: 0 },
      { id: ids[1], starts_at: "2026-11-02T15:00:00+08:00", ends_at: "2026-11-02T17:00:00+08:00", title: "Pantai Tanjung Aan", description: "", sort_order: 1 },
      { id: ids[2], starts_at: "2026-11-03T09:00:00+08:00", ends_at: "2026-11-03T12:00:00+08:00", title: "Desa Sade", description: "", sort_order: 2 },
    ],
    agenda_details: { [ids[1]]: { teaser: "kenapa pasirnya seperti merica?", did_you_know: "Butiran pasirnya besar dan bulat.", more_story: "Cerita panjang tentang pantai.", place: "Lombok Tengah", pdf_page: 4 } },
    presentation_pdf_url: "https://example.test/trip.pdf",
    ...patch,
  };
}

it("splits a multi-day rundown into day tabs", () => {
  render(<EventExperience event={trip()} preview />);
  const tabs = screen.getByRole("tablist", { name: "Pilih hari" });
  expect(within(tabs).getAllByRole("tab").map(tab => tab.querySelector("strong")?.textContent)).toEqual(["Hari 1", "Hari 2"]);
  expect(screen.getByText("Hari 1 dari 2")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Pantai Tanjung Aan" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Desa Sade" })).toBeNull();
  fireEvent.click(within(tabs).getAllByRole("tab")[1]);
  expect(screen.getByRole("heading", { name: "Desa Sade" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Pantai Tanjung Aan" })).toBeNull();
});

it("opens on today during the event", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T10:00:00+08:00"));
  render(<EventExperience event={trip()} />);
  const tabs = await screen.findByRole("tablist", { name: "Pilih hari" });
  await vi.waitFor(() => expect(within(tabs).getAllByRole("tab")[1].getAttribute("aria-selected")).toBe("true"));
});

it("shows place and length, and opens the Did you know detail in place", () => {
  render(<EventExperience event={trip()} preview />);
  expect(screen.getByText("Lombok Tengah")).toBeTruthy();
  expect(screen.getByText("2 jam")).toBeTruthy();
  expect(screen.getByText("1 jam 30 menit")).toBeTruthy();
  const discover = screen.getByRole("button", { name: /Kenali lebih dekat: kenapa pasirnya seperti merica\?/ });
  expect(discover.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByText("Tahukah Anda?")).toBeNull();
  fireEvent.click(discover);
  expect(screen.getByText("Tahukah Anda?")).toBeTruthy();
  expect(screen.getByText("Butiran pasirnya besar dan bulat.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Selengkapnya" }));
  expect(screen.getByText("Cerita panjang tentang pantai.")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Hal\. 4 presentasi/ }).getAttribute("href")).toBe("https://example.test/trip.pdf#page=4");
});

it("keeps a one-day rundown as a plain list", () => {
  const event = createSeedEvent();
  render(<EventExperience event={event} preview />);
  expect(screen.queryByRole("tablist", { name: "Pilih hari" })).toBeNull();
  expect(screen.getByRole("heading", { name: event.agenda[0].title })).toBeTruthy();
});

it("shows the emergency contact and nearest hospital with the contact section", () => {
  const event = trip({
    contact: { ...createSeedEvent().contact, name: "Raka", phone: "0812 3456 7890" },
    emergency: { name: "Tim medis", phone: "0812 1111 2222", hospital: "RSUD Praya", hospital_address: "Jl. Basuki Rahmat, Praya", hospital_maps_url: "https://maps.app.goo.gl/x" },
  });
  event.sections = event.sections.map(section => section.key === "contact" ? { ...section, enabled: true } : section);
  render(<EventExperience event={event} preview />);
  expect(screen.getByText("Kontak darurat")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Telepon Tim medis · 081211112222/ }).getAttribute("href")).toBe("tel:081211112222");
  expect(screen.getByText("RSUD Praya")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Petunjuk arah/ }).getAttribute("href")).toBe("https://maps.app.goo.gl/x");
});

it("offers the calendar file with a chosen reminder, linking the general page", () => {
  render(<EventExperience event={trip({ slug: "trip-lombok" })} preview />);
  fireEvent.click(screen.getByRole("button", { name: "Tambahkan jadwal ke kalender" }));
  const sheet = screen.getByRole("dialog", { name: "Tambahkan ke kalender" });
  const link = within(sheet).getByRole("link", { name: "Tambahkan ke kalender" });
  expect(link.getAttribute("href")).toBe("/e/trip-lombok/kalender.ics?ingat=30");
  // Before the trip there is no "today only".
  expect(within(sheet).queryByLabelText("Hari ini saja")).toBeNull();
  fireEvent.click(within(sheet).getByLabelText("Ingatkan 15 menit sebelumnya"));
  expect(link.getAttribute("href")).toBe("/e/trip-lombok/kalender.ics?ingat=15");
});

it("lets a guest on the trip save today's part only", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T08:30:00+08:00"));
  render(<EventExperience event={trip({ slug: "trip-lombok" })} />);
  fireEvent.click(await screen.findByRole("button", { name: "Tambahkan jadwal ke kalender" }));
  const sheet = screen.getByRole("dialog", { name: "Tambahkan ke kalender" });
  await vi.waitFor(() => expect(within(sheet).getByLabelText("Hari ini saja")).toBeTruthy());
  fireEvent.click(within(sheet).getByLabelText("Hari ini saja"));
  expect(within(sheet).getByRole("link", { name: "Tambahkan ke kalender" }).getAttribute("href")).toBe("/e/trip-lombok/kalender.ics?cakupan=hari-ini&ingat=30");
});

it("tells the guest on the day what comes next within the hour", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T08:35:00+08:00"));
  render(<EventExperience event={trip()} phase="day" />);
  expect(await screen.findByText(/Berikutnya · 25 menit lagi: Desa Sade/)).toBeTruthy();
});
