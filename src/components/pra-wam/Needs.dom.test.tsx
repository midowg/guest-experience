import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { readsNeeds } from "@/lib/pra-wam/roles";
import { NeedsList } from "./Needs";

afterEach(cleanup);

it("shows who needs what, how many only HR reads, and nothing for an empty block", () => {
  render(<NeedsList blocks={[
    { key: "14", title: "Makanan", purpose: "Untuk panitia konsumsi.", prompt: "Ada kebutuhan makanan?", hrOnly: 0, hrQuestion: false, entries: [], groups: [
      { label: "Tidak ada", people: [], unnamed: 40, countOnly: true },
      { label: "Vegetarian", people: [{ id: "p1", name: "Ayu", department: "Comms" }], unnamed: 2, countOnly: false },
      { label: "Vegan", people: [], unnamed: 0, countOnly: false },
    ] },
    { key: "14b", title: "Alergi", purpose: "Untuk panitia konsumsi dan acara.", prompt: "Ada alergi?", hrOnly: 1, hrQuestion: false, groups: [],
      entries: [{ person: { id: "p2", name: "Budi", department: "" }, text: "Alergi udang" }] },
    { key: "15", title: "Ibadah", purpose: "Untuk ibadah.", prompt: "Ada kebutuhan ibadah?", hrOnly: 3, hrQuestion: true, groups: [], entries: [] },
    { key: "35", title: "Kesiapan", purpose: "Untuk keamanan.", prompt: "Seberapa siap?", hrOnly: 0, hrQuestion: false, groups: [], entries: [] },
  ]} />);
  const food = screen.getByRole("region", { name: "Makanan" });
  expect(within(food).getByText("40 orang")).toBeTruthy();
  expect(within(food).getByText("Ayu (Comms)")).toBeTruthy();
  expect(within(food).getByText("+ 2 orang tanpa nama (jawaban hanya dibaca HR).")).toBeTruthy();
  expect(within(food).queryByText("Vegan")).toBeNull();
  expect(screen.getByText("Alergi udang")).toBeTruthy();
  expect(screen.getByText(/1 jawaban lain hanya dibaca HR, karena diisi saat pertanyaan ini masih berlabel/)).toBeTruthy();
  expect(screen.getByText(/3 orang mengisi. Isinya hanya dibaca HR/)).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "Kesiapan" })).getByText("Belum ada jawaban.")).toBeTruthy();
});

it("opens to panitia and admin, not to BOD or a participant", () => {
  expect(readsNeeds({ roles: ["panitia"] })).toBe(true);
  expect(readsNeeds({ roles: ["admin"] })).toBe(true);
  expect(readsNeeds({ roles: ["bod"] })).toBe(false);
  expect(readsNeeds({ roles: [] })).toBe(false);
});
