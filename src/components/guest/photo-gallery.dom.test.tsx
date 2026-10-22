import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { GalleryPhoto } from "@/lib/gallery";
import { createSeedEvent } from "@/lib/seed-event";
import { PhotoGallery } from "./PhotoGallery";

afterEach(cleanup);
const photo = (n: number, caption = ""): GalleryPhoto => ({
  id: `9a000000-0000-4000-8000-00000000000${n}`, status: "ready", width: 400, height: 300, caption, alt: "", sort_order: n,
  created_at: "2026-11-04T00:00:00Z", original_bytes: 1000, thumb_url: `https://r2.example/t${n}`, large_url: `https://r2.example/l${n}`,
});
const event = { ...createSeedEvent(), slug: "trip-lombok", contact: { ...createSeedEvent().contact, phone: "0812 3456 7890" } };

it("shows ready photos and opens one larger with its original and a removal request", () => {
  render(<PhotoGallery event={event} photos={[photo(1, "Makan malam"), photo(2)]} closed={false} />);
  expect(screen.getByRole("heading", { name: "Galeri foto acara" })).toBeTruthy();
  expect(screen.getByText("2 foto")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Foto 1: Makan malam" }));
  const viewer = screen.getByRole("dialog", { name: "Foto 1" });
  expect(within(viewer).getByRole("img", { name: "Makan malam" }).getAttribute("src")).toBe("https://r2.example/l1");
  expect(within(viewer).getByRole("link", { name: /Unduh foto asli/ }).getAttribute("href")).toBe(`/e/trip-lombok/galeri/${photo(1).id}/unduh`);
  const removal = within(viewer).getByRole("link", { name: /Minta foto ini dihapus/ }).getAttribute("href")!;
  expect(removal.startsWith("https://wa.me/6281234567890?text=")).toBe(true);
  expect(decodeURIComponent(removal)).toContain("foto nomor 1");
  fireEvent.click(within(viewer).getByRole("button", { name: "Foto berikutnya" }));
  expect(screen.getByRole("dialog", { name: "Foto 2" })).toBeTruthy();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("says when photos are not ready yet, and when the gallery has closed", () => {
  const { unmount } = render(<PhotoGallery event={event} photos={[]} closed={false} />);
  expect(screen.getByText(/sedang kami pilih/)).toBeTruthy();
  unmount();
  render(<PhotoGallery event={event} photos={[photo(1)]} closed />);
  expect(screen.getByText(/sudah ditutup/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Foto 1/ })).toBeNull();
});

it("links the gallery from the page after the event when photos are up", async () => {
  const { EventExperience } = await import("./EventExperience");
  const { unmount } = render(<EventExperience event={event} phase="after" photoCount={3} preview />);
  expect(screen.getByRole("link", { name: /Lihat dan unduh semua foto · 3 foto/ }).getAttribute("href")).toBe("/e/trip-lombok/galeri");
  unmount();
  render(<EventExperience event={event} phase="after" preview />);
  expect(screen.queryByRole("link", { name: /Lihat dan unduh semua foto/ })).toBeNull();
});
