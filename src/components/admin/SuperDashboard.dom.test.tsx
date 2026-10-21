import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { EventList } from "./EventList";
import { SuperDashboard, type SuperEventRow } from "./SuperDashboard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
const row = (n: number, title: string): SuperEventRow => ({ ...createSeedEvent(), id: `9c1d0000-0000-4000-8000-00000000000${n}`, slug: `acara-${n}`, title });
const events = [row(1, "Gala Dinner 2026"), row(2, "Nyadran Tim"), row(3, "Kunjungan Mitra")];
let bodies: { ids: string[]; hidden: boolean }[] = [];
beforeEach(() => {
  bodies = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    bodies.push(body);
    return new Response(JSON.stringify({ ok: true, data: body, message: body.hidden ? `${body.ids.length} acara disembunyikan dari admin biasa.` : `${body.ids.length} acara kembali terlihat oleh admin biasa.` }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("counts, searches, and filters events by visibility", () => {
  render(<SuperDashboard events={events} initialHidden={[events[1].id]} migrated />);
  const stats = screen.getByRole("list", { name: "Ringkasan" });
  expect(within(stats).getAllByRole("listitem").map(item => item.textContent)).toEqual(["3Total acara", "2Terlihat oleh admin", "1Disembunyikan"]);
  fireEvent.click(screen.getByRole("button", { name: /^Disembunyikan/ }));
  expect(screen.getAllByRole("link").map(link => link.textContent)).toContain("Nyadran Tim");
  expect(screen.queryByText("Gala Dinner 2026")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Semua/ }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Cari acara" }), { target: { value: "gala" } });
  expect(screen.getAllByRole("row")).toHaveLength(2);
});

it("hides one event with its switch", async () => {
  render(<SuperDashboard events={events} initialHidden={[]} migrated />);
  const toggle = screen.getByRole("switch", { name: "Terlihat oleh admin: Gala Dinner 2026" }) as HTMLInputElement;
  expect(toggle.checked).toBe(true);
  fireEvent.click(toggle);
  expect(await screen.findByText("1 acara disembunyikan dari admin biasa.")).toBeTruthy();
  expect(bodies).toEqual([{ ids: [events[0].id], hidden: true }]);
  expect(toggle.checked).toBe(false);
});

it("hides and shows several selected events at once", async () => {
  render(<SuperDashboard events={events} initialHidden={[]} migrated />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Pilih Gala Dinner 2026" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Pilih Kunjungan Mitra" }));
  const bulk = screen.getByRole("region", { name: "Aksi untuk acara terpilih" });
  expect(bulk.textContent).toContain("2 acara dipilih");
  fireEvent.click(within(bulk).getByRole("button", { name: /Sembunyikan/ }));
  expect(await screen.findByText("2 acara disembunyikan dari admin biasa.")).toBeTruthy();
  expect(bodies[0]).toEqual({ ids: [events[0].id, events[2].id], hidden: true });
  expect(screen.queryByRole("region", { name: "Aksi untuk acara terpilih" })).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: "Pilih semua yang tampil" }));
  fireEvent.click(within(screen.getByRole("region", { name: "Aksi untuk acara terpilih" })).getByRole("button", { name: /Tampilkan/ }));
  expect(await screen.findByText("3 acara kembali terlihat oleh admin biasa.")).toBeTruthy();
});

it("waits for the migration before allowing changes", () => {
  render(<SuperDashboard events={events} initialHidden={[]} migrated={false} />);
  expect(screen.getByText(/menunggu migrasi/)).toBeTruthy();
  expect((screen.getAllByRole("switch")[0] as HTMLInputElement).disabled).toBe(true);
  expect(screen.queryByRole("checkbox", { name: /Pilih/ })).toBeNull();
});

it("only labels hidden events in the regular panel", () => {
  const event = { ...createSeedEvent(), status: "draft" as const };
  const { unmount } = render(<EventList events={[event]} featuredId={null} />);
  expect(screen.queryByText("Tersembunyi")).toBeNull();
  unmount();
  render(<EventList events={[event]} featuredId={null} superAdmin={{ hiddenIds: [event.id], migrated: true }} />);
  expect(screen.getByText("Tersembunyi")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Sembunyikan/ })).toBeNull();
});
