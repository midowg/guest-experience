import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { EmployeeDirectory } from "./EmployeeDirectory";
import type { Employee } from "@/lib/employees";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const person: Employee = { id: "6a000000-0000-4000-8000-000000000001", full_name: "Contoh Satu", nickname: "Satu", department: "Sales & Marketing", position: "Business Solutions Manager", office: "WNS", category: "karyawan", phone: "", email: "", active: true, nip: "", business_unit: "WNS" };
/** The list's one-line "Departemen · Jabatan" (the department is an <abbr> inside it). */
const jobLine = (text: string) => (_: string, element: Element | null) => element?.tagName === "P" && element.textContent === text;
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
  // No Status column and no Hapus in the rows (9 Nov 2026): both are inside Ubah karyawan.
  expect(screen.getAllByRole("columnheader").map(header => header.textContent)).toEqual(["Karyawan", "Departemen & jabatan", "Business Unit", "Kontak", "Aksi"]);
  expect(screen.queryByRole("switch")).toBeNull();
  expect(screen.queryByRole("button", { name: /^Hapus/ })).toBeNull();
  const first = within(screen.getByText("Contoh Satu").closest("tr")!);
  // One line: the department by its initials (full name on hover), then the job.
  expect(first.getByText(jobLine("SM · Business Solutions Manager · HOD"))).toBeTruthy();
  expect(first.getByTitle("Sales & Marketing").textContent).toBe("SM");
  expect(first.getByText("HOD dari Corporate")).toBeTruthy();
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

/** The PATCH reply when jobs are sent: the person with the Utama job copied, the jobs, what they head. */
function jobsReply(base: Employee, body: { jobs: { business_unit: string; department: string; post: string; job_title: string; reports_to: string | null }[] } & Record<string, unknown>, migrated = true) {
  const { jobs, ...rest } = body;
  const first = jobs[0];
  const employee = { ...base, ...rest, department: first.department, position: first.job_title || `${first.post === "hod" ? "HOD" : "Lead"} ${first.department}`, business_unit: first.business_unit, office: first.business_unit, reports_to: first.reports_to };
  const of = (post: string) => [...new Set(jobs.filter(job => job.post === post).map(job => job.department))].sort();
  return reply({ ok: true, message: migrated ? "Data karyawan disimpan." : "Pekerjaan utama disimpan; pekerjaan lain menunggu migrasi 202611090003_employee_jobs.sql.",
    data: { employee, jobs, leads: { departments: of("hod"), lead: of("lead").length > 0, leadIn: of("lead") }, migrated } });
}
const card = (panel: ReturnType<typeof within>, name: string) => within(panel.getByRole("region", { name }));

it("changes a person in one panel, their post included, and switches someone off there", async () => {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    return body.jobs ? jobsReply(person, body) : reply({ ok: true, message: "Data karyawan disimpan.", data: { ...person, ...body } });
  });
  vi.stubGlobal("fetch", fetch);
  render(<EmployeeDirectory initial={[person]} migrated leadOptions={{ departments: ["Corporate", "Sales & Marketing"] }} />);
  fireEvent.click(screen.getByRole("button", { name: "Ubah Contoh Satu" }));
  const panel = within(screen.getByRole("dialog", { name: "Ubah karyawan" }));
  // No separate HOD and Lead part any more: they are a job's Posisi.
  expect(panel.queryByRole("checkbox", { name: /HOD Sales & Marketing/ })).toBeNull();
  fireEvent.click(panel.getByRole("radio", { name: "GA" }));
  const utama = card(panel, "Pekerjaan utama");
  fireEvent.change(utama.getByLabelText("Business Unit"), { target: { value: "TEE" } });
  // One Business Unit field (Office is the same code and follows it).
  expect(panel.queryByLabelText("Office")).toBeNull();
  fireEvent.click(utama.getByRole("radio", { name: "HOD" }));
  // A HOD sits under nobody: no Di bawah.
  expect(utama.queryByLabelText("Di bawah")).toBeNull();
  fireEvent.click(panel.getByRole("button", { name: "Simpan perubahan" }));
  expect(await screen.findByText("Contoh Satu disimpan.")).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe(`/api/admin/employees/${person.id}`);
  expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({ category: "ga", jobs: [{ business_unit: "TEE", department: "Sales & Marketing", post: "hod", job_title: "Business Solutions Manager", reports_to: null }] });
  const row = within(screen.getByText("Contoh Satu").closest("tr")!);
  expect(row.getByText("GA")).toBeTruthy();
  expect(row.getByText("TEE")).toBeTruthy();
  expect(row.getByText(jobLine("SM · Business Solutions Manager · HOD"))).toBeTruthy();
  // Aktif is in the panel's Status part, not in the row.
  fireEvent.click(row.getByRole("button", { name: "Ubah Contoh Satu" }));
  const again = within(screen.getByRole("dialog", { name: "Ubah karyawan" }));
  const active = again.getByRole("switch", { name: "Aktif" });
  expect(active).toHaveProperty("checked", true);
  fireEvent.click(active);
  expect(again.getByRole("switch", { name: "Nonaktif" })).toHaveProperty("checked", false);
  fireEvent.click(again.getByRole("button", { name: "Simpan perubahan" }));
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetch.mock.calls[1][1].body as string)).toEqual({ active: false });
  expect(await within(screen.getByText("Contoh Satu").closest("tr")!).findByText("Nonaktif")).toBeTruthy();
});

describe("Pekerjaan (9 Nov 2026)", () => {
  const hod = { ...person, id: "6a000000-0000-4000-8000-000000000041", full_name: "Kepala Sales", position: "Head of Sales" };
  const lead = { ...person, id: "6a000000-0000-4000-8000-000000000042", full_name: "Lead Solusi", position: "Business Solutions Lead" };
  const other = { ...person, id: "6a000000-0000-4000-8000-000000000043", full_name: "Lead Lain", department: "Finance", position: "Tax Lead" };
  const leads = { [hod.id]: { departments: ["Sales & Marketing"], lead: false }, [lead.id]: { departments: [], lead: true }, [other.id]: { departments: [], lead: true } };

  it("asks Business Unit, then Departemen, then Posisi; a Jabatan names its title and is under the HOD or a Lead of that department", () => {
    render(<EmployeeDirectory initial={[person, hod, lead, other]} migrated leads={leads} />);
    fireEvent.click(screen.getByRole("button", { name: "Ubah Contoh Satu" }));
    const panel = within(screen.getByRole("dialog", { name: "Ubah karyawan" }));
    const utama = card(panel, "Pekerjaan utama");
    const order = [utama.getByLabelText("Business Unit"), utama.getByLabelText("Departemen *"), utama.getByRole("radiogroup", { name: "Posisi" }), utama.getByLabelText("Nama jabatan *"), utama.getByLabelText("Di bawah")];
    for (let at = 1; at < order.length; at++) expect(order[at - 1].compareDocumentPosition(order[at]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(utama.getByRole("radiogroup", { name: "Posisi" })).getAllByRole("radio").map(radio => radio.parentElement?.textContent)).toEqual(["HOD", "Lead", "Jabatan"]);
    expect(utama.getByRole("radio", { name: "Jabatan" })).toHaveProperty("checked", true);
    const under = utama.getByLabelText("Di bawah") as HTMLSelectElement;
    // The HOD of Sales & Marketing, then its Leads; the Finance Lead is not offered.
    expect([...under.options].map(option => option.textContent)).toEqual(["HOD Sales & Marketing · Kepala Sales", "Lead · Lead Solusi"]);
    // Another department: its own Leads, and a Lead picked before goes back to the HOD.
    fireEvent.change(under, { target: { value: lead.id } });
    fireEvent.change(utama.getByLabelText("Departemen *"), { target: { value: "Finance" } });
    expect([...(utama.getByLabelText("Di bawah") as HTMLSelectElement).options].map(option => option.textContent)).toEqual(["HOD Finance", "Lead · Lead Lain"]);
    expect((utama.getByLabelText("Di bawah") as HTMLSelectElement).value).toBe("");
    // A Lead has no Di bawah (under the HOD by rule) and its title may stay empty.
    fireEvent.click(utama.getByRole("radio", { name: "Lead" }));
    expect(utama.queryByLabelText("Di bawah")).toBeNull();
    expect(utama.getByLabelText("Nama jabatan")).toBeTruthy();
  });

  it("adds a job in another BU and removes it again; the Utama job cannot be removed", async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => jobsReply(person, JSON.parse(init.body as string)));
    vi.stubGlobal("fetch", fetch);
    render(<EmployeeDirectory initial={[person, hod, lead]} migrated leads={leads} />);
    fireEvent.click(screen.getByRole("button", { name: "Ubah Contoh Satu" }));
    const panel = within(screen.getByRole("dialog", { name: "Ubah karyawan" }));
    expect(card(panel, "Pekerjaan utama").queryByRole("button", { name: /Hapus/ })).toBeNull();
    fireEvent.click(panel.getByRole("button", { name: /Tambah pekerjaan/ }));
    fireEvent.click(panel.getByRole("button", { name: /Tambah pekerjaan/ }));
    fireEvent.click(panel.getByRole("button", { name: "Hapus pekerjaan 2" }));
    const second = card(panel, "Pekerjaan 2");
    expect(panel.queryByRole("region", { name: "Pekerjaan 3" })).toBeNull();
    fireEvent.change(second.getByLabelText("Business Unit"), { target: { value: "MRP" } });
    fireEvent.click(panel.getByRole("button", { name: "Simpan perubahan" }));
    // A Jabatan needs its department and title.
    expect(second.getByText("Isi departemen.")).toBeTruthy();
    expect(second.getByText("Isi nama jabatan.")).toBeTruthy();
    fireEvent.change(second.getByLabelText("Departemen *"), { target: { value: "Finance" } });
    fireEvent.click(second.getByRole("radio", { name: "Lead" }));
    fireEvent.click(panel.getByRole("button", { name: "Simpan perubahan" }));
    expect(await screen.findByText("Contoh Satu disimpan.")).toBeTruthy();
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({ jobs: [
      { business_unit: "WNS", department: "Sales & Marketing", post: "staf", job_title: "Business Solutions Manager", reports_to: null },
      { business_unit: "MRP", department: "Finance", post: "lead", job_title: "", reports_to: null },
    ] });
    // The Utama job stays in the list; the other shows as a chip, its BU beside.
    const row = within(screen.getByText("Contoh Satu").closest("tr")!);
    expect(row.getByText(jobLine("SM · Business Solutions Manager"))).toBeTruthy();
    expect(row.getByText("+1 pekerjaan")).toBeTruthy();
    expect(row.getByText("Lead dari Finance")).toBeTruthy();
    expect(row.getByText("MRP")).toBeTruthy();
  });

  it("shows +N pekerjaan from the saved jobs, and filters by the BU of any job", () => {
    const jobs = { [person.id]: [
      { business_unit: "WNS", department: "Sales & Marketing", post: "staf" as const, job_title: "Business Solutions Manager", reports_to: null },
      { business_unit: "TEE", department: "Event", post: "staf" as const, job_title: "Producer", reports_to: null },
    ] };
    render(<EmployeeDirectory initial={[person, hod]} migrated leads={leads} jobs={jobs} />);
    expect(within(screen.getByText("Contoh Satu").closest("tr")!).getByText("+1 pekerjaan").getAttribute("title")).toBe("TEE · Event · Producer");
    fireEvent.change(screen.getByLabelText("Business Unit"), { target: { value: "TEE" } });
    expect(screen.queryByText("Kepala Sales")).toBeNull();
    expect(screen.getByText("Contoh Satu")).toBeTruthy();
  });

  it("before migration 202611090003 keeps the Utama job and says the others wait", async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => jobsReply(person, JSON.parse(init.body as string), false));
    vi.stubGlobal("fetch", fetch);
    render(<EmployeeDirectory initial={[person]} migrated jobsMigrated={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Ubah Contoh Satu" }));
    const panel = within(screen.getByRole("dialog", { name: "Ubah karyawan" }));
    fireEvent.click(panel.getByRole("button", { name: /Tambah pekerjaan/ }));
    expect(panel.getByText(/baru tersimpan setelah migrasi 202611090003_employee_jobs.sql/)).toBeTruthy();
    const second = card(panel, "Pekerjaan 2");
    fireEvent.change(second.getByLabelText("Departemen *"), { target: { value: "Event" } });
    fireEvent.change(second.getByLabelText("Nama jabatan *"), { target: { value: "Producer" } });
    fireEvent.click(panel.getByRole("button", { name: "Simpan perubahan" }));
    expect(await screen.findByText(/Contoh Satu disimpan\. Pekerjaan utama disimpan; pekerjaan lain menunggu migrasi/)).toBeTruthy();
    // Nothing of the second job is kept on the page either.
    expect(within(screen.getByText("Contoh Satu").closest("tr")!).queryByText("+1 pekerjaan")).toBeNull();
  });

  it("locks HOD and Lead for a BOD, and saves leaving BOD before becoming HOD", async () => {
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      return body.jobs ? jobsReply(person, body) : reply({ ok: true, message: "Peran dan struktur disimpan.", data: { rows: [] } });
    });
    vi.stubGlobal("fetch", fetch);
    render(<EmployeeDirectory initial={[person]} migrated wamAccounts={{ migrated: true, passwordReady: true, withAccount: [], roles: { [person.id]: ["bod"] } }} />);
    fireEvent.click(screen.getByRole("button", { name: "Ubah Contoh Satu" }));
    const panel = within(screen.getByRole("dialog", { name: "Ubah karyawan" }));
    const utama = card(panel, "Pekerjaan utama");
    expect(utama.getByRole("radio", { name: "HOD" })).toHaveProperty("disabled", true);
    fireEvent.click(panel.getByRole("checkbox", { name: /^BOD/ }));
    fireEvent.click(utama.getByRole("radio", { name: "HOD" }));
    fireEvent.click(panel.getByRole("button", { name: "Simpan perubahan" }));
    expect(await screen.findByText("Contoh Satu disimpan.")).toBeTruthy();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([`/api/admin/wam/accounts/${person.id}`, `/api/admin/employees/${person.id}`]);
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({ roles: [] });
  });
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
    : init.method === "PATCH" ? jobsReply(added, JSON.parse(init.body as string))
    : reply({ ok: true, message: "Orang Baru ditambahkan.", data: added }));
  vi.stubGlobal("fetch", fetch);
  render(<EmployeeDirectory initial={[person]} migrated />);
  fireEvent.click(screen.getByRole("button", { name: /Tambah karyawan/ }));
  const panel = within(screen.getByRole("dialog", { name: "Tambah karyawan" }));
  // A new person has no Status or Hapus yet, and the BU field carries no hint.
  expect(panel.queryByRole("switch")).toBeNull();
  expect(panel.queryByRole("button", { name: /Hapus karyawan/ })).toBeNull();
  expect(panel.queryByText(/Unit usaha di Werkudara Group/)).toBeNull();
  fireEvent.click(panel.getByRole("button", { name: "Tambah karyawan" }));
  expect(panel.getByText("Isi nama lengkap.")).toBeTruthy();
  fireEvent.change(panel.getByLabelText("Nama lengkap *"), { target: { value: "Orang Baru" } });
  fireEvent.change(panel.getByLabelText("Departemen *"), { target: { value: "Corporate" } });
  fireEvent.change(panel.getByLabelText("Nama jabatan *"), { target: { value: "Staff" } });
  // One field: the Business Unit, written to HR's office too (they hold the same code).
  fireEvent.change(panel.getByLabelText("Business Unit"), { target: { value: "TEE" } });
  fireEvent.click(panel.getByRole("button", { name: "Tambah karyawan" }));
  expect(await screen.findByText("Orang Baru ditambahkan.")).toBeTruthy();
  expect(fetch.mock.calls[0][0]).toBe("/api/admin/employees");
  expect(JSON.parse(fetch.mock.calls[0][1].body as string).employee).toMatchObject({ full_name: "Orang Baru", department: "Corporate", position: "Staff", business_unit: "TEE", office: "TEE", category: "karyawan" });
  // Then their jobs, so the post and any other job are kept.
  expect(fetch.mock.calls[1][0]).toBe(`/api/admin/employees/${added.id}`);
  expect(JSON.parse(fetch.mock.calls[1][1].body as string)).toEqual({ jobs: [{ business_unit: "TEE", department: "Corporate", post: "staf", job_title: "Staff", reports_to: null }] });

  // Hapus is inside Ubah karyawan; a new person's panel has none.
  expect(screen.queryByRole("button", { name: "Hapus Orang Baru" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Ubah Orang Baru" }));
  const edit = within(screen.getByRole("dialog", { name: "Ubah karyawan" }));
  fireEvent.click(edit.getByRole("button", { name: /Hapus karyawan/ }));
  const ask = await screen.findByRole("dialog", { name: "Hapus Orang Baru?" });
  fireEvent.click(within(ask).getByRole("button", { name: "Hapus karyawan" }));
  expect(await screen.findByText("Karyawan dihapus.")).toBeTruthy();
  expect(screen.queryByRole("dialog", { name: "Ubah karyawan" })).toBeNull();
  expect(fetch.mock.calls[2]).toEqual([`/api/admin/employees/${added.id}`, expect.objectContaining({ method: "DELETE" })]);
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
