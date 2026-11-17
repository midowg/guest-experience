import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsOf, fake, newRequest, spyWarn, type Query } from "./fake-db.test-helper";

/*
 * Fondasi's shared server readers against the stand-in database: the one list of the event's
 * people (R5), the inbox newest first and the pins read on their own (S8), the tone of a pinned
 * announcement, readers cached per request (R14), and the plain "menunggu pembaruan sistem" (R13).
 */

vi.mock("server-only", () => ({}));
vi.mock("react", async original => (await import("./fake-db.test-helper")).reactMock(original as () => Promise<typeof import("react")>));
vi.mock("../supabase/admin", async () => (await import("./fake-db.test-helper")).supabaseMock());
vi.mock("../pra-wam/events", () => ({ listEvents: async () => ({ events: [{ id: "ev-wam", kind: "wam", startDate: "2027-01-04", endDate: "2027-01-07" }], migrated: true }) }));
vi.mock("../pra-wam/push", () => ({ schedulePush: vi.fn(async () => undefined) }));
vi.mock("../pra-wam/appraisal", () => ({ listPeople: async () => [] }));
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "x");

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = id(1);
let accounts: string[] = [];
let roles: { employee_id: string; role: string }[] = [];
let mode = "semua";
let testers: string[] = [];

function answer(q: Query) {
  switch (q.table) {
    case "pw_accounts": {
      const [from, to] = callsOf(q, "range")[0] as [number, number];
      return { data: accounts.slice(from, to + 1).map(employee_id => ({ employee_id })) };
    }
    case "pw_roles": return { data: roles };
    case "mw_settings": return { data: [{ mode, modules: {} }] };
    case "mw_testers": return { data: testers.map(employee_id => ({ employee_id })) };
    default: return { data: [] };
  }
}

const people = await import("./people");
const notes = await import("./notes");
const read = await import("./read");
const errors = await import("./errors");

beforeEach(() => {
  newRequest();
  fake.answer = answer;
  accounts = [ME, id(2), id(3), id(4), id(5)];
  roles = [{ employee_id: id(4), role: "bod" }, { employee_id: id(2), role: "panitia" }, { employee_id: id(3), role: "admin" }];
  mode = "semua";
  testers = [];
});

describe("mainWamAttendees: the event's people (R5)", () => {
  it("is every active WAM account except BOD", async () => {
    expect(await people.mainWamAttendees()).toEqual([ME, id(2), id(3), id(5)]);
    const query = fake.queries.find(q => q.table === "pw_accounts")!;
    // Active account and an active Data karyawan row.
    expect(callsOf(query, "eq")).toEqual([["active", true], ["employees.active", true]]);
  });

  it("is read once per request, however many counts ask (absen, Kehadiran, Detail sesi)", async () => {
    await Promise.all([people.mainWamAttendees(), people.mainWamAttendees(), people.mainWamEventPeople()]);
    expect(fake.queries.filter(q => q.table === "pw_accounts").length).toBe(1);
    expect(fake.queries.filter(q => q.table === "pw_roles").length).toBe(1);
    // The accounts and the roles side by side: one round.
    expect(fake.deepest).toBe(1);
  });

  it("reads past 1000 accounts", async () => {
    accounts = Array.from({ length: 1203 }, (_, n) => id(n + 10));
    expect((await people.mainWamAttendees()).length).toBe(1203);
    expect(fake.queries.filter(q => q.table === "pw_accounts").length).toBe(2);
  });

  it("a database failure is not an empty event", async () => {
    fake.answer = q => (q.table === "pw_roles" ? { error: { code: "XX000", message: "down" } } : answer(q));
    await expect(people.mainWamAttendees()).rejects.toThrow();
  });

  it("mainWamAudience uses the same list: everyone in mode semua, the penguji otherwise", async () => {
    expect(await notes.mainWamAudience()).toEqual([ME, id(2), id(3), id(4), id(5)]);
    newRequest();
    mode = "uji";
    testers = [id(5)];
    expect(await notes.mainWamAudience()).toEqual([id(2), id(3), id(5)]);
  });
});

type Row = { id: string; title: string; body?: string; created_at: string; read_at?: string | null; note?: { kind: string; link?: string; pinned_until?: string | null; tone?: string | null } | null };
const announcement = (row: Row) => ({
  id: row.id, title: row.title, body: row.body ?? "", created_at: row.created_at,
  pw_notification_receipts: [{ read_at: row.read_at ?? null }],
  mw_notes: row.note ? { kind: row.note.kind, link: row.note.link ?? "", pinned_until: row.note.pinned_until ?? null, tone: row.note.tone ?? null } : null,
});

describe("the inbox newest first (S8)", () => {
  it("reads the announcements through the person's receipts, by time, newest 100; the unread count apart", async () => {
    fake.answer = q => (q.table === "pw_announcements"
      ? { data: [announcement({ id: id(91), title: "Jadwal berubah", created_at: "2027-01-05T03:20:00Z", note: { kind: "jadwal" } })] }
      : q.table === "pw_notification_receipts" ? { data: [], count: 7 } : answer(q));
    const inbox = await notes.myMainWamNotifications(ME);
    const query = fake.queries.find(q => q.table === "pw_announcements")!;
    expect(callsOf(query, "select")[0][0]).toContain("pw_notification_receipts!inner(read_at)");
    expect(callsOf(query, "eq")).toContainEqual(["pw_notification_receipts.employee_id", ME]);
    expect(callsOf(query, "order")[0]).toEqual(["created_at", { ascending: false }]);
    expect(callsOf(query, "limit")).toEqual([[100]]);
    // No cut of receipts in no order any more (the bug: .limit(1000) then .slice(0, 300)).
    expect(callsOf(query, "in")).toEqual([]);
    expect(inbox).toMatchObject({ unread: 7, migrated: true, items: [{ kind: "jadwal", tone: "warning", fromPraWam: false }] });
    // The list and the count side by side.
    expect(fake.deepest).toBe(1);
  });

  it("before Main WAM's migration: Pra WAM's notes, plainly", async () => {
    fake.answer = q => {
      if (q.table !== "pw_announcements") return { data: [], count: 0 };
      if ((callsOf(q, "select")[0][0] as string).includes("mw_notes")) return { error: { code: "PGRST200", message: "Could not find a relationship between 'pw_announcements' and 'mw_notes' in the schema cache" } };
      return { data: [{ ...announcement({ id: id(92), title: "Selamat datang", created_at: "2026-11-10T00:00:00Z" }), mw_notes: undefined }] };
    };
    const inbox = await notes.myMainWamNotifications(ME);
    expect(inbox.items).toMatchObject([{ title: "Selamat datang", kind: "lain", fromPraWam: true, tone: "info" }]);
  });
});

describe("pinnedForMe: pengumuman penting with a tone", () => {
  const now = new Date("2027-01-04T05:05:00+07:00");

  it("reads the pins on their own (never pushed out by a long inbox), still pinned now, newest first", async () => {
    fake.answer = q => (q.table === "pw_announcements" ? {
      data: [
        announcement({ id: id(81), title: "Jam kumpul berubah", body: "Kumpul 05.30, tadinya 05.45.", created_at: "2027-01-03T21:50:00Z", note: { kind: "pengumuman", pinned_until: "2027-01-04T00:00:00Z" } }),
        announcement({ id: id(82), title: "Team building mulai 15.00 di Lawn", created_at: "2027-01-03T20:00:00Z", note: { kind: "pengumuman", pinned_until: "2027-01-04T08:00:00Z" } }),
        announcement({ id: id(83), title: "Bawa jaket", created_at: "2027-01-03T19:00:00Z", note: { kind: "pengumuman", pinned_until: "2027-01-04T08:00:00Z", tone: "warning" } }),
        // Expired between the query and now: left out.
        announcement({ id: id(84), title: "Lama", created_at: "2027-01-03T18:00:00Z", note: { kind: "pengumuman", pinned_until: "2027-01-03T22:00:00Z" } }),
      ],
    } : answer(q));
    const pinned = await notes.pinnedForMe(ME, now);
    expect(pinned.map(note => [note.title, note.tone])).toEqual([
      ["Jam kumpul berubah", "warning"],
      ["Team building mulai 15.00 di Lawn", "info"],
      ["Bawa jaket", "warning"],
    ]);
    const query = fake.queries.find(q => q.table === "pw_announcements")!;
    expect(callsOf(query, "select")[0][0]).toContain("mw_notes!inner(kind,link,pinned_until,tone)");
    expect(callsOf(query, "eq")).toEqual([["pw_notification_receipts.employee_id", ME], ["mw_notes.kind", "pengumuman"]]);
    expect(callsOf(query, "gt")).toEqual([["mw_notes.pinned_until", now.toISOString()]]);
    expect(callsOf(query, "order")[0]).toEqual(["created_at", { ascending: false }]);
    // Only this query: the inbox is not read for Beranda's banner.
    expect(fake.queries.map(q => q.table)).toEqual(["pw_announcements"]);
  });

  it("fails soft: no banner", async () => {
    fake.answer = () => ({ error: { code: "XX000", message: "down" } });
    expect(await notes.pinnedForMe(ME, now)).toEqual([]);
  });
});

describe("a note's tone is kept", () => {
  it("sendMainWamNote writes the chosen tone (none = the app decides)", async () => {
    const inserts: unknown[] = [];
    fake.answer = q => {
      const insert = callsOf(q, "insert")[0];
      if (insert) inserts.push([q.table, insert[0]]);
      if (q.table === "pw_announcements") return { data: [{ id: id(70) }] };
      return answer(q);
    };
    await notes.sendMainWamNote({ kind: "pengumuman", title: "Bawa jaket", body: "Dingin.", to: { people: [ME], label: "Rani" }, by: id(2), tone: "warning" });
    expect(inserts).toContainEqual(["mw_notes", expect.objectContaining({ kind: "pengumuman", tone: "warning" })]);
  });
});

describe("readers cached per request (R14)", () => {
  it("silentQuestions and awardCategories run once however often a request asks", async () => {
    await Promise.all([read.silentQuestions(), read.silentQuestions(), read.awardCategories(), read.awardCategories(), read.awardCategories(true)]);
    expect(fake.queries.filter(q => q.table === "mw_silent_questions").length).toBe(1);
    // Published only and all are two different reads.
    expect(fake.queries.filter(q => q.table === "mw_award_categories").length).toBe(2);
  });

  it("before the migration: empty and migrated false", async () => {
    fake.answer = () => ({ error: { code: "42P01", message: 'relation "mw_silent_questions" does not exist' } });
    expect(await read.silentQuestions()).toEqual({ data: [], migrated: false });
  });
});

describe("menunggu pembaruan sistem (R13)", () => {
  it("tells the person plainly, and the migration's name only to the server log", () => {
    const warn = spyWarn();
    const error = errors.mwWaiting("202611200401_main_wam_modul.sql");
    expect(error).toMatchObject({ status: 503, message: "Fitur ini menunggu pembaruan sistem. Hubungi tim CoE." });
    expect(error.message).not.toMatch(/2026|\.sql|migrasi/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("202611200401_main_wam_modul.sql"));
    warn.mockRestore();
  });

  it("mwFail says the same for a table that is not there yet", () => {
    const warn = spyWarn();
    expect(() => errors.mwFail({ code: "42P01", message: 'relation "mw_x" does not exist' })).toThrow("Fitur ini menunggu pembaruan sistem. Hubungi tim CoE.");
    warn.mockRestore();
  });
});
