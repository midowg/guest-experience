import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmployeeJob } from "@/lib/employees";

/*
 * Pekerjaan karyawan (migration 202611090003): saving copies the Utama job to employees, keeps
 * every job in employee_jobs and writes pw_leads from the HOD and Lead jobs. Before the migration
 * only the Utama job and pw_leads are kept. The database is a small fake.
 */

vi.mock("server-only", () => ({}));
type Row = Record<string, unknown>;
let jobsTable: Row[] | null;
let employees: Row[];
let roles: string[];
const updates: { id: string; patch: Row }[] = [];
const leadsSaved: { id: string; leads: unknown }[] = [];
const missingTable = { code: "42P01", message: "relation \"public.employee_jobs\" does not exist" };

function from(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let action: "select" | "delete" = "select";
  const rows = () => table === "employees" ? employees : jobsTable ?? [];
  const run = () => {
    if (table === "employee_jobs" && !jobsTable) return { data: null, error: missingTable };
    const hit = rows().filter(row => filters.every(test => test(row)));
    if (action === "delete") jobsTable = (jobsTable ?? []).filter(row => !hit.includes(row));
    return { data: hit, error: null };
  };
  const query = {
    select: () => query,
    delete: () => { action = "delete"; return query; },
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
    gte: (key: string, value: number) => { filters.push(row => (row[key] as number) >= value); return query; },
    order: () => query,
    limit: () => query,
    maybeSingle: async () => { const { data, error } = run(); return { data: data?.[0] ?? null, error }; },
    upsert: async (values: Row[]) => {
      if (!jobsTable) return { error: missingTable };
      for (const value of values) {
        const at = jobsTable.findIndex(row => row.employee_id === value.employee_id && row.sort_order === value.sort_order);
        if (at >= 0) jobsTable[at] = value; else jobsTable.push(value);
      }
      return { error: null };
    },
    then: (resolve: (value: unknown) => void) => resolve(run()),
  };
  return query;
}

vi.mock("./supabase/admin", () => ({ createPrivilegedClient: () => ({ from }) }));
vi.mock("./employees", () => ({
  updateEmployee: async (id: string, patch: Row) => { updates.push({ id, patch }); return { ...employees.find(row => row.id === id), ...patch }; },
}));
vi.mock("./pra-wam/leads", () => ({
  setLeads: async (id: string, leads: unknown) => { leadsSaved.push({ id, leads }); },
  listLeads: async () => ({ byPerson: new Map([["p1", { departments: ["Sales"], lead: false }]]), migrated: true }),
}));
vi.mock("./pra-wam/session", () => ({ rolesOf: async () => roles }));

const { listJobs, setJobs } = await import("./employee-jobs");
const ID = "6a000000-0000-4000-8000-000000000001";
const job = (patch: Partial<EmployeeJob> = {}): EmployeeJob => ({ business_unit: "WNS", department: "Sales", post: "staf", job_title: "Account Manager", reports_to: null, ...patch });

beforeEach(() => {
  jobsTable = [{ employee_id: ID, sort_order: 0, ...job() }, { employee_id: ID, sort_order: 1, ...job({ department: "Old" }) }, { employee_id: ID, sort_order: 2, ...job({ department: "Older" }) }];
  employees = [{ id: ID, office: "WNS", full_name: "Contoh" }];
  roles = [];
  updates.length = 0;
  leadsSaved.length = 0;
});

describe("setJobs", () => {
  it("copies the Utama job to employees, keeps every job, drops the ones removed, and writes pw_leads", async () => {
    const saved = await setJobs(ID, [job({ business_unit: "TEE", post: "hod", job_title: "" }), job({ business_unit: "MRP", department: "Finance", post: "lead", job_title: "" })]);
    expect(updates).toEqual([{ id: ID, patch: { department: "Sales", position: "HOD Sales", business_unit: "TEE", office: "TEE", reports_to: null } }]);
    expect(jobsTable!.map(row => [row.sort_order, row.department, row.post])).toEqual([[0, "Sales", "hod"], [1, "Finance", "lead"]]);
    expect(leadsSaved).toEqual([{ id: ID, leads: { departments: ["Sales"], lead: true, leadIn: ["Finance"] } }]);
    expect(saved.migrated).toBe(true);
  });

  it("refuses HOD or Lead for a BOD before writing anything", async () => {
    roles = ["bod"];
    await expect(setJobs(ID, [job({ post: "lead" })])).rejects.toThrow("BOD tidak bisa menjadi HOD atau Lead.");
    expect(updates).toEqual([]);
    expect(leadsSaved).toEqual([]);
    // A plain Jabatan is fine for a BOD.
    await setJobs(ID, [job()]);
    expect(updates).toHaveLength(1);
  });

  it("refuses being under oneself", async () => {
    await expect(setJobs(ID, [job({ reports_to: ID })])).rejects.toThrow(/bukan orangnya sendiri/);
  });

  it("before the migration keeps the Utama job and pw_leads, and says the table is missing", async () => {
    jobsTable = null;
    const saved = await setJobs(ID, [job({ reports_to: "6a000000-0000-4000-8000-000000000002" }), job({ department: "IT", post: "hod", job_title: "" })]);
    expect(saved.migrated).toBe(false);
    expect(updates[0].patch).toMatchObject({ department: "Sales", position: "Account Manager", reports_to: "6a000000-0000-4000-8000-000000000002" });
    expect(leadsSaved[0].leads).toEqual({ departments: ["IT"], lead: false, leadIn: [] });
  });
});

describe("listJobs", () => {
  const person = { id: ID, full_name: "Contoh", nickname: "", department: "Sales", position: "Account Manager", office: "WNS", category: "karyawan" as const, phone: "", email: "", active: true, nip: "", business_unit: "WNS", reports_to: null };

  it("reads the saved jobs, with HOD and Lead as pw_leads has them", async () => {
    const { byPerson, migrated } = await listJobs([{ ...person, id: "p1" }, person]);
    expect(migrated).toBe(true);
    // p1 has no rows: from the columns, and HOD of Sales per pw_leads.
    expect(byPerson.p1).toEqual([job({ post: "hod" })]);
    expect(byPerson[ID].map(item => item.department)).toEqual(["Sales", "Old", "Older"]);
  });

  it("reads everyone from their columns before the migration", async () => {
    jobsTable = null;
    const { byPerson, migrated } = await listJobs([person]);
    expect(migrated).toBe(false);
    expect(byPerson[ID]).toEqual([job()]);
  });
});
