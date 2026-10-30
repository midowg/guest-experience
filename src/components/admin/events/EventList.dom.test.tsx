import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { EventList } from "@/components/admin/events/EventList";

const refresh = vi.fn();
const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push, replace }) }));

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
  expect(within(item).getByRole("link", { name: "Buka" }).getAttribute("href")).toBe(`/admin/acara/${draft.id}`);
  // The page preview above the card is a picture of the guest page (it shows the place); the card's own text stays short.
  item.querySelector("[aria-hidden='true']")?.closest("a")?.remove();
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
  // The front page features no event any more: nothing new can be put on it.
  expect(within(menu("Acara B")).queryByRole("button", { name: /Tayangkan di halaman utama/ })).toBeNull();
  expect(within(menu("Acara Draf")).queryByRole("button", { name: /halaman utama/ })).toBeNull();
  expect(within(menu("Acara Draf")).queryByRole("link", { name: /Lihat undangan/ })).toBeNull();
  expect(within(menu("Acara B")).getByRole("link", { name: /Lihat undangan/ }).getAttribute("href")).toBe("/e/acara-b");
});

it("asks before taking an event off the front page", () => {
  render(<EventList events={[first]} featuredId={first.id} />);
  vi.stubGlobal("confirm", vi.fn(() => false));
  fireEvent.click(within(menu("Acara A")).getByRole("button", { name: /Turunkan dari halaman utama/ }));
  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(within(card("Acara A")).getByText("Di halaman utama")).toBeTruthy();
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
  await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/admin/acara/10f3a511-2331-4000-8000-000000000009"));
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

it("groups the events as Tayang, Draf and a folded Arsip, today's and coming ones first", () => {
  const done = { ...second, id: "10f3a511-2331-4000-8000-000000000004", title: "Acara Selesai", slug: "acara-selesai" };
  const archived = { ...createSeedEvent(), id: "10f3a511-2331-4000-8000-000000000005", status: "archived" as const, title: "Acara Lama", slug: "acara-lama" };
  render(<EventList events={[done, draft, archived, first]} featuredId={null} phases={{ [done.id]: "after", [first.id]: "day" }} />);
  const live = screen.getByRole("region", { name: /^Tayang/ });
  expect(within(live).getAllByRole("heading", { level: 2 }).slice(1).map(heading => heading.textContent)).toEqual(["Acara A", "Acara Selesai"]);
  expect(within(screen.getByRole("region", { name: /^Draf/ })).getByRole("link", { name: "Acara Draf" })).toBeTruthy();
  const archive = card("Acara Lama").closest("details")!;
  expect(archive.open).toBe(false);
  expect(archive.querySelector("summary")?.textContent).toBe("Arsip 1");
});

it("deletes from the card menu only after the event's code is typed", async () => {
  const coded = { ...second, code: "AB23CD" };
  vi.stubGlobal("fetch", vi.fn(async () => reply({ ok: true, message: "Acara dihapus." })));
  render(<EventList events={[first, coded]} featuredId={null} />);
  fireEvent.click(within(menu("Acara B")).getByRole("button", { name: "Hapus" }));
  const dialog = screen.getByRole("dialog", { name: "Acara B" });
  const remove = within(dialog).getByRole("button", { name: /Hapus permanen/ }) as HTMLButtonElement;
  expect(remove.disabled).toBe(true);
  fireEvent.change(within(dialog).getByRole("textbox", { name: /Ketik AB23CD/ }), { target: { value: "ab23cd" } });
  expect(remove.disabled).toBe(false);
  fireEvent.click(remove);
  await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/admin"));
  const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(url).toBe(`/api/admin/events/${coded.id}`);
  expect(init.method).toBe("DELETE");
});

it("closes the delete confirmation with Batal without deleting", () => {
  render(<EventList events={[first]} featuredId={null} />);
  fireEvent.click(within(menu("Acara A")).getByRole("button", { name: "Hapus" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Batal" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
