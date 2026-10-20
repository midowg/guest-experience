import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import type { EventRecord } from "@/lib/types";
import { EventExperience } from "./EventExperience";

afterEach(() => { cleanup(); vi.useRealTimers(); });

function journeyEvent(patch: Partial<EventRecord> = {}): EventRecord {
  const event = createSeedEvent();
  return {
    ...event,
    event_kind: "kunjungan",
    contact: { ...event.contact, name: "Raja", phone: "0811 2831 929", role: "Hospitality Specialist", channel: "whatsapp" },
    experience: { title: "", story: "Kami menyambut Anda seperti kerabat.", image: { url: "", alt: "", srcset: [] }, moments: [{ icon: "coffee", title: "Sambutan di pendopo", description: "Teh hangat" }] },
    route: { map_image: { url: "https://example.test/map.webp", alt: "Peta menuju kantor", srcset: [] }, steps: [{ title: "Belok di Jl. Bhinneka", description: "", image: { url: "https://example.test/turn.webp", alt: "Titik belok", srcset: [] } }] },
    sections: event.sections.map(section => ({ ...section, enabled: ["about", "experience", "agenda", "location", "rsvp", "contact"].includes(section.key) })),
    ...patch,
  };
}

it("opens with the kind of invitation and shortcuts to the enabled sections", () => {
  render(<EventExperience event={journeyEvent()} preview />);
  expect(screen.getByText("Undangan kunjungan")).toBeTruthy();
  const shortcuts = screen.getByRole("navigation", { name: "Pintasan undangan" });
  expect(within(shortcuts).getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["#experience", "#location", "#contact"]);
});

it("tells the experience story with moments and points to the needs form", () => {
  render(<EventExperience event={journeyEvent()} preview />);
  expect(screen.getByRole("heading", { name: "Ada yang sedang kami siapkan untuk Anda." })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Sambutan di pendopo" })).toBeTruthy();
  expect(screen.getByRole("link", { name: /Ada kebutuhan makanan atau akses/ }).getAttribute("href")).toBe("#rsvp");
});

it("shows the route map, numbered steps with their photo, and the PIC on WhatsApp", () => {
  render(<EventExperience event={journeyEvent()} preview />);
  expect(screen.getByRole("img", { name: "Peta menuju kantor" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Belok di Jl. Bhinneka" })).toBeTruthy();
  expect(screen.getByRole("img", { name: "Titik belok" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Hubungi Raja via WhatsApp (tab baru)" }).getAttribute("href")).toBe("https://wa.me/628112831929");
});

it("applies the chosen theme on the guest root", () => {
  const { container } = render(<EventExperience event={journeyEvent({ theme: { key: "gala", corners: "soft" } })} preview />);
  const root = container.firstElementChild as HTMLElement;
  expect(root.dataset.theme).toBe("gala");
  expect(root.style.getPropertyValue("--color-primary")).toBe("#c9a35b");
  expect(root.style.getPropertyValue("--radius")).toBe("12px");
});

it("on the day greets the guest and marks the session happening now", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T18:30:00+07:00"));
  render(<EventExperience event={journeyEvent({ day_note: "Lapor ke resepsionis." })} phase="day" invitation={{ name: "Ibu Sari", token: "a".repeat(64), rsvp: null }} />);
  expect(screen.getByRole("heading", { level: 1, name: "Selamat datang, Ibu Sari" })).toBeTruthy();
  const now = await screen.findByText("Sekarang");
  expect(now.closest("li")?.textContent).toContain("Meeting");
  expect(now.closest("li")?.getAttribute("aria-current")).toBe("step");
  expect(screen.getByText("Lapor ke resepsionis.")).toBeTruthy();
});

it("after the event thanks the guest, offers the review and collaboration to external guests", () => {
  const event = journeyEvent({ review_enabled: true, review_url: "https://example.test/review", after: { title: "", message: "Senang bisa menyambut Anda.", image: { url: "", alt: "", srcset: [] }, collaboration: { enabled: true, title: "", description: "", button_label: "" } } });
  render(<EventExperience event={event} phase="after" />);
  expect(screen.getByRole("heading", { level: 1, name: "Terima kasih atas kehadiran Anda." })).toBeTruthy();
  expect(screen.getByText("Senang bisa menyambut Anda.")).toBeTruthy();
  expect(screen.getAllByRole("link", { name: /Bagikan ulasan Anda/ })).toHaveLength(1);
  expect(screen.getByRole("link", { name: /Hubungi tim Werkudara/ }).getAttribute("href")).toBe("https://wa.me/628112831929");
  expect(screen.queryByRole("heading", { name: "Kabarkan kehadiran Anda." })).toBeNull();
});

it("never shows the Google review or collaboration for an internal event", () => {
  const event = journeyEvent({ audience: "internal", review_enabled: true, review_url: "https://example.test/review", after: { title: "", message: "", image: { url: "", alt: "", srcset: [] }, collaboration: { enabled: true, title: "", description: "", button_label: "" } } });
  const { rerender } = render(<EventExperience event={event} phase="after" />);
  expect(screen.queryByRole("link", { name: /Bagikan ulasan Anda/ })).toBeNull();
  expect(screen.queryByRole("link", { name: /Hubungi tim Werkudara/ })).toBeNull();
  rerender(<EventExperience event={event} phase="before" />);
  expect(screen.queryByRole("link", { name: /Bagikan ulasan Anda/ })).toBeNull();
});

it("shows custom preparation cards with their checklist, and hides the section while empty", () => {
  const sections = journeyEvent().sections.map(section => section.key === "prepare" ? { ...section, enabled: true } : section);
  const prepare = { title: "", intro: "Mohon disiapkan sebelum berangkat.", items: [
    { icon: "shirt" as const, title: "Dress code", description: "Batik atau kemeja berkerah.", list: [] },
    { icon: "backpack" as const, title: "Yang perlu dibawa", description: "", list: ["KTP", "Botol minum"] },
    { icon: "gift" as const, title: "Yang kami siapkan untuk Anda", description: "", list: ["Kaos acara", "Topi"] },
  ] };
  const { unmount } = render(<EventExperience event={journeyEvent({ sections, prepare })} preview />);
  expect(screen.getByRole("heading", { name: "Yang perlu Anda ketahui sebelum datang." })).toBeTruthy();
  expect(screen.getByText("Batik atau kemeja berkerah.")).toBeTruthy();
  for (const line of ["KTP", "Botol minum", "Kaos acara", "Topi"]) expect(screen.getByText(line)).toBeTruthy();
  expect(screen.getByRole("navigation", { name: "Bagian undangan" }).querySelector('a[href="#prepare"]')).toBeTruthy();
  unmount();
  render(<EventExperience event={journeyEvent({ sections, prepare: { title: "", intro: "", items: [] } })} preview />);
  expect(document.getElementById("prepare")).toBeNull();
});
