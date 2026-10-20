import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { EventList } from "./EventList";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
const event = { ...createSeedEvent(), status: "draft" as const };
beforeEach(() => {
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const { hidden } = JSON.parse(init.body as string);
    return new Response(JSON.stringify({ ok: true, data: { hidden }, message: "OK" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("gives regular admins no hide control", () => {
  render(<EventList events={[event]} featuredId={null} />);
  expect(screen.queryByRole("button", { name: /Sembunyikan dari admin/ })).toBeNull();
});

it("lets the super admin hide and show an event for regular admins", async () => {
  render(<EventList events={[event]} featuredId={null} superAdmin={{ hiddenIds: [], migrated: true }} />);
  const card = screen.getByRole("listitem");
  fireEvent.click(within(card).getByRole("button", { name: /Sembunyikan dari admin/ }));
  expect(await within(card).findByText("Tersembunyi dari admin")).toBeTruthy();
  const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(url).toBe(`/api/admin/events/${event.id}/visibility`);
  expect(JSON.parse(init.body)).toEqual({ hidden: true });
  fireEvent.click(within(card).getByRole("button", { name: /Tampilkan ke admin/ }));
  await vi.waitFor(() => expect(within(card).queryByText("Tersembunyi dari admin")).toBeNull());
});

it("explains that hiding waits for the migration", () => {
  render(<EventList events={[event]} featuredId={null} superAdmin={{ hiddenIds: [], migrated: false }} />);
  expect(screen.getByText(/menunggu migrasi 202610200005/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Sembunyikan dari admin/ })).toBeNull();
});
