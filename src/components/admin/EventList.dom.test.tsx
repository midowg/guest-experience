import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { EventList } from "./EventList";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

const first = { ...createSeedEvent(), status: "published" as const, title: "Acara A" };
const second = { ...createSeedEvent(), id: "10f3a511-2331-4000-8000-000000000002", status: "published" as const, title: "Acara B", slug: "acara-b" };
const draft = { ...createSeedEvent(), id: "10f3a511-2331-4000-8000-000000000003", status: "draft" as const, title: "Acara Draf", slug: "acara-draf" };
const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const card = (title: string) => screen.getByRole("link", { name: title }).closest("li")!;
const menu = (title: string) => within(card(title)).getByRole("group", { name: `Aksi lain untuk ${title}` });

beforeEach(() => {
  refresh.mockClear(); push.mockClear();
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => reply({ ok: true, data: JSON.parse(init.body as string), message: "Tersimpan." })));
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows each event as status, title, and date only", () => {
  render(<EventList events={[first, draft]} featuredId={null} />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Acara 2");
  const item = card("Acara Draf");
  expect(within(item).getByText("Draf")).toBeTruthy();
  expect(within(item).getByText(/Senin, 12 Oktober 2026 · 18\.00 WIB/)).toBeTruthy();
  expect(within(item).getByRole("link", { name: "Buka" }).getAttribute("href")).toBe(`/admin/events/${draft.id}`);
  for (const gone of [/\/e\/acara-draf/, /Terakhir disimpan/, /Eksternal|Internal/, /Werkudara$/]) expect(within(item).queryByText(gone)).toBeNull();
});

it("offers an empty-state button when there are no events", () => {
  render(<EventList events={[]} featuredId={null} />);
  expect(screen.getByRole("button", { name: /Buat acara pertama/ })).toBeTruthy();
});

it("keeps rarer actions in the card menu, depending on the event", () => {
  render(<EventList events={[first, second, draft]} featuredId={first.id} />);
  expect(within(card("Acara A")).getByText("Di halaman utama")).toBeTruthy();
  expect(within(menu("Acara A")).getByRole("button", { name: /Turunkan dari halaman utama/ })).toBeTruthy();
  expect(within(menu("Acara B")).getByRole("button", { name: /Tayangkan di halaman utama/ })).toBeTruthy();
  expect(within(menu("Acara Draf")).queryByRole("button", { name: /halaman utama/ })).toBeNull();
  expect(within(menu("Acara Draf")).queryByRole("link", { name: /Lihat undangan/ })).toBeNull();
  expect(within(menu("Acara B")).getByRole("link", { name: /Lihat undangan/ }).getAttribute("href")).toBe("/e/acara-b");
});

it("confirms before changing the homepage and then marks the new event", async () => {
  render(<EventList events={[first, second]} featuredId={first.id} />);
  vi.stubGlobal("confirm", vi.fn(() => false));
  fireEvent.click(within(menu("Acara B")).getByRole("button", { name: /Tayangkan di halaman utama/ }));
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.stubGlobal("confirm", vi.fn(() => true));
  fireEvent.click(within(menu("Acara B")).getByRole("button", { name: /Tayangkan di halaman utama/ }));
  await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(url).toBe("/api/admin/featured");
  expect(JSON.parse(init.body)).toEqual({ eventId: second.id });
  expect(globalThis.confirm).toHaveBeenCalledWith(expect.stringContaining("Tautan acara lama tetap aktif"));
  expect(within(card("Acara B")).getByText("Di halaman utama")).toBeTruthy();
  expect(within(card("Acara A")).queryByText("Di halaman utama")).toBeNull();
});

it("takes the event off the homepage, and reports a refusal instead of claiming success", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => reply({ ok: false, message: "Sesi berakhir." }, 403)));
  render(<EventList events={[first]} featuredId={first.id} />);
  fireEvent.click(within(menu("Acara A")).getByRole("button", { name: /Turunkan dari halaman utama/ }));
  expect(await screen.findByText(/Sesi berakhir/)).toBeTruthy();
  expect(within(card("Acara A")).getByText("Di halaman utama")).toBeTruthy();
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => reply({ ok: true, data: JSON.parse(init.body as string), message: "Halaman utama tidak menayangkan acara." })));
  fireEvent.click(within(menu("Acara A")).getByRole("button", { name: /Turunkan dari halaman utama/ }));
  expect(await screen.findByText("Halaman utama tidak menayangkan acara.")).toBeTruthy();
  expect(JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toEqual({ eventId: null });
  expect(within(card("Acara A")).queryByText("Di halaman utama")).toBeNull();
});

it("duplicates an event into a new draft and opens it", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => reply({ ok: true, data: { ...draft, id: "10f3a511-2331-4000-8000-000000000009" }, message: "Draft acara dibuat." })));
  render(<EventList events={[first]} featuredId={null} />);
  fireEvent.click(within(menu("Acara A")).getByRole("button", { name: /Duplikasi/ }));
  await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/admin/events/10f3a511-2331-4000-8000-000000000009"));
});

it("closes an open card menu on a click elsewhere or Escape", () => {
  render(<EventList events={[first]} featuredId={null} />);
  const details = menu("Acara A").closest("details")!;
  details.open = true;
  fireEvent.click(document.body);
  expect(details.open).toBe(false);
  details.open = true;
  fireEvent.keyDown(document, { key: "Escape" });
  expect(details.open).toBe(false);
});
