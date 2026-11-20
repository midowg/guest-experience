import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AdminGrants, findPeople, type GrantPersonView } from "./AdminGrants";

const person = (id: string, name: string, nickname: string, department: string, patch: Partial<GrantPersonView> = {}): GrantPersonView =>
  ({ id, name, nickname, department, category: "karyawan", hasAccount: true, picOf: 0, ...patch });
const people = [
  person("p1", "Dewi Lestari", "Dewi", "Center of Excellence"),
  person("p2", "Rahmad Setyo Wicaksono", "Tyo", "Human Resources & General Affair"),
  person("p3", "Shaira Kamila", "Rara", "", { category: "intern" }),
  person("p4", "Orang Tanpa Akun", "", "Accounting", { hasAccount: false }),
];
afterEach(cleanup);

describe("findPeople", () => {
  it("finds by name, nama panggilan, department or status, every word typed", () => {
    expect(findPeople(people, "tyo").map(p => p.id)).toEqual(["p2"]);
    expect(findPeople(people, "excellence").map(p => p.id)).toEqual(["p1"]);
    expect(findPeople(people, "human tyo").map(p => p.id)).toEqual(["p2"]);
    expect(findPeople(people, "intern").map(p => p.id)).toEqual(["p3"]);
    expect(findPeople(people, "  ")).toEqual([]);
  });
});

describe("Akses admin search", () => {
  const show = () => render(<AdminGrants migrated initial={[{ employeeId: "p1", apps: ["wam"], allEvents: false, eventIds: [] }]} people={people} events={[]} />);
  const search = (text: string) => fireEvent.change(screen.getByLabelText("Tambah atau ubah admin"), { target: { value: text } });

  it("shows the nama panggilan and department of each match, and opens the editor from it", () => {
    show();
    search("rara");
    const result = screen.getByRole("button", { name: /Shaira Kamila/ });
    expect(result.textContent).toContain("Panggilan Rara");
    expect(result.textContent).toContain("Intern");
    fireEvent.click(result);
    expect(screen.getByRole("heading", { name: "Akses admin: Shaira Kamila" })).toBeTruthy();
  });

  it("marks who is already an admin, and someone without a WAM account cannot be picked", () => {
    show();
    search("dewi");
    expect(within(screen.getByRole("list")).getByRole("button", { name: /Dewi Lestari/ }).textContent).toContain("Sudah admin");
    search("accounting");
    expect(screen.getByRole("button", { name: /Orang Tanpa Akun/ })).toHaveProperty("disabled", true);
    search("tidak ada siapa pun");
    expect(screen.getByText("Tidak ada orang yang cocok.")).toBeTruthy();
  });

  it("shows the nama panggilan in the table of admins", () => {
    show();
    const row = screen.getByRole("row", { name: /Dewi Lestari/ });
    expect(within(row).getByText(/Panggilan Dewi/)).toBeTruthy();
  });
});

describe("Admin Pra WAM and Admin WAM 2027 (20 Nov 2026): two boxes, given apart", () => {
  const sample = [person("q1", "Sari Contoh", "Sari", "Center of Excellence")];
  const editFor = (wamAcaraMigrated: boolean) => {
    render(<AdminGrants migrated wamAcaraMigrated={wamAcaraMigrated} initial={[{ employeeId: "q1", apps: ["wam"], allEvents: false, eventIds: [] }]} people={sample} events={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ubah akses Sari Contoh" }));
  };

  it("shows each door as its own box, Admin Pra WAM ticked and Admin WAM 2027 not", () => {
    editFor(true);
    expect((screen.getByRole("checkbox", { name: /^Admin Pra WAM/ }) as HTMLInputElement).checked).toBe(true);
    const wamEvent = screen.getByRole("checkbox", { name: /^Admin WAM 2027/ }) as HTMLInputElement;
    expect(wamEvent.checked).toBe(false);
    expect(wamEvent.disabled).toBe(false);
    expect(screen.queryByText(/menunggu migrasi 202611200603/)).toBeNull();
  });

  it("before migration 202611200603: Admin WAM 2027 cannot be given yet, and the page says only the super admin opens it", () => {
    editFor(false);
    const wamEvent = screen.getByRole("checkbox", { name: /^Admin WAM 2027/ }) as HTMLInputElement;
    expect(wamEvent.disabled).toBe(true);
    expect(screen.getByText(/Admin WAM 2027 menunggu migrasi/).textContent).toContain("hanya super admin");
  });
});
