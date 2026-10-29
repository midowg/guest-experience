import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { samplePlaceGuide } from "@/app/dev-preview/panduan/sample";
import { PlaceGuide } from "./PlaceGuide";

// next/font only runs inside Next's compiler.
vi.mock("./place-guide-font", () => ({ garamond: { variable: "" }, jost: { variable: "" } }));

afterEach(() => { cleanup(); window.localStorage.clear(); });

it("shows the welcome, the way here with the host, the gallery and Google Maps", () => {
  render(<PlaceGuide event={samplePlaceGuide()} />);
  expect(screen.getByRole("heading", { level: 1, name: "Your Visit to Werkudara" })).toBeTruthy();
  const steps = screen.getByRole("list", { name: "Langkah menuju lokasi" });
  expect(within(steps).getAllByRole("listitem")).toHaveLength(3);
  expect(screen.getByRole("link", { name: "WhatsApp Contoh Raka (tab baru)" }).getAttribute("href")).toBe("https://wa.me/6281200000001");
  expect(screen.getByRole("link", { name: "BUKA GOOGLE MAPS" }).getAttribute("href")).toBe("https://maps.app.goo.gl/BKkDQWsgH3pFMzeA7");
  expect(within(screen.getByRole("list", { name: "Galeri foto" })).getAllByRole("button")).toHaveLength(5);
  expect(screen.getByRole("link", { name: "LIHAT CARA KE SINI" }).getAttribute("href")).toBe("#getting-here");
  expect(screen.getByText("Beberapa area kantor Werkudara berada di ruang terbuka.")).toBeTruthy();
});

it("switches the guide to English, steps included", () => {
  render(<PlaceGuide event={samplePlaceGuide()} />);
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByText("Take Jl. Pondok Raya")).toBeTruthy();
  expect(screen.getByRole("link", { name: "OPEN GOOGLE MAPS" })).toBeTruthy();
});

it("leaves out the map, steps and gallery when they are empty", () => {
  const event = samplePlaceGuide();
  render(<PlaceGuide event={{ ...event, closing: "", gallery: [], route: { map_image: { url: "", alt: "", srcset: [] }, steps: [], points: [] } }} />);
  expect(screen.queryByRole("button", { name: "Perbesar peta akses" })).toBeNull();
  expect(screen.queryByRole("list", { name: "Langkah menuju lokasi" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Gallery" })).toBeNull();
});

it("keeps the same content in the Resort theme, with the title written on the cover photo", () => {
  const { container } = render(<PlaceGuide event={{ ...samplePlaceGuide(), place_theme: "resort" }} />);
  expect(container.querySelector("[data-theme]")?.getAttribute("data-theme")).toBe("resort");
  const title = screen.getByRole("heading", { level: 1, name: "Your Visit to Werkudara" });
  // The title's block sits right after the cover photo, inside the same frame.
  expect(title.parentElement?.previousElementSibling?.getAttribute("alt")).toBe("Tampak depan Werkudara Office");
  expect(screen.getByRole("link", { name: "Gulir ke sambutan" }).getAttribute("href")).toBe("#welcome-text");
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(within(screen.getByRole("list", { name: "Langkah menuju lokasi" })).getAllByRole("listitem")).toHaveLength(3);
  expect(screen.getByRole("link", { name: "BUKA GOOGLE MAPS" })).toBeTruthy();
});
