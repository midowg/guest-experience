import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { EmployeeDirectory } from "./EmployeeDirectory";
import type { Employee } from "@/lib/employees";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const person: Employee = { id: "6a000000-0000-4000-8000-000000000001", full_name: "Contoh Satu", nickname: "Satu", department: "Sales & Marketing", position: "Business Solutions Manager", office: "WNS", category: "karyawan", phone: "", email: "", active: true, nip: "" };
const row = { full_name: "Contoh Dua", nickname: "Dua", department: "Accounting", position: "Tax Staff", office: "WNS", category: "karyawan" };

it("reads the Excel first, shows who is new or changed, and saves only on request", async () => {
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/parse")) return reply({ ok: true, message: "2 karyawan terbaca dari sheet Data.", data: { sheet: "Data", skipped: [], migrated: true, plan: [
      { row, change: "baru", changed: [] },
      { row: { ...person, position: "Commercial Manager" }, change: "berubah", changed: ["position"] },
    ] } });
    if (init.method === "POST") return reply({ ok: true, message: "1 karyawan baru, 1 diperbarui, 0 tetap.", data: { added: 1, updated: 1, unchanged: 0 } });
    return reply({ ok: true, message: "", data: { employees: [person, { ...person, id: "6a000000-0000-4000-8000-000000000002", full_name: "Contoh Dua" }] } });
  });
  vi.stubGlobal("fetch", fetch);
  render(<EmployeeDirectory initial={[person]} migrated />);
  const input = screen.getByLabelText("Berkas Excel (.xlsx)") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "karyawan.xlsx")] } });
  fireEvent.click(screen.getByRole("button", { name: /Baca berkas/ }));
  expect(await screen.findByText(/1 baru, 1 diperbarui, 0 tetap/)).toBeTruthy();
  // The upload goes as a form, not as JSON.
  const [, parseInit] = fetch.mock.calls[0];
  expect(parseInit.body).toBeInstanceOf(FormData);
  expect(new Headers(parseInit.headers).get("Content-Type")).toBeNull();
  const preview = screen.getByRole("table", { name: "Pratinjau impor" });
  expect(within(preview).getByText("Baru")).toBeTruthy();
  expect(within(preview).getByText("jabatan")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Simpan 2 perubahan" }));
  expect(await screen.findByText("1 karyawan baru, 1 diperbarui, 0 tetap.")).toBeTruthy();
  expect(JSON.parse(fetch.mock.calls[1][1].body as string).rows).toHaveLength(2);
  expect(await screen.findByText("Contoh Dua")).toBeTruthy();
});

it("changes a category or switches someone off from the list", async () => {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => reply({ ok: true, message: "Data karyawan disimpan.", data: { ...person, ...JSON.parse(init.body as string) } }));
  vi.stubGlobal("fetch", fetch);
  render(<EmployeeDirectory initial={[person]} migrated />);
  fireEvent.change(screen.getByLabelText("Kategori Contoh Satu"), { target: { value: "ga" } });
  expect(await screen.findByText("Data karyawan disimpan.")).toBeTruthy();
  expect(fetch.mock.calls[0][0]).toBe(`/api/admin/employees/${person.id}`);
  expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({ category: "ga" });
  expect((screen.getByLabelText("Kategori Contoh Satu") as HTMLSelectElement).value).toBe("ga");
});

it("says the table waits for its migration and keeps saving off", () => {
  render(<EmployeeDirectory initial={[]} migrated={false} />);
  expect(screen.getByText(/menunggu migrasi/)).toBeTruthy();
  expect(screen.getByText(/Belum ada data karyawan/)).toBeTruthy();
});

describe("Akun WAM", () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  const withEmail = { ...person, email: "satu@werkudara.com" };
  const team: Employee[] = [
    withEmail,
    { ...person, id: "6a000000-0000-4000-8000-000000000002", full_name: "Contoh Dua", email: "dua@werkudara.com" },
    { ...person, id: "6a000000-0000-4000-8000-000000000003", full_name: "Contoh Tiga", email: "" },
    { ...person, id: "6a000000-0000-4000-8000-000000000004", full_name: "Contoh Empat", email: "empat@werkudara.com", active: false },
  ];
  const accounts = { migrated: true, passwordReady: true, withAccount: [team[1].id] };
  const rowsAfter = (ids: string[]) => team.map(item => ({ employeeId: item.id, hasAccount: ids.includes(item.id) }));
  const cell = (name: string) => within(screen.getByText(name).closest("tr")!);

  it("shows each person's WAM account and offers Buat akun only to who can have one", () => {
    render(<EmployeeDirectory initial={team} migrated wamAccounts={accounts} />);
    expect(screen.getByRole("columnheader", { name: "Akun WAM" })).toBeTruthy();
    expect(cell("Contoh Satu").getByText("Belum punya akun")).toBeTruthy();
    expect(cell("Contoh Dua").getByText("Punya akun")).toBeTruthy();
    expect(cell("Contoh Tiga").getByText("Tanpa email")).toBeTruthy();
    expect(cell("Contoh Empat").getAllByText("Nonaktif").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /^Buat akun WAM/ }).map(button => button.getAttribute("aria-label"))).toEqual(["Buat akun WAM Contoh Satu"]);
    expect(screen.getByRole("button", { name: "Buat akun untuk 1 karyawan" })).toBeTruthy();
  });

  it("creates one person's account and shows it on their row", async () => {
    const fetch = vi.fn(async () => reply({ ok: true, message: "Akun WAM dibuat.", data: { created: 1, skipped: [], rows: rowsAfter([team[0].id, team[1].id]) } }));
    vi.stubGlobal("fetch", fetch);
    render(<EmployeeDirectory initial={team} migrated wamAccounts={accounts} />);
    fireEvent.click(screen.getByRole("button", { name: "Buat akun WAM Contoh Satu" }));
    expect(await screen.findByText("Akun WAM dibuat.")).toBeTruthy();
    expect(fetch.mock.calls[0]).toEqual([`/api/admin/wam/accounts/${person.id}`, expect.objectContaining({ method: "POST" })]);
    expect(cell("Contoh Satu").getByText("Punya akun")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Semua sudah punya akun" })).toHaveProperty("disabled", true);
  });

  it("asks before creating everyone's account, then lists who was skipped and why", async () => {
    const fetch = vi.fn(async () => reply({ ok: true, message: "1 akun dibuat, 1 dilewati.", data: { created: 1, skipped: ["Contoh Tiga: email masih kosong."], rows: rowsAfter([team[0].id, team[1].id]) } }));
    vi.stubGlobal("fetch", fetch);
    render(<EmployeeDirectory initial={team} migrated wamAccounts={accounts} />);
    fireEvent.click(screen.getByRole("button", { name: "Buat akun untuk 1 karyawan" }));
    const dialog = await screen.findByRole("dialog", { name: "Buat akun WAM untuk 1 karyawan?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Batal" }));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Buat akun untuk 1 karyawan" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Buat akun" }));
    expect(await screen.findByText("1 akun WAM dibuat, 1 dilewati.")).toBeTruthy();
    expect(fetch.mock.calls[0]).toEqual(["/api/admin/wam/accounts", expect.objectContaining({ method: "POST" })]);
    expect(within(screen.getByRole("list", { name: "Dilewati" })).getByText("Contoh Tiga: email masih kosong.")).toBeTruthy();
  });

  it("keeps Buat akun off until the first password is set on the server", () => {
    render(<EmployeeDirectory initial={team} migrated wamAccounts={{ ...accounts, passwordReady: false }} />);
    expect(screen.getByText(/Password awal WAM belum disiapkan/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Buat akun untuk 1 karyawan" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Buat akun WAM Contoh Satu" })).toHaveProperty("disabled", true);
  });
});
