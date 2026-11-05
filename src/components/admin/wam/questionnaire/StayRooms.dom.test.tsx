import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { StayBoard } from "@/lib/server/pra-wam/stay";
import { StayRooms } from "./StayRooms";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);

const card = (id: string, name: string, gender: string | null, facts: string[] = []) => ({ id, name, department: "Comms", gender, facts });
const board: StayBoard = {
  migrated: true, publishedAt: null, unanswered: 3,
  rooms: [
    { id: "r1", name: "208", kind: "Twin bed", capacity: 2, reviewed: true, people: [card("p1", "Nadia Putri", "Perempuan"), card("p2", "Maya Pratama", "Perempuan")], blocked: [], notes: [] },
    { id: "r2", name: "209", kind: "Twin bed", capacity: 2, reviewed: false, people: [card("p3", "Budi Santoso", "Laki-laki")], blocked: [], notes: ["AC: Budi dingin sekali, Andi tidak terlalu dingin."] },
    { id: "r3", name: "210", kind: "", capacity: 3, reviewed: false, people: [], blocked: [], notes: [] },
  ],
  waiting: [card("p4", "Sari Wulan", "Perempuan", ["Tidur 22.00–24.00", "Ingin sekamar: Nadia Putri"])],
};

it("shows each room like the K3 board, and who still waits", () => {
  render(<StayRooms board={board} />);
  expect(screen.getByText(/2 dari 3 kamar terisi · 3 dari 7 kasur · 1 orang menunggu kamar · 3 belum mengisi bagian menginap/)).toBeTruthy();
  expect(screen.getByText("Penuh 2/2")).toBeTruthy();
  expect(screen.getByText("Sisa 1 · 1/2")).toBeTruthy();
  expect(screen.getByText("Kosong · 0/3")).toBeTruthy();
  expect(screen.getByText("1 peserta belum mendapat kamar")).toBeTruthy();
  expect(screen.getByText("Ingin sekamar: Nadia Putri")).toBeTruthy();
  expect(screen.getByText("AC: Budi dingin sekali, Andi tidak terlalu dingin.")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Terbitkan ke peserta/ })).toBeTruthy();
});

it("offers only rooms with a free bed for the same group", () => {
  render(<StayRooms board={board} />);
  const options = within(screen.getByLabelText("Masukkan Sari Wulan ke kamar")).getAllByRole("option").slice(1);
  expect(options.map(option => [option.textContent, (option as HTMLOptionElement).disabled])).toEqual([
    ["Kamar 208 (penuh)", true],
    ["Kamar 209 (laki-laki)", true],
    ["Kamar 210 (sisa 3)", false],
  ]);
});
