import { beforeEach, describe, expect, it, vi } from "vitest";
import { meetingSchema } from "@/lib/coffee/schemas";
import type { Member } from "../pra-wam/session";
import { fakeDb, PEOPLE, seedPeople } from "./fake-db";

/* Mode GA's meeting orders against the in-memory stand-in (fake-db.ts). Made-up people. */
let db = fakeDb();
vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => db.client }));

const { gaState, submitMeeting } = await import("./meetings");
const bagas = { id: PEOPLE.bagas, name: "Contoh Bagas Saputra", nickname: "Bagas", category: "dw", roles: [] } as unknown as Member;
const now = new Date("2026-11-25T03:00:00Z");
const key = (n: number) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, "0")}`;
const drink = { slug: "kopi-susu", temperature: "panas", sugar: "Normal", ice: "Normal" } as const;
const order = (n: number, more: object = {}) => meetingSchema.parse({
  room: "Kaliya Limasan", picId: PEOPLE.rina, guest: "Contoh PT Sinar", guestCount: 5, key: key(n),
  items: [{ for: "tamu" as const, ...drink, qty: 3 }, { for: "tim" as const, personId: PEOPLE.fajar, ...drink, slug: "americano", qty: 1 }], ...more,
});

beforeEach(() => { db = fakeDb(); seedPeople(db); db.state.now = now; });

describe("a meeting order", () => {
  it("is one order with all its drinks, under the PIC, with no quota", async () => {
    const { order: sent } = await submitMeeting(bagas, order(1), now);
    expect(sent).toMatchObject({ no: "T-0113", round: 1, room: "Kaliya Limasan", spot: "limasan", guest: "Contoh PT Sinar", guestCount: 5, status: "diproses", sentBy: "Bagas", pic: { id: PEOPLE.rina, name: "Contoh Rina Putri" } });
    expect(sent.items.map(item => [item.for, item.qty, item.slug, item.person?.name ?? null])).toEqual([["tamu", 3, "kopi-susu", null], ["tim", 1, "americano", "Contoh Fajar Nugroho"]]);
    expect(sent.items[1].person).toMatchObject({ group: "intern", bu: "CoE" });
    expect(db.rows("coffee_orders")[0]).toMatchObject({ kind: "rapat", employee_id: PEOPLE.rina, person_bu: "WNS", created_by: PEOPLE.bagas });
    // The intern's quota of two is untouched by sixty team drinks.
    for (let n = 2; n <= 4; n++) await submitMeeting(bagas, order(n, { items: [{ for: "tim" as const, personId: PEOPLE.fajar, ...drink, qty: 20 }] }), now);
    expect(db.rows("coffee_orders")).toHaveLength(4);
  });

  it("keeps the number and takes the next round for Tambah lagi", async () => {
    const first = await submitMeeting(bagas, order(1), now);
    const second = await submitMeeting(bagas, order(2, { parentId: first.order.id }), now);
    const third = await submitMeeting(bagas, order(3, { parentId: second.order.id }), now);
    expect([second.order.no, third.order.no]).toEqual(["T-0113-2", "T-0113-3"]);
    expect([second.order.parentId, third.order.parentId]).toEqual([first.order.id, first.order.id]);
    expect((await submitMeeting(bagas, order(4), now)).order.no).toBe("T-0114");
    await expect(submitMeeting(bagas, order(5, { parentId: key(99) }), now)).rejects.toMatchObject({ status: 404 });
  });

  it("is one order when the same key is sent twice", async () => {
    const first = await submitMeeting(bagas, order(1), now);
    const again = await submitMeeting(bagas, order(1), now);
    expect(again.order.id).toBe(first.order.id);
    expect(db.rows("coffee_orders")).toHaveLength(1);
  });

  it("needs an active PIC and active team members; a typed room has no spot", async () => {
    await expect(submitMeeting(bagas, order(1, { picId: PEOPLE.keluar }), now)).rejects.toMatchObject({ status: 422, message: "Karyawan tidak ditemukan atau sudah tidak aktif." });
    await expect(submitMeeting(bagas, order(2, { items: [{ for: "tim" as const, personId: PEOPLE.keluar, ...drink, qty: 1 }] }), now)).rejects.toMatchObject({ status: 422 });
    expect(db.rows("coffee_orders")).toHaveLength(0);
    const typed = await submitMeeting(bagas, order(3, { room: "Teras belakang", guest: undefined, guestCount: undefined }), now);
    expect(typed.order).toMatchObject({ room: "Teras belakang", spot: null, guest: "", guestCount: null });
  });
});

describe("the tablet's home", () => {
  it("shows today's meeting orders (WIB), the active people and the rooms, and no claims", async () => {
    await submitMeeting(bagas, order(1), now);
    await submitMeeting(bagas, order(2), new Date("2026-11-24T16:59:00Z"));
    db.rows("coffee_orders").push({ ...db.rows("coffee_orders")[0], id: "k1", kind: "klaim" });
    const state = await gaState(bagas, now);
    expect(state.today.map(item => item.no)).toEqual(["T-0113"]);
    expect(state.people.map(person => person.name)).toEqual(["Contoh Bagas Saputra", "Contoh Dewi Lestari", "Contoh Fajar Nugroho", "Contoh Rina Putri"]);
    expect(Object.keys(state.people[0]).sort()).toEqual(["bu", "id", "name", "position"]);
    expect(state.rooms.map(room => room.spot)).toEqual(["ananta", "limasan", "vasuki", "communal"]);
  });

  it("answers 503 with the migration's name before it runs", async () => {
    db.state.migrated = false;
    await expect(gaState(bagas, now)).rejects.toMatchObject({ status: 503, message: expect.stringContaining("202612010001_coffee.sql") });
    await expect(submitMeeting(bagas, order(1), now)).rejects.toMatchObject({ status: 503 });
  });
});
