import { beforeEach, describe, expect, it, vi } from "vitest";
import { fake, newRequest, type Query } from "./fake-db.test-helper";

/*
 * What the gate costs per request (audit S5): every page, API and prefetch runs it, so it reads only
 * who, their roles, the mode, penguji and kelompok. The room (HR's pairing: the questionnaire, the
 * pairing, everyone in the room, all names) is read only by the screens that show it. Counted with
 * the stand-in database: queries, and rounds (queries that wait on an earlier answer).
 *
 * Before (fba047f, viewer.ts with the room in every viewer): requireMainWamApi = 15 queries in 6
 * rounds (this stand-in), the same for every page and prefetch. After: 6 queries in 3 rounds; the
 * room's 8 more only on Saya and below.
 */

vi.mock("server-only", () => ({}));
vi.mock("react", async original => (await import("./fake-db.test-helper")).reactMock(original as () => Promise<typeof import("react")>));
vi.mock("../supabase/admin", async () => (await import("./fake-db.test-helper")).supabaseMock());
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/pra-wam/session-token", () => ({ praWamSecret: () => "x".repeat(40) }));
vi.mock("../pra-wam/session", async () => {
  const helper = await import("./fake-db.test-helper");
  return {
    currentMember: helper.fakeCache(async () => {
      // As in Pra WAM: the account (with its employee), then the roles.
      await helper.query("pw_accounts");
      await helper.query("pw_roles");
      return helper.fake.member;
    }),
  };
});
vi.mock("../pra-wam/questionnaire", async () => {
  const helper = await import("./fake-db.test-helper");
  return { currentForm: helper.fakeCache(async () => { await helper.query("cq_forms"); return { id: "form-1", status: "terbit" }; }) };
});
vi.mock("../pra-wam/appraisal", async () => {
  const helper = await import("./fake-db.test-helper");
  return { listPeople: helper.fakeCache(async () => { await helper.query("employees"); return [{ id: ME, name: "Rani", fullName: "Rani Contoh", department: "CoE", active: true }]; }) };
});
vi.mock("../pra-wam/events", async () => {
  const helper = await import("./fake-db.test-helper");
  return { listEvents: helper.fakeCache(async () => { await helper.query("pw_events"); return { events: [{ kind: "wam", startDate: "2027-01-04", endDate: "2027-01-07" }], migrated: true }; }) };
});

const ME = "11111111-1111-4111-8111-111111111111";
const has = (q: Query, name: string, ...args: unknown[]) => q.calls.some(call => call[0] === name && args.every((arg, i) => call[i + 1] === arg));

function answer(q: Query) {
  switch (q.table) {
    case "mw_settings": return { data: [{ mode: "semua", modules: {}, groups_published_at: "2026-11-01T00:00:00Z" }] };
    case "mw_testers": return { data: [] };
    case "mw_group_members":
      if (q.calls.some(call => call[0] === "select" && typeof call[1] === "string" && call[1].includes("mw_groups"))) {
        return { data: [{ group_id: "g4", coordinator: false, mw_groups: { id: "g4", number: 4, name: "Arjuno", mw_group_members: [{ count: 10 }] } }] };
      }
      return { data: [], count: 10 };
    case "cq_forms": return { data: [{ id: "form-1", rooms_published_at: "2026-11-01T00:00:00Z" }] };
    case "cq_stay_members": return has(q, "eq", "employee_id", ME) ? { data: [{ room_id: "r1" }] } : { data: [{ employee_id: ME }] };
    case "cq_stay_rooms": return { data: [{ id: "r1", name: "208", kind: "kamar" }] };
    case "mw_stay_room_details": return { data: [{ floor: "2", note: "" }] };
    default: return { data: [] };
  }
}

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "x");

const gate = await import("./gate");
const viewer = await import("./viewer");
const cost = () => ({ queries: fake.queries.length, rounds: fake.deepest, tables: fake.queries.map(q => q.table) });

beforeEach(() => {
  newRequest();
  fake.answer = answer;
  fake.member = { id: ME, name: "Rani Contoh", nickname: "Rani", department: "CoE", position: "Staf", mustChangePassword: false, roles: [], photo: null };
});

describe("the gate's cost per request (S5)", () => {
  it("an API (POST momen/dilihat every 3 seconds, a heart, a poll): who, roles, mode, penguji, kelompok; no room", async () => {
    // A route handler: React's cache() does not memoize there, so nothing may be read twice.
    newRequest(false);
    const context = await gate.requireMainWamApi();
    expect(context.viewer.group).toMatchObject({ number: 4, size: 10 });
    const { queries, rounds, tables } = cost();
    expect(tables).not.toContain("cq_stay_members");
    expect(tables).not.toContain("employees");
    // Before: 15 queries in 6 rounds (the room, every name and photo). Now: settings + the WAM dates,
    // the session (account, roles) with the penguji list and Panitia WAM (20 Nov 2026) beside it, then the kelompok with its size.
    expect(tables.sort()).toEqual(["mw_group_members", "mw_settings", "mw_testers", "pw_accounts", "pw_event_staff", "pw_events", "pw_roles"]);
    expect(queries).toBe(7);
    expect(rounds).toBe(3);
  });

  it("a page outside Saya: the same, no room", async () => {
    const context = await gate.requireMainWamPage("/wam/acara/agenda");
    expect(context.viewer.room).toBeNull();
    expect(cost().tables).not.toContain("cq_stay_members");
    expect(cost().queries).toBeLessThanOrEqual(7);
  });

  it("Saya, Kamar, Perjalanan read the room, once, however often they ask", async () => {
    const context = await gate.requireMainWamPage("/wam/acara/saya/kamar");
    expect(context.viewer.room).toMatchObject({ name: "208", floor: "2", people: [{ name: "Rani", me: true }] });
    const before = fake.queries.length;
    await viewer.viewerRoom(ME);
    await gate.requireMainWamPage("/wam/acara/saya/kamar");
    expect(fake.queries.length).toBe(before);
    expect(fake.queries.filter(q => q.table === "cq_stay_members").length).toBe(2);
  });

  it("the layout and the page share one read (cache per request)", async () => {
    await Promise.all([viewer.mainWamViewer(), gate.requireMainWamPage("/wam/acara")]);
    const accounts = fake.queries.filter(q => q.table === "pw_accounts");
    expect(accounts.length).toBe(1);
  });
});
