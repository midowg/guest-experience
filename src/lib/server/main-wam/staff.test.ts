import { beforeEach, describe, expect, it, vi } from "vitest";
import { mainWamGate } from "@/lib/main-wam/access";
import { callsOf, fake, newRequest, spyWarn, type Query } from "./fake-db.test-helper";

/*
 * Panitia WAM (20 Nov 2026, KONTRAK §15): the WAM event's committee in pw_event_staff, apart from Pra WAM's
 * roles. Who tests Main WAM (penguji = the list + Panitia WAM), Admin WAM 2026's list and its writes, the
 * pengendali twin of Admin WAM 2026, and the migration check Akses admin reads.
 */

vi.mock("server-only", () => ({}));
vi.mock("react", async original => (await import("./fake-db.test-helper")).reactMock(original as () => Promise<typeof import("react")>));
vi.mock("../supabase/admin", async () => (await import("./fake-db.test-helper")).supabaseMock());
let events: { id: string; kind: string; name: string }[] = [];
vi.mock("../pra-wam/events", () => ({ listEvents: async () => ({ events, migrated: true }) }));
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "x");

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const RANI = id(1), DIMAS = id(2), ARMAN = id(3);
const EVENT = "00000000-0000-4000-8000-0000000000ee";
let staff: { employee_id: string; seksi: string }[] = [];
let testers: string[] = [];
let bod: string[] = [];
let accounts: string[] = [];
let grant: string[] | null = null;
let missingTable = false;

function answer(q: Query): { data?: unknown; error?: { code?: string; message?: string } | null } {
  const eqs = callsOf(q, "eq");
  const eqOf = (column: string) => eqs.find(call => call[0] === column)?.[1];
  switch (q.table) {
    case "pw_event_staff": {
      if (missingTable) return { error: { code: "PGRST205", message: "Could not find the table 'public.pw_event_staff' in the schema cache" } };
      const who = eqOf("employee_id");
      const rows = staff.filter(row => !who || row.employee_id === who).map(row => ({
        ...row, granted_at: "2026-11-20T03:00:00Z", granted_by: "Super admin",
        employees: { full_name: row.employee_id === RANI ? "Rani Contoh" : "Dimas Contoh", department: "CoE", active: true },
      }));
      return { data: rows };
    }
    case "mw_testers": return { data: testers.map(employee_id => ({ employee_id })) };
    case "pw_roles": return { data: bod.filter(employee => !eqOf("employee_id") || employee === eqOf("employee_id")).map(employee_id => ({ employee_id })) };
    case "employees": return { data: [{ id: eqOf("id"), active: eqOf("id") !== id(9) }] };
    case "pw_accounts": return { data: accounts.map(employee_id => ({ employee_id })) };
    case "admin_grants": return { data: grant ? [{ apps: grant }] : [] };
    default: return { data: [] };
  }
}

const staffModule = await import("./staff");
const viewer = await import("./viewer");

const member = (roles: string[], who = RANI) => ({ id: who, name: "Rani Contoh", nickname: "Rani", department: "CoE", position: "", mustChangePassword: false, roles, photo: null }) as never;

beforeEach(() => {
  newRequest();
  fake.answer = answer;
  events = [{ id: EVENT, kind: "wam", name: "WAM 2026" }];
  staff = []; testers = []; bod = []; accounts = []; grant = null; missingTable = false;
});

describe("who tests Main WAM (mode uji): the listed penguji and Panitia WAM", () => {
  it("Pra WAM's panitia or admin who knows /wam2026 does not get in, unless listed or on Panitia WAM", async () => {
    const pra = member(["panitia", "admin"]);
    expect(await viewer.testsMainWam(pra)).toBe(false);
    expect(mainWamGate("uji", { tester: false })).toEqual({ kind: "tutup" });
    newRequest(); testers = [RANI];
    expect(await viewer.testsMainWam(pra)).toBe(true);
    newRequest(); testers = []; staff = [{ employee_id: RANI, seksi: "Acara" }];
    expect(await viewer.testsMainWam(member([]))).toBe(true);
    expect(mainWamGate("uji", { tester: true })).toEqual({ kind: "masuk" });
  });

  it("reads Panitia WAM of the WAM event only (pw_events.kind = wam), once per request", async () => {
    staff = [{ employee_id: RANI, seksi: "Acara" }];
    await Promise.all([staffModule.wamStaffIds(), staffModule.wamStaffIds(), staffModule.wamStaff()]);
    const queries = fake.queries.filter(q => q.table === "pw_event_staff");
    expect(queries).toHaveLength(1);
    expect(callsOf(queries[0], "select")[0][0]).toContain("pw_events!inner(kind)");
    expect(callsOf(queries[0], "eq")).toEqual([["pw_events.kind", "wam"]]);
  });

  it("before the migration (or on a failure) nobody is panitia, and the gate never breaks", async () => {
    missingTable = true;
    expect([...(await staffModule.wamStaff()).keys()]).toEqual([]);
    newRequest();
    fake.answer = q => (q.table === "pw_event_staff" ? { error: { code: "XX000", message: "down" } } : answer(q));
    expect([...(await staffModule.wamStaffIds())]).toEqual([]);
    newRequest();
    await expect(staffModule.wamStaff()).rejects.toThrow();
  });
});

describe("Admin WAM 2026 → Panitia WAM", () => {
  it("lists by seksi, then name, with who has no active WAM account yet", async () => {
    staff = [{ employee_id: DIMAS, seksi: "Kamar" }, { employee_id: RANI, seksi: "Acara" }];
    accounts = [RANI];
    const board = await staffModule.listWamStaff();
    expect(board.migrated).toBe(true);
    expect(board.event).toEqual({ id: EVENT, name: "WAM 2026" });
    expect(board.staff.map(row => [row.fullName, row.seksi, row.hasAccount])).toEqual([["Rani Contoh", "Acara", true], ["Dimas Contoh", "Kamar", false]]);
  });

  it("before the migration: an empty list, migrated false", async () => {
    missingTable = true;
    expect(await staffModule.listWamStaff()).toMatchObject({ staff: [], migrated: false });
  });

  it("adds a person with their seksi (tidied) and who added them; a second time changes the seksi", async () => {
    expect(await staffModule.saveWamStaff(RANI, "  Acara   dan  MC ", "Dewi Contoh")).toBe("added");
    const insert = fake.queries.find(q => q.table === "pw_event_staff" && callsOf(q, "insert").length)!;
    expect(callsOf(insert, "insert")[0][0]).toEqual({ event_id: EVENT, employee_id: RANI, seksi: "Acara dan MC", granted_by: "Dewi Contoh" });
    newRequest(); staff = [{ employee_id: RANI, seksi: "Acara dan MC" }];
    expect(await staffModule.saveWamStaff(RANI, "Kamar", "Dewi Contoh")).toBe("changed");
    const update = fake.queries.find(q => q.table === "pw_event_staff" && callsOf(q, "update").length)!;
    expect(callsOf(update, "update")[0][0]).toEqual({ seksi: "Kamar" });
    expect(callsOf(update, "eq")).toEqual([["event_id", EVENT], ["employee_id", RANI]]);
  });

  it("refuses a BOD, someone not in Data karyawan, a missing WAM event, and a seksi change for someone not on it", async () => {
    bod = [ARMAN];
    await expect(staffModule.saveWamStaff(ARMAN, "", "x")).rejects.toMatchObject({ status: 422, message: "BOD tidak bisa menjadi Panitia WAM." });
    await expect(staffModule.saveWamStaff(id(9), "", "x")).rejects.toMatchObject({ status: 404 });
    await expect(staffModule.saveWamStaff(RANI, "Acara", "x", { onlyChange: true })).rejects.toMatchObject({ status: 404 });
    events = [];
    await expect(staffModule.saveWamStaff(RANI, "", "x")).rejects.toMatchObject({ status: 409 });
  });

  it("before the migration a write says menunggu pembaruan (the file name only in the server log)", async () => {
    const warn = spyWarn();
    missingTable = true;
    await expect(staffModule.saveWamStaff(RANI, "", "x")).rejects.toMatchObject({ status: 503 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("202611200603_admin_wam_acara.sql"));
    warn.mockRestore();
  });

  it("removes one person of the WAM event only", async () => {
    await staffModule.removeWamStaff(RANI);
    const remove = fake.queries.find(q => q.table === "pw_event_staff" && callsOf(q, "delete").length)!;
    expect(callsOf(remove, "eq")).toEqual([["event_id", EVENT], ["employee_id", RANI]]);
  });
});

describe("the app-side twin of Admin WAM 2026 (Kuis live's pengendali)", () => {
  it("is a WAM account whose grant holds wam_acara; Admin Pra WAM alone, no grant, or a failure is not", async () => {
    grant = ["wam_acara"];
    expect(await staffModule.holdsWamAcara(RANI)).toBe(true);
    newRequest(); grant = ["wam", "kuesioner"];
    expect(await staffModule.holdsWamAcara(RANI)).toBe(false);
    newRequest(); grant = null;
    expect(await staffModule.holdsWamAcara(RANI)).toBe(false);
    newRequest();
    fake.answer = () => ({ error: { code: "XX000", message: "down" } });
    expect(await staffModule.holdsWamAcara(RANI)).toBe(false);
  });
});

describe("has migration 202611200603 run (Akses admin)", () => {
  it("no while pw_event_staff is missing, yes once it is there", async () => {
    missingTable = true;
    expect(await staffModule.wamAcaraMigrated()).toBe(false);
  });
});
