import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { GalleryPhoto } from "@/lib/gallery";
import { createSeedEvent } from "@/lib/seed-event";
import { GalleryManager } from "@/components/admin/gallery/GalleryManager";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const event = createSeedEvent();
const photo = (n: number, status: GalleryPhoto["status"]): GalleryPhoto => ({
  id: `9a000000-0000-4000-8000-00000000000${n}`, status, width: 400, height: 300, caption: "", alt: "", sort_order: n,
  created_at: "2026-11-04T00:00:00Z", original_bytes: 1000, thumb_url: `https://r2.example/t${n}`, large_url: `https://r2.example/l${n}`,
});

it("explains what to set up while R2 is missing, and offers no upload", () => {
  render(<GalleryManager event={event} initial={[]} configured={false} migrated={false} />);
  expect(screen.getByText("Penyimpanan foto belum disiapkan.")).toBeTruthy();
  expect(screen.getByText("R2_BUCKET")).toBeTruthy();
  expect(screen.queryByText("Pilih foto")).toBeNull();
});

it("asks for the migration once R2 is set", () => {
  render(<GalleryManager event={event} initial={[]} configured migrated={false} />);
  expect(screen.getByText(/202610210002_gallery_photos.sql/)).toBeTruthy();
});

it("reviews photos: filters, and publishes the ones waiting", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) =>
    new Response(JSON.stringify({ ok: true, data: { ...photo(1, "ready"), ...JSON.parse(String(init?.body)) }, message: "Foto diperbarui." }), { status: 200 }));
  render(<GalleryManager event={event} initial={[photo(1, "pending"), photo(2, "ready"), photo(3, "uploading")]} configured migrated />);
  expect(screen.getByRole("button", { name: "Semua (2)" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Menunggu tinjauan (1)" }));
  expect(screen.getAllByRole("img")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: /Tayangkan 1 foto yang menunggu/ }));
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(`/api/admin/events/${event.id}/gallery/${photo(1, "pending").id}`);
  expect(init.method).toBe("PATCH");
  expect(JSON.parse(String(init.body))).toEqual({ status: "ready" });
});
