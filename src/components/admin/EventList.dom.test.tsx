import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { EventList } from "./EventList";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const first = { ...createSeedEvent(), status: "published" as const, title: "Acara A" };
const second = { ...createSeedEvent(), id: "10f3a511-2331-4000-8000-000000000002", status: "published" as const, title: "Acara B", slug: "acara-b" };

beforeEach(() => {
  refresh.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { eventId: second.id }, message: "Acara tayang." }), { status: 200, headers: { "Content-Type": "application/json" } })));
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("marks only the selected event and offers a switch on other public events", () => {
  render(<EventList events={[first, second]} featuredId={first.id} />);
  expect(screen.getAllByText("Tayang di halaman utama")).toHaveLength(1);
  expect(screen.getAllByText("Publik via tautan")).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "Tayangkan" })).toHaveLength(1);
});

it("confirms before changing the homepage without changing either event status", async () => {
  const { rerender } = render(<EventList events={[first, second]} featuredId={first.id} />);
  vi.stubGlobal("confirm", vi.fn(() => false));
  fireEvent.click(screen.getByRole("button", { name: "Tayangkan" }));
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.stubGlobal("confirm", vi.fn(() => true));
  fireEvent.click(screen.getByRole("button", { name: "Tayangkan" }));
  await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
  const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(url).toBe("/api/admin/featured");
  expect(JSON.parse(init.body)).toEqual({ eventId: second.id });
  expect(globalThis.confirm).toHaveBeenCalledWith(expect.stringContaining("Tautan acara lama tetap aktif"));
  await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  rerender(<EventList events={[first, second]} featuredId={second.id} />);
  expect(screen.getAllByText("Tayang di halaman utama")).toHaveLength(1);
  expect(first.status).toBe("published");
  expect(second.status).toBe("published");
});
