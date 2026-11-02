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
  expect(within(transport).getByText(/Hall Utara Stasiun Gambir/)).toBeTruthy();
  const stay = document.getElementById("stay")!;
  expect(within(stay).getByRole("heading", { name: "THE 1O1 Yogyakarta Tugu" })).toBeTruthy();
  expect(within(stay).getByRole("link", { name: /Telepon hotel/ }).getAttribute("href")).toBe("tel:02742920101");
  const guidelines = document.getElementById("guidelines")!;
  expect(within(guidelines).getByText("Datang tepat waktu di titik kumpul")).toBeTruthy();
  expect(within(guidelines).getByText("Meninggalkan barang berharga di kendaraan")).toBeTruthy();
  const contacts = document.getElementById("contacts")!;
  // A mobile number gets WhatsApp; the hotel's landline only a call.
  expect(within(contacts).getByRole("link", { name: /^WhatsApp Dimas Wijanarko/ }).getAttribute("href")).toBe("https://wa.me/628112546096");
  expect(within(contacts).queryByRole("link", { name: /^WhatsApp THE 1O1/ })).toBeNull();
  // Contacts sit under their group headings; the hospital joins the last group, next to the hotel.
  const group = (name: string) => within(contacts).getByRole("heading", { name }).closest("section")!;
  expect(within(group("PT Surya Madistrindo")).getAllByRole("listitem")).toHaveLength(4);
  expect(within(group("Akomodasi & kesehatan")).getByRole("heading", { name: "RS Bethesda Yogyakarta" })).toBeTruthy();
  expect(within(group("Akomodasi & kesehatan")).getByRole("heading", { name: "THE 1O1 Yogyakarta Tugu" })).toBeTruthy();
  // 112 is the red bar at the end, not a person in a group.
  expect(within(contacts).queryByRole("heading", { name: "Darurat" })).toBeNull();
  expect(within(contacts).getByText("112")).toBeTruthy();
  expect(screen.getAllByRole("navigation").some(nav => nav.textContent?.includes("Transportasi"))).toBe(true);
});

it("shows the forecast as one small box per day, with a day that has no forecast yet", () => {
  render(<EventExperience event={smTdnYogyakarta()} preview />);
  const days = within(document.getElementById("guidelines")!).getByRole("list", { name: "Prakiraan per hari" });
  const boxes = within(days).getAllByRole("listitem");
  expect(boxes).toHaveLength(4);
  expect(within(boxes[0]).getByText("Kamis")).toBeTruthy();
  expect(boxes[0].textContent).toMatch(/32°.*min 24°.*Hujan 15%/);
  expect(within(boxes[3]).getByText("Belum ada data")).toBeTruthy();
  expect(screen.getByText(/Prakiraan per 31 Oktober 2026/)).toBeTruthy();
});

it("shows the day's cover above its sessions and a card's pictures", () => {
  const event = smTdnYogyakarta();
  event.trip.day_covers = [{ day: "2026-11-05", image: { url: "https://example.test/day1.webp", alt: "Sampul hari pertama", srcset: [] } }];
  event.prepare.items[0].images = [{ url: "https://example.test/kaos.webp", alt: "Kaos acara", srcset: [] }];
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
  expect(screen.getByText(`© ${new Date().getFullYear()} Werkudara Group · Journey`)).toBeTruthy();
});

it("opens a place highlight from its row: photos one after another, the story, points and note", async () => {
  const event = smTdnYogyakarta();
  const sate = event.agenda.find(item => item.title.startsWith("Makan siang di Sate"))!;
  event.agenda_details[sate.id] = { ...event.agenda_details[sate.id],
    photo: { url: "https://example.test/sate.webp", alt: "Sate klathak di kuah gulai", srcset: [] },
    photos: [{ url: "https://example.test/warung.webp", alt: "Warung Sate Pak Pong", srcset: [] }] };
  event.trip.stay.photos = [{ url: "https://example.test/hotel.webp", alt: "Fasad hotel", srcset: [] }, { url: "https://example.test/kamar.webp", alt: "Kamar hotel", srcset: [] }];
  render(<EventExperience event={event} preview />);
  // The row stays short: a small picture and "Lihat tempat"; nothing of the story yet.
  expect(screen.queryByText(/Besi ini menghantarkan panas/)).toBeNull();
  // A closed dialog is outside the accessibility tree, so it is found by its label.
  const sheet = document.querySelector<HTMLDialogElement>('dialog[aria-label="Sate Klathak Pak Pong"]')!;
  expect(sheet.hasAttribute("open")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Buka sorotan: Sate Klathak Pak Pong" }));
  expect(sheet.hasAttribute("open")).toBe(true);
  expect(within(sheet).getByRole("heading", { name: "Sate Klathak Pak Pong" })).toBeTruthy();
  expect(within(sheet).getByText(/Besi ini menghantarkan panas/)).toBeTruthy();
  expect(within(sheet).getByText(/Kabari tour leader sebelum hari keberangkatan/)).toBeTruthy();
  expect(within(sheet).getByText("1 dari 2")).toBeTruthy();
  expect(within(sheet).getByRole("button", { name: "Lihat foto penuh: Warung Sate Pak Pong" })).toBeTruthy();
  // Closing a photo opened from the sheet leaves the sheet open with its content (bug 2 Nov).
  const zoom = within(sheet).getByRole("button", { name: "Lihat foto penuh: Sate klathak di kuah gulai" }).nextElementSibling as HTMLDialogElement;
  fireEvent.click(within(sheet).getByRole("button", { name: "Lihat foto penuh: Sate klathak di kuah gulai" }));
  fireEvent.click(within(zoom).getByRole("button", { name: "Tutup" }));
  fireEvent(zoom, new Event("close"));
  expect(sheet.hasAttribute("open")).toBe(true);
  expect(within(sheet).getByText(/Besi ini menghantarkan panas/)).toBeTruthy();
  fireEvent.click(within(sheet).getAllByRole("button", { name: "Tutup" })[0]);
  expect(sheet.hasAttribute("open")).toBe(false);
  // A highlight without photos opens from its "Lihat tempat" button.
  fireEvent.click(screen.getByRole("button", { name: /^Lihat tempat\W+Kotagede$/ }));
  // It opens once the first sheet's step back in history has landed.
  expect(within(await screen.findByRole("dialog", { name: "Kotagede" })).getByText("Yang akan dilihat")).toBeTruthy();
  // The hotel's photos are small pictures on its card; each opens full size.
  expect(screen.getByRole("button", { name: "Lihat foto penuh: Fasad hotel" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Lihat foto penuh: Kamar hotel" })).toBeTruthy();
});

it("opens each day with its name, summary and tips", () => {
  render(<EventExperience event={smTdnYogyakarta()} preview />);
  const agenda = document.getElementById("agenda")!;
  expect(within(agenda).getByRole("heading", { name: "Sugeng Rawuh dan Jelajah Kotagede" })).toBeTruthy();
  const tips = within(agenda).getByRole("list", { name: "Tips hari ini" });
  expect(within(tips).getByText("Pakaian hari ini")).toBeTruthy();
  expect(within(tips).getByText("KTP, ponsel, air minum, dan kebutuhan pribadi.")).toBeTruthy();
});

it("calls through buttons without printing the numbers", () => {
  render(<EventExperience event={smTdnYogyakarta()} preview />);
  const contacts = document.getElementById("contacts")!;
  expect(within(contacts).queryByText(/0811|0274|586688/)).toBeNull();
  expect(within(contacts).getByRole("link", { name: "Telepon Dimas Wijanarko" }).getAttribute("href")).toBe("tel:08112546096");
  expect(within(contacts).getByRole("link", { name: "Telepon RS Bethesda Yogyakarta" }).getAttribute("href")).toBe("tel:0274586688");
  expect(within(contacts).getByRole("link", { name: "Telepon Darurat" }).getAttribute("href")).toBe("tel:112");
  const stay = document.getElementById("stay")!;
  expect(within(stay).queryByText(/0274/)).toBeNull();
  expect(within(stay).getByRole("link", { name: "Telepon hotel" }).getAttribute("href")).toBe("tel:02742920101");
});

it("ends with Werkudara Group as on werkudara.com: one short address, email and numbers as links, social pages and copyright", () => {
  render(<EventExperience event={smTdnYogyakarta()} preview />);
  const footer = document.querySelector("footer")!;
  expect(within(footer).getByText("Jl. Bhinneka No. 9, Condongcatur, Sleman, Yogyakarta")).toBeTruthy();
  expect(within(footer).queryByText(/Head Office|Puri Candra Asri/)).toBeNull();
  // The address says it opens a map, without needing a hover.
  expect(within(footer).getByText("Buka di Maps")).toBeTruthy();
  expect(within(footer).getByRole("link", { name: /^Email\W+info@werkudara\.com$/ }).getAttribute("href")).toBe("mailto:info@werkudara.com");
  expect(within(footer).getByRole("link", { name: /^Telepon kantor\W+\+62 274-2832-999$/ }).getAttribute("href")).toBe("tel:+622742832999");
  expect(within(footer).getByRole("link", { name: /^Telepon seluler\W+\+62 811-2546-001$/ }).getAttribute("href")).toBe("tel:+628112546001");
  // Each number has its own visible label, so the two are told apart.
  expect(within(footer).getByText("Telepon kantor")).toBeTruthy();
  expect(within(footer).getByText("Telepon seluler")).toBeTruthy();
  expect(within(footer).getByRole("link", { name: /Instagram/ })).toBeTruthy();
  expect(within(footer).getByText(`© ${new Date().getFullYear()} Werkudara Group · Journey`)).toBeTruthy();
  // Back to the top is the floating button's job, not the footer's.
  expect(within(footer).queryByRole("link", { name: /Kembali ke atas/ })).toBeNull();
});

it("shows a photo beside the introduction that opens full size", () => {
  const event = smTdnYogyakarta();
  event.about_image = { url: "https://example.test/tugu.webp", alt: "Tugu Yogyakarta saat senja", srcset: [] };
  render(<EventExperience event={event} preview />);
  const about = document.getElementById("about")!;
  expect(within(about).getByRole("button", { name: "Lihat foto penuh: Tugu Yogyakarta saat senja" })).toBeTruthy();
  expect(within(about).getByText(/Melalui Sesarengan Lumampah/)).toBeTruthy();
});
