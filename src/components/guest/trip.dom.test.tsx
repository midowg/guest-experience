import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { smTdnYogyakarta } from "@/lib/fixtures/sm-tdn-yogyakarta";
import { EventExperience } from "./EventExperience";

afterEach(cleanup);

it("shows the trip's transport, hotel, do & don't and help contacts", () => {
  render(<EventExperience event={smTdnYogyakarta()} preview />);
  const transport = document.getElementById("transport")!;
  expect(within(transport).getByRole("heading", { name: "Kereta Taksaka KA 46" })).toBeTruthy();
  expect(within(transport).getByText("07.45 WIB")).toBeTruthy();
  expect(within(transport).getByText(/menunggu tiket final/)).toBeTruthy();
  const stay = document.getElementById("stay")!;
  expect(within(stay).getByRole("heading", { name: "THE 1O1 Yogyakarta Tugu" })).toBeTruthy();
  expect(within(stay).getByRole("link", { name: /Telepon hotel/ }).getAttribute("href")).toBe("tel:02742920101");
  const guidelines = document.getElementById("guidelines")!;
  expect(within(guidelines).getByText("Tetap duduk saat tur VW berjalan")).toBeTruthy();
  expect(within(guidelines).getByText("Meninggalkan rombongan tanpa memberi kabar")).toBeTruthy();
  const contacts = document.getElementById("contacts")!;
  // A mobile number gets WhatsApp; the hotel's landline only a call.
  expect(within(contacts).getByRole("link", { name: /^WhatsApp Dimas Wijanarko/ }).getAttribute("href")).toBe("https://wa.me/628112546096");
  expect(within(contacts).queryByRole("link", { name: /^WhatsApp THE 1O1/ })).toBeNull();
  expect(within(contacts).getByText("Rumah Sakit Bethesda Yogyakarta")).toBeTruthy();
  expect(screen.getAllByRole("navigation").some(nav => nav.textContent?.includes("Transportasi"))).toBe(true);
});

it("shows the day's cover above its sessions and a card's pictures", () => {
  const event = smTdnYogyakarta();
  event.trip.day_covers = [{ day: "2026-11-05", image: { url: "https://example.test/day1.webp", alt: "Sampul hari pertama", srcset: [] } }];
  event.prepare.items[2].images = [{ url: "https://example.test/kaos.webp", alt: "Kaos acara", srcset: [] }];
  render(<EventExperience event={event} preview />);
  expect(screen.getByRole("img", { name: "Sampul hari pertama" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Lihat foto penuh: Kaos acara" })).toBeTruthy();
});

it("puts the client's logo in the header and names Werkudara in the footer", () => {
  const event = smTdnYogyakarta();
  event.client_logo = { url: "https://example.test/sm.webp", alt: "Logo PT Surya Madistrindo", srcset: [] };
  render(<EventExperience event={event} preview />);
  expect(screen.getByRole("link", { name: /^Logo PT Surya Madistrindo — / })).toBeTruthy();
  expect(screen.getByText("Diselenggarakan oleh")).toBeTruthy();
  expect(screen.getByText("Werkudara Group")).toBeTruthy();
  expect(screen.getByText("Journey by Werkudara Group")).toBeTruthy();
});

it("shows a session's photo small beside its title and opens it full size", () => {
  const event = smTdnYogyakarta();
  const sate = event.agenda.find(item => item.title.startsWith("Makan siang di Sate"))!;
  event.agenda_details[sate.id] = { ...event.agenda_details[sate.id], photo: { url: "https://example.test/sate.webp", alt: "Sate klathak di kuah gulai", srcset: [] } };
  event.trip.stay.photos = [{ url: "https://example.test/hotel.webp", alt: "Fasad hotel", srcset: [] }, { url: "https://example.test/kamar.webp", alt: "Kamar hotel", srcset: [] }];
  render(<EventExperience event={event} preview />);
  const thumb = screen.getByRole("button", { name: "Lihat foto penuh: Sate klathak di kuah gulai" });
  const dialog = thumb.nextElementSibling as HTMLDialogElement;
  expect(dialog.hasAttribute("open")).toBe(false);
  fireEvent.click(thumb);
  expect(dialog.hasAttribute("open")).toBe(true);
  expect(within(dialog).getByRole("img", { name: "Sate klathak di kuah gulai" })).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Tutup" }));
  expect(dialog.hasAttribute("open")).toBe(false);
  // The hotel's photos are small pictures on its card; each opens full size.
  expect(screen.getByRole("button", { name: "Lihat foto penuh: Fasad hotel" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Lihat foto penuh: Kamar hotel" })).toBeTruthy();
});

it("calls through buttons without printing the numbers", () => {
  render(<EventExperience event={smTdnYogyakarta()} preview />);
  const contacts = document.getElementById("contacts")!;
  expect(within(contacts).queryByText(/0811|0274|586688/)).toBeNull();
  expect(within(contacts).getByRole("link", { name: "Telepon Dimas Wijanarko" }).getAttribute("href")).toBe("tel:08112546096");
  expect(within(contacts).getByRole("link", { name: "Telepon rumah sakit" }).getAttribute("href")).toBe("tel:0274586688");
  const stay = document.getElementById("stay")!;
  expect(within(stay).queryByText(/0274/)).toBeNull();
  expect(within(stay).getByRole("link", { name: "Telepon hotel" }).getAttribute("href")).toBe("tel:02742920101");
});

it("ends with Werkudara Group as on werkudara.com: offices, contact buttons, social pages and copyright", () => {
  render(<EventExperience event={smTdnYogyakarta()} preview />);
  const footer = document.querySelector("footer")!;
  expect(within(footer).getByText(/Jl\. Bhinneka No\. 9, Condongcatur/)).toBeTruthy();
  expect(within(footer).getByText(/Puri Candra Asri Blok A No\. 20/)).toBeTruthy();
  expect(within(footer).getByRole("link", { name: "Email" }).getAttribute("href")).toBe("mailto:info@werkudara.com");
  expect(within(footer).getByRole("link", { name: "Telepon kantor" }).getAttribute("href")).toBe("tel:+622742832999");
  expect(within(footer).getByRole("link", { name: /Instagram/ })).toBeTruthy();
  expect(within(footer).queryByText(/2832-999|2546-001/)).toBeNull();
  expect(within(footer).getByText(`© ${new Date().getFullYear()} Werkudara Group. Hak cipta dilindungi.`)).toBeTruthy();
});
