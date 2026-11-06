import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { eventTemplates } from "@/lib/event-templates";
import { EventList } from "@/components/admin/events/EventList";
import { TemplatesAndEvents, type SuperEventRow } from "@/components/admin/super/TemplatesAndEvents";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
const row = (n: number, title: string, patch: Partial<SuperEventRow> = {}): SuperEventRow => ({ ...createSeedEvent(), id: `9c1d0000-0000-4000-8000-00000000000${n}`, slug: `acara-${n}`, title, ...patch });
const events = [row(1, "Gala Dinner 2026", { event_kind: "acara" }), row(2, "Nyadran Tim", { event_kind: "acara" }), row(3, "Kunjungan Mitra", { event_kind: "kunjungan", status: "published" })];
let calls: { url: string; body: Record<string, unknown> }[] = [];
beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ url, body });
    const message = url.endsWith("/templates") ? `${body.enabled.length} templat tersedia untuk admin biasa.` : body.hidden ? `${body.ids.length} acara disembunyikan dari admin biasa.` : `${body.ids.length} acara kembali terlihat oleh admin biasa.`;
    return new Response(JSON.stringify({ ok: true, data: body, message }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const page = (hidden: string[] = [], migrated = true) => render(<TemplatesAndEvents events={events} initialEnabled={["kunjungan-klien", "trip-klien"]} templatesMigrated={migrated} initialHidden={hidden} visibilityMigrated={migrated} />);
const card = (name: string) => screen.getByRole("heading", { level: 2, name }).closest("section")!;

it("groups every template and event under its kind, with what each template holds", () => {
  page();
  for (const template of eventTemplates) expect(screen.getByRole("switch", { name: `${template.label} tampil di Buat acara` })).toBeTruthy();
  const welcome = card("Welcome");
  expect(within(welcome).getByText("Kunjungan Mitra")).toBeTruthy();
  expect(within(welcome).getByText("Tamu luar")).toBeTruthy();
  expect(within(welcome).getByText(/Tentang · Rundown · Lokasi & rute/)).toBeTruthy();
  const acara = card("Acara");
  expect(within(acara).getAllByRole("switch", { name: /tampil di Buat acara/ })).toHaveLength(eventTemplates.filter(template => template.kind === "acara").length);
  expect(within(acara).getByText("Gala Dinner 2026")).toBeTruthy();
});

it("saves a template switch at once, with the whole list of templates", async () => {
  page();
  fireEvent.click(screen.getByRole("switch", { name: "Nyadran tampil di Buat acara" }));
  expect(await screen.findByText(/Nyadran tampil di Buat acara\. 3 templat/)).toBeTruthy();
  expect(calls[0].url).toBe("/api/admin/templates");
  expect((calls[0].body.enabled as string[]).sort()).toEqual(["kunjungan-klien", "nyadran", "trip-klien"]);
});

it("hides one event, or every event of a kind at once", async () => {
  page();
  fireEvent.click(screen.getByRole("switch", { name: "Terlihat oleh admin: Kunjungan Mitra" }));
  expect(await screen.findByText("1 acara disembunyikan dari admin biasa.")).toBeTruthy();
  expect(calls[0].body).toEqual({ ids: [events[2].id], hidden: true });
  fireEvent.click(within(card("Acara")).getByRole("button", { name: /Sembunyikan semua/ }));
  expect(await screen.findByText("2 acara disembunyikan dari admin biasa.")).toBeTruthy();
  expect(calls[1].body.hidden).toBe(true);
  expect((calls[1].body.ids as string[]).sort()).toEqual([events[0].id, events[1].id].sort());
  expect((screen.getByRole("switch", { name: "Terlihat oleh admin: Gala Dinner 2026" }) as HTMLInputElement).checked).toBe(false);
});

it("finds templates and events by name, and narrows to one kind", () => {
  page();
  fireEvent.change(screen.getByRole("searchbox", { name: "Cari templat atau acara" }), { target: { value: "nyadran" } });
  expect(screen.queryByRole("heading", { level: 2, name: "Welcome" })).toBeNull();
  expect(within(card("Acara")).getByText("Nyadran Tim")).toBeTruthy();
  expect(within(card("Acara")).queryByText("Gala Dinner 2026")).toBeNull();
  fireEvent.change(screen.getByRole("searchbox", { name: "Cari templat atau acara" }), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: /^Welcome/ }));
  expect(screen.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent)).toEqual(["Welcome"]);
});

it("waits for the migrations before allowing changes", () => {
  page([], false);
  expect(screen.getAllByText(/menunggu migrasi/)).toHaveLength(2);
  for (const toggle of screen.getAllByRole("switch")) expect((toggle as HTMLInputElement).disabled).toBe(true);
  expect(screen.queryByRole("button", { name: /Sembunyikan semua/ })).toBeNull();
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
