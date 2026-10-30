import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
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
  expect(within(contacts).getByRole("link", { name: "WhatsApp Dimas Wijanarko" }).getAttribute("href")).toBe("https://wa.me/628112546096");
  expect(within(contacts).queryByRole("link", { name: "WhatsApp THE 1O1 Yogyakarta Tugu" })).toBeNull();
  expect(within(contacts).getByText("Rumah Sakit Bethesda Yogyakarta")).toBeTruthy();
  expect(screen.getByRole("navigation", { name: /./ }).textContent).toContain("Transportasi");
});
