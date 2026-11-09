import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { EmployeeDirectory } from "./EmployeeDirectory";
import type { Employee } from "@/lib/employees";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const person: Employee = { id: "6a000000-0000-4000-8000-000000000001", full_name: "Contoh Satu", nickname: "Satu", department: "Sales & Marketing", position: "Business Solutions Manager", office: "WNS", category: "karyawan", phone: "", email: "", active: true, nip: "", business_unit: "WNS" };
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
  render(<EmployeeDirectory initial={[person]} migrated part="impor" />);
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
  // The list (its own tab) is read again after saving.
  await vi.waitFor(() => expect(fetch).toHaveBeenLastCalledWith("/api/admin/employees", expect.anything()));
});

HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

it("lists a person with department and job (HOD, Lead, GA or Intern beside it), one Business Unit, and no WAM column", () => {
  const intern = { ...person, id: "6a000000-0000-4000-8000-000000000009", full_name: "Contoh Magang", category: "intern" as const, business_unit: "MRP" };
  render(<EmployeeDirectory initial={[person, intern]} migrated leads={{ [person.id]: { departments: ["Sales & Marketing", "Corporate"], lead: false }, [intern.id]: { departments: [], lead: true } }}
    leadOptions={{ departments: ["Corporate", "Sales & Marketing"] }} />);
  expect(screen.getAllByRole("columnheader").map(header => header.textContent)).toEqual(["Karyawan", "Departemen & jabatan", "Business Unit", "Kontak", "Status", "Aksi"]);
  const first = within(screen.getByText("Contoh Satu").closest("tr")!);
  expect(first.getByText("Business Solutions Manager · HOD")).toBeTruthy();
  expect(first.getByText("HOD Corporate")).toBeTruthy();
  // No "Lead BU" any more (9 Nov 2026): a person has one BU; a Lead shows beside their job.
  expect(first.queryByText(/Lead BU/)).toBeNull();
  expect(first.getByText("WNS")).toBeTruthy();
  const second = within(screen.getByText("Contoh Magang").closest("tr")!);
  expect(second.getByText(/· Lead$/)).toBeTruthy();
  expect(second.getByText("Intern")).toBeTruthy();
  expect(second.getByText("MRP")).toBeTruthy();
});

it("filters by department and Business Unit, and lists by BU then name", () => {
  const people = [
    { ...person, id: "6a000000-0000-4000-8000-000000000021", full_name: "Zaki", business_unit: "WNS" },
    { ...person, id: "6a000000-0000-4000-8000-000000000022", full_name: "Bayu", business_unit: "TEE", department: "Takshaka Event & Experience" },
    { ...person, id: "6a000000-0000-4000-8000-000000000023", full_name: "Adi", business_unit: "WNS" },
    { ...person, id: "6a000000-0000-4000-8000-000000000024", full_name: "Mira", business_unit: "MRP", department: "Maha Raja Pratama" },
  ];
  render(<EmployeeDirectory initial={people} migrated />);
  const names = () => [...screen.getByRole("table", { name: "Daftar karyawan" }).querySelectorAll("tbody strong:first-child")].map(node => node.textContent).filter(name => ["Zaki", "Bayu", "Adi", "Mira"].includes(name ?? ""));
  expect(names()).toEqual(["Mira", "Adi", "Zaki", "Bayu"]);
  fireEvent.change(screen.getByLabelText("Business Unit"), { target: { value: "WNS" } });
  expect(names()).toEqual(["Adi", "Zaki"]);
  fireEvent.change(screen.getByLabelText("Business Unit"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Departemen"), { target: { value: "Takshaka Event & Experience" } });
  expect(names()).toEqual(["Bayu"]);
});

it("changes a person in one panel, what they head included, and switches someone off from the list", async () => {
  const fetch = vi.fn(async (url: string, init: RequestInit) => url.includes("/wam/accounts/")
    ? reply({ ok: true, message: "HOD dan Lead disimpan.", data: { rows: [] } })
    : reply({ ok: true, message: "Data karyawan disimpan.", data: { ...person, ...JSON.parse(init.body as string) } }));
  vi.stubGlobal("fetch", fetch);
  render(<EmployeeDirectory initial={[person]} migrated leadOptions={{ departments: ["Corporate", "Sales & Marketing"] }} />);
  fireEvent.click(screen.getByRole("button", { name: "Ubah Contoh Satu" }));
  const panel = within(screen.getByRole("dialog", { name: "Ubah karyawan" }));
  fireEvent.click(panel.getByRole("radio", { name: "GA" }));
  fireEvent.change(panel.getByLabelText("Business Unit"), { target: { value: "TEE" } });
  // One Business Unit field (Office is the same code and follows it).
  expect(panel.queryByLabelText("Office")).toBeNull();
  fireEvent.click(panel.getByRole("checkbox", { name: "HOD Sales & Marketing: Contoh Satu" }));
  fireEvent.click(panel.getByRole("button", { name: "Simpan perubahan" }));
  expect(await screen.findByText("Contoh Satu disimpan.")).toBeTruthy();
  expect(fetch.mock.calls[0][0]).toBe(`/api/admin/employees/${person.id}`);
  expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({ category: "ga", business_unit: "TEE", office: "TEE" });
  expect(JSON.parse(fetch.mock.calls[1][1].body as string)).toEqual({ leads: { departments: ["Sales & Marketing"], lead: false } });
  const row = within(screen.getByText("Contoh Satu").closest("tr")!);
  expect(row.getByText("GA")).toBeTruthy();
  expect(row.getByText("TEE")).toBeTruthy();
  fireEvent.click(row.getByRole("switch", { name: "Contoh Satu aktif" }));
  await screen.findAllByText("Data karyawan disimpan.");
  expect(JSON.parse(fetch.mock.calls[2][1].body as string)).toEqual({ active: false });
});

it("sets BOD and Admin WAM in Data karyawan, keeping Panitia as it is; BOD locked for someone heading a department", async () => {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => { void _url; void _init; return reply({ ok: true, message: "Peran dan struktur disimpan.", data: { rows: [] } }); });
  vi.stubGlobal("fetch", fetch);
  const other = { ...person, id: "6a000000-0000-4000-8000-000000000031", full_name: "Kepala Satu" };
  render(<EmployeeDirectory initial={[person, other]} migrated wamAccounts={{ migrated: true, passwordReady: true, withAccount: [], roles: { [person.id]: ["panitia"] } }}
    leads={{ [other.id]: { departments: ["Corporate"], lead: false } }} leadOptions={{ departments: ["Corporate", "Sales & Marketing"] }} />);
  fireEvent.click(screen.getByRole("button", { name: "Ubah Contoh Satu" }));
  let panel = within(screen.getByRole("dialog", { name: "Ubah karyawan" }));
  // A Panitia cannot be BOD; Admin WAM can be added.
  expect(panel.getByRole("checkbox", { name: /^BOD/ })).toHaveProperty("disabled", true);
  fireEvent.click(panel.getByRole("checkbox", { name: /^Admin WAM/ }));
  fireEvent.click(panel.getByRole("button", { name: "Simpan perubahan" }));
  expect(await screen.findByText("Contoh Satu disimpan.")).toBeTruthy();
  expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({ roles: ["panitia", "admin"] });
  fireEvent.click(screen.getByRole("button", { name: "Ubah Kepala Satu" }));
  panel = within(screen.getByRole("dialog", { name: "Ubah karyawan" }));
  expect(panel.getByRole("checkbox", { name: /^BOD/ })).toHaveProperty("disabled", true);
  expect(panel.getByText("BOD terkunci karena orang ini HOD atau Lead.")).toBeTruthy();
});

it("adds a person by hand, and asks before deleting one", async () => {
  const added = { ...person, id: "6a000000-0000-4000-8000-000000000010", full_name: "Orang Baru", department: "Corporate", position: "Staff" };
  const fetch = vi.fn(async (_url: string, init: RequestInit) => init.method === "DELETE"
    ? reply({ ok: true, message: "Karyawan dihapus.", data: null })
    : reply({ ok: true, message: "Orang Baru ditambahkan.", data: added }));
  vi.stubGlobal("fetch", fetch);
  render(<EmployeeDirectory initial={[person]} migrated />);
  fireEvent.click(screen.getByRole("button", { name: /Tambah karyawan/ }));
  const panel = within(screen.getByRole("dialog", { name: "Tambah karyawan" }));
  fireEvent.click(panel.getByRole("button", { name: "Tambah karyawan" }));
  expect(panel.getByText("Isi nama lengkap.")).toBeTruthy();
  fireEvent.change(panel.getByLabelText("Nama lengkap *"), { target: { value: "Orang Baru" } });
  fireEvent.change(panel.getByLabelText("Departemen *"), { target: { value: "Corporate" } });
  fireEvent.change(panel.getByLabelText("Jabatan *"), { target: { value: "Staff" } });
  // One field: the Business Unit, written to HR's office too (they hold the same code).
  fireEvent.change(panel.getByLabelText("Business Unit"), { target: { value: "TEE" } });
  fireEvent.click(panel.getByRole("button", { name: "Tambah karyawan" }));
  expect(await screen.findByText("Orang Baru ditambahkan.")).toBeTruthy();
  expect(fetch.mock.calls[0][0]).toBe("/api/admin/employees");
  expect(JSON.parse(fetch.mock.calls[0][1].body as string).employee).toMatchObject({ full_name: "Orang Baru", department: "Corporate", position: "Staff", business_unit: "TEE", office: "TEE", category: "karyawan" });

  fireEvent.click(screen.getByRole("button", { name: "Hapus Orang Baru" }));
  const ask = await screen.findByRole("dialog", { name: "Hapus Orang Baru?" });
  fireEvent.click(within(ask).getByRole("button", { name: "Hapus karyawan" }));
  expect(await screen.findByText("Karyawan dihapus.")).toBeTruthy();
  expect(fetch.mock.calls[1]).toEqual([`/api/admin/employees/${added.id}`, expect.objectContaining({ method: "DELETE" })]);
  expect(screen.queryByText("Orang Baru")).toBeNull();
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

  it("counts the WAM accounts and offers Buat akun for everyone still missing one, with no column of its own", () => {
    render(<EmployeeDirectory initial={team} migrated wamAccounts={accounts} />);
    expect(screen.queryByRole("columnheader", { name: "Akun WAM" })).toBeNull();
    expect(screen.getByText(/1 dari 3 karyawan aktif sudah punya akun/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Buat akun WAM untuk 1 karyawan" })).toBeTruthy();
  });

  it("asks before creating everyone's account, then lists who was skipped and why", async () => {
    const fetch = vi.fn(async () => reply({ ok: true, message: "1 akun dibuat, 1 dilewati.", data: { created: 1, skipped: ["Contoh Tiga: email masih kosong."], rows: rowsAfter([team[0].id, team[1].id]) } }));
    vi.stubGlobal("fetch", fetch);
    render(<EmployeeDirectory initial={team} migrated wamAccounts={accounts} />);
    fireEvent.click(screen.getByRole("button", { name: "Buat akun WAM untuk 1 karyawan" }));
    const dialog = await screen.findByRole("dialog", { name: "Buat akun WAM untuk 1 karyawan?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Batal" }));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Buat akun WAM untuk 1 karyawan" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Buat akun" }));
    expect(await screen.findByText("1 akun WAM dibuat, 1 dilewati.")).toBeTruthy();
    expect(fetch.mock.calls[0]).toEqual(["/api/admin/wam/accounts", expect.objectContaining({ method: "POST" })]);
    expect(within(screen.getByRole("list", { name: "Dilewati" })).getByText("Contoh Tiga: email masih kosong.")).toBeTruthy();
  });

  it("keeps Buat akun off until the first password is set on the server", () => {
    render(<EmployeeDirectory initial={team} migrated wamAccounts={{ ...accounts, passwordReady: false }} />);
    expect(screen.getByText(/Password awal WAM belum disiapkan/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Buat akun WAM untuk 1 karyawan" })).toHaveProperty("disabled", true);
  });
});
