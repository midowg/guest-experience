import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { NeedBlock } from "@/lib/pra-wam/needs";
import { readsNeeds } from "@/lib/pra-wam/roles";
import { needCount } from "./manage/needs-rows";
import { NeedsList } from "./Needs";

afterEach(cleanup);

const blocks: NeedBlock[] = [
  { key: "14", title: "Makanan", purpose: "Untuk panitia konsumsi.", prompt: "Ada kebutuhan makanan?", hrOnly: 0, hrQuestion: false, entries: [], groups: [
    { label: "Tidak ada", people: [], unnamed: 40, countOnly: true },
    { label: "Vegetarian", people: [{ id: "p1", name: "Ayu", department: "Comms" }], unnamed: 2, countOnly: false },
    { label: "Vegan", people: [], unnamed: 0, countOnly: false },
  ] },
  { key: "14b", title: "Alergi", purpose: "Untuk panitia konsumsi dan acara.", prompt: "Ada alergi?", hrOnly: 1, hrQuestion: false, groups: [],
    entries: [{ person: { id: "p2", name: "Budi", department: "" }, text: "Alergi udang" }] },
  { key: "15", title: "Ibadah", purpose: "Untuk ibadah.", prompt: "Ada kebutuhan ibadah?", hrOnly: 3, hrQuestion: true, groups: [], entries: [] },
  { key: "35", title: "Kesiapan", purpose: "Untuk keamanan.", prompt: "Seberapa siap?", hrOnly: 0, hrQuestion: false, groups: [], entries: [] },
];
const rowOf = (text: string) => screen.getByText(text).closest("tr")!;

it("shows who needs what, how many only HR reads, and nothing for an empty block", () => {
  render(<NeedsList blocks={blocks} />);
  expect(within(rowOf("Tidak ada")).getByText("40 orang")).toBeTruthy();
  const vegetarian = rowOf("Vegetarian");
  expect(within(vegetarian).getByText("Ayu (Comms)")).toBeTruthy();
  expect(within(vegetarian).getByText("+ 2 orang tanpa nama (jawaban hanya dibaca HR).")).toBeTruthy();
  expect(screen.queryByText("Vegan")).toBeNull();
  expect(within(rowOf("Alergi udang")).getByText("Budi")).toBeTruthy();
  expect(screen.getByText(/1 jawaban lain hanya dibaca HR, karena diisi saat pertanyaan ini masih berlabel/)).toBeTruthy();
  // An HR question: a count, never a name.
  const hr = screen.getByText(/3 orang mengisi. Isinya hanya dibaca HR/).closest("tr")!;
  expect(within(hr).getByText("Ibadah")).toBeTruthy();
  expect(within(hr).queryByRole("list")).toBeNull();
  expect(within(rowOf("Belum ada jawaban.")).getByText("Kesiapan")).toBeTruthy();
});

it("narrows the table by question and by a name", () => {
  render(<NeedsList blocks={blocks} />);
  fireEvent.click(screen.getByRole("button", { name: "Alergi" }));
  expect(screen.queryByText("Vegetarian")).toBeNull();
  expect(screen.getByText("Alergi udang")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Semua" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Cari kebutuhan atau nama" }), { target: { value: "ayu" } });
  expect(screen.getByText("Vegetarian")).toBeTruthy();
  expect(screen.queryByText("Alergi udang")).toBeNull();
});

it("counts the people to prepare for, without the ones who need nothing", () => {
  expect(needCount(blocks[0])).toBe(3);
  expect(needCount(blocks[1])).toBe(2);
  expect(needCount(blocks[2])).toBe(3);
  expect(needCount(blocks[3])).toBe(0);
});

it("opens to panitia and admin, not to BOD or a participant", () => {
  expect(readsNeeds({ roles: ["panitia"] })).toBe(true);
  expect(readsNeeds({ roles: ["admin"] })).toBe(true);
  expect(readsNeeds({ roles: ["bod"] })).toBe(false);
  expect(readsNeeds({ roles: [] })).toBe(false);
});
