import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import type { RsvpRecord } from "@/lib/types";
import { EventExperience } from "./EventExperience";
import { TicketView } from "./TicketView";

afterEach(cleanup);
const event = { ...createSeedEvent(), slug: "trip-lombok", invitation_mode: "personal" as const };
const ticket = { name: "Sari Dewi", partySize: 2, qrSvg: "<svg data-qr></svg>", qrPng: "data:image/png;base64,AA", pageUrl: "https://invitation.example/e/trip-lombok/i/tok/tiket", backUrl: "/e/trip-lombok/i/tok" };

it("shows the guest, party and QR, with ways to keep the ticket", () => {
  const { container } = render(<TicketView event={event} ticket={ticket} reason="ready" />);
  expect(screen.getByText("Sari Dewi")).toBeTruthy();
  expect(screen.getByText("Untuk 2 orang")).toBeTruthy();
  expect(container.querySelector("[data-qr]")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Unduh gambar" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Unduh PDF" })).toBeTruthy();
  const whatsapp = screen.getByRole("link", { name: /Kirim ke WhatsApp/ }).getAttribute("href")!;
  expect(decodeURIComponent(whatsapp)).toContain(ticket.pageUrl);
  expect(screen.getByRole("link", { name: /Kembali ke undangan/ }).getAttribute("href")).toBe("/e/trip-lombok/i/tok");
});

it("explains when there is no ticket yet", () => {
  const { unmount } = render(<TicketView event={event} ticket={null} reason="not-attending" />);
  expect(screen.getByText(/setelah Anda mengonfirmasi hadir/)).toBeTruthy();
  unmount();
  render(<TicketView event={event} ticket={null} reason="unavailable" />);
  expect(screen.getByText(/sebutkan nama Anda di meja registrasi/)).toBeTruthy();
});

it("links the ticket from a confirmed yes on the personal invitation", () => {
  const rsvp: RsvpRecord = { id: "r1", event_id: event.id, name: "Sari Dewi", organization: "Mitra", attendance: "yes", phone: "", email: "", has_allergy: false, allergy_details: "", created_at: "2026-10-20T00:00:00Z" };
  render(<EventExperience event={event} invitation={{ name: "Sari Dewi", token: "a".repeat(64), rsvp }} preview />);
  expect(screen.getByRole("link", { name: /Lihat tiket masuk/ }).getAttribute("href")).toBe(`/e/trip-lombok/i/${"a".repeat(64)}/tiket`);
});
