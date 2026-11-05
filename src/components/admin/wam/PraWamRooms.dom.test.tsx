import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Room } from "@/lib/pra-wam/appraisal";
import type { AppSettings } from "@/lib/server/pra-wam/rooms";

const request = vi.fn();
vi.mock("@/components/admin/shared/api", async importOriginal => ({ ...(await importOriginal<object>()), adminRequest: (...args: unknown[]) => request(...args) }));
// The plan itself is another component's business (and heavy in jsdom): a spot button is enough.
vi.mock("@/components/pra-wam/FloorPlan", () => ({
  FloorPlan: ({ onPickSpot, selectedSpot }: { onPickSpot: (key: string) => void; selectedSpot?: string }) =>
    <button type="button" data-selected={selectedSpot} onClick={() => onPickSpot("nagapadma")}>Spot Nagapadma</button>,
}));
const { PraWamRooms, capacityLine, roomGroup } = await import("./PraWamRooms");

beforeAll(() => {
  // jsdom has no modal dialogs; enough of one for the editor.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});
afterEach(() => { cleanup(); request.mockReset(); });

const room = (over: Partial<Room>): Room => ({ id: over.slug ?? "x", slug: "x", name: "X", kind: "utama", capacity: null, bookable: true, minPeople: null, planKey: null, facilities: [], ...over });
const rooms = [
  room({ id: "1", slug: "nagapadma", name: "Nagapadma", capacity: 8, facilities: ["TV", "Whiteboard"] }),
  room({ id: "2", slug: "cfc-ananta", name: "CFC Ananta Room", capacity: 4, minPeople: 1 }),
  room({ id: "3", slug: "pantry", name: "Pantry", kind: "area", bookable: false }),
];
const settings: AppSettings = { migrated: true, floorPlan: true };

it("sorts rooms into main, small and area, and says the capacity", () => {
  expect(rooms.map(roomGroup)).toEqual(["utama", "kecil", "area"]);
  expect(roomGroup({ kind: "utama", capacity: null })).toBe("utama");
  expect(capacityLine(rooms[0])).toEqual({ text: "Maks 8 orang", empty: false });
  expect(capacityLine(rooms[1])).toEqual({ text: "Maks 4 · min 1", empty: false });
  expect(capacityLine(rooms[2])).toEqual({ text: "Kapasitas belum diisi", empty: true });
});

it("lists every room as a card, finds one by facility, and switches bookable with the rest unchanged", async () => {
  request.mockResolvedValue({ message: "Tersimpan.", data: rooms.map(item => item.id === "3" ? { ...item, bookable: true } : item) });
  render(<PraWamRooms initialRooms={rooms} initialSettings={settings} roomsReady />);
  expect(screen.getByRole("heading", { name: "3 ruang" })).toBeTruthy();
  expect(screen.getByText("2 bisa dibooking")).toBeTruthy();
  const pantry = screen.getByRole("article", { name: "Pantry" });
  expect(within(pantry).getByText("Kapasitas belum diisi")).toBeTruthy();
  expect(within(pantry).getByText("Area")).toBeTruthy();
  expect(within(screen.getByRole("article", { name: "CFC Ananta Room" })).getByText("Kecil")).toBeTruthy();

  fireEvent.change(screen.getByRole("searchbox", { name: "Cari ruang atau fasilitas" }), { target: { value: "whiteboard" } });
  expect(screen.getAllByRole("article").map(card => card.getAttribute("aria-label"))).toEqual(["Nagapadma"]);
  fireEvent.change(screen.getByRole("searchbox", { name: "Cari ruang atau fasilitas" }), { target: { value: "" } });

  fireEvent.click(screen.getByRole("switch", { name: "Pantry bisa dibooking" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const [url, init] = request.mock.calls[0] as [string, { body: string }];
  expect(url).toContain("/3");
  expect(JSON.parse(init.body)).toEqual({ capacity: null, minPeople: null, bookable: true, planKey: null, facilities: [] });
  expect(await screen.findByText("Pantry bisa dibooking.")).toBeTruthy();
  expect((screen.getByRole("switch", { name: "Pantry bisa dibooking" }) as HTMLInputElement).checked).toBe(true);
});

it("opens the full editor from a card and steps the capacity", async () => {
  request.mockResolvedValue({ message: "Tersimpan.", data: rooms });
  render(<PraWamRooms initialRooms={rooms} initialSettings={settings} roomsReady />);
  fireEvent.click(screen.getByRole("button", { name: "Ubah Nagapadma" }));
  const dialog = screen.getByRole("dialog", { name: "Nagapadma" });
  const field = within(dialog).getByLabelText("Kapasitas (maks orang)") as HTMLInputElement;
  expect(field.value).toBe("8");
  fireEvent.click(within(dialog).getByRole("button", { name: "Tambah kapasitas" }));
  expect(field.value).toBe("9");
  fireEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(JSON.parse((request.mock.calls[0][1] as { body: string }).body)).toMatchObject({ capacity: 9, facilities: ["TV", "Whiteboard"], bookable: true });
});

it("on Denah lists the rooms per kind, opens one from the plan, and holds the Book plan switch", () => {
  render(<PraWamRooms initialRooms={rooms} initialSettings={settings} roomsReady view="denah" />);
  const list = () => screen.getByRole("list", { name: /Ruang utama|Ruang kecil|Area/ });
  expect(within(list()).getAllByRole("button").map(button => button.textContent)).toEqual([expect.stringContaining("Nagapadma")]);
  fireEvent.click(screen.getByRole("button", { name: "Ruang kecil" }));
  expect(within(list()).getByRole("button", { name: /CFC Ananta Room/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Spot Nagapadma" }));
  expect(screen.getByRole("button", { name: "Ruang utama" }).getAttribute("aria-pressed")).toBe("true");
  expect(within(list()).getByRole("button", { name: /Nagapadma/ }).getAttribute("aria-pressed")).toBe("true");
  expect((screen.getByLabelText("Kapasitas (maks orang)") as HTMLInputElement).value).toBe("8");
  expect((screen.getByRole("switch", { name: "Tampilkan denah di Book" }) as HTMLInputElement).checked).toBe(true);
});
