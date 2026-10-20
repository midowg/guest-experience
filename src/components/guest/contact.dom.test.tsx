import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { EventExperience } from "./EventExperience";

afterEach(cleanup);

function eventWithContact(channel: "whatsapp" | "phone") {
  const event = createSeedEvent();
  event.contact = { ...event.contact, name: "Koordinator Acara", phone: "0812 3456 7890", channel };
  event.sections = event.sections.map(section => section.key === "contact" ? { ...section, enabled: true } : section);
  return event;
}

it("opens WhatsApp with a clean international number and keeps contact when RSVP is hidden", () => {
  const event = eventWithContact("whatsapp");
  event.sections = event.sections.map(section => section.key === "rsvp" ? { ...section, enabled: false } : section);
  event.rsvp_enabled = false;
  render(<EventExperience event={event} preview />);
  const link = screen.getByRole("link", { name: /Hubungi via WhatsApp/ });
  expect(link.getAttribute("href")).toBe("https://wa.me/6281234567890");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(screen.getByRole("heading", { name: "Ada pertanyaan?" })).toBeTruthy();
  expect(screen.getByText("Hubungi PIC untuk informasi lebih lanjut.")).toBeTruthy();
  expect(screen.getByText("Koordinator Acara")).toBeTruthy();
  expect(screen.getByText("081234567890")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Kabarkan kehadiran Anda." })).toBeNull();
});

it("offers a phone call after RSVP has closed", () => {
  const event = eventWithContact("phone");
  event.rsvp_closes_at = "2020-01-01T00:00:00+07:00";
  render(<EventExperience event={event} />);
  expect(screen.getByRole("link", { name: "Telepon PIC" }).getAttribute("href")).toBe("tel:081234567890");
  expect(screen.getByText(/Konfirmasi kehadiran telah ditutup/)).toBeTruthy();
});

it("uses local 08 for calls even when an older event stores +62", () => {
  const event = eventWithContact("phone");
  event.contact.phone = "+62 812 3456 7890";
  render(<EventExperience event={event} preview />);
  expect(screen.getByRole("link", { name: "Telepon PIC" }).getAttribute("href")).toBe("tel:081234567890");
  expect(screen.getByText("081234567890")).toBeTruthy();
});

it("renders optional contact introduction, role, and organization", () => {
  const event = eventWithContact("whatsapp");
  event.contact.heading = "Any questions before your visit?";
  event.contact.description = "If you need directions or help with access, please contact our Hospitality Specialist.";
  event.contact.role = "Hospitality Specialist";
  event.contact.organization = "Werkudara Group";
  render(<EventExperience event={event} preview />);
  expect(screen.getByRole("heading", { name: "Any questions before your visit?" })).toBeTruthy();
  expect(screen.getByText(event.contact.description)).toBeTruthy();
  expect(screen.getByText("Hospitality Specialist")).toBeTruthy();
  expect(screen.getByText("Werkudara Group")).toBeTruthy();
});

it("omits the contact section and navigation until contact details are filled", () => {
  const event = createSeedEvent();
  event.sections = event.sections.map(section => section.key === "contact" ? { ...section, enabled: true } : section);
  render(<EventExperience event={event} preview />);
  expect(screen.queryByRole("heading", { name: "Ada pertanyaan?" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Kontak" })).toBeNull();
});
