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

  // Audit S-1: the PIC, room, guest and guest count of a next round are the first round's, whatever is sent.
  it("takes the PIC, room, guest and count of Tambah lagi from the first round, not from the sender", async () => {
    const first = await submitMeeting(bagas, order(1), now);
    const second = await submitMeeting(bagas, order(2, { parentId: first.order.id, picId: PEOPLE.dewi, room: "Vasuki Room", guest: "Contoh Orang Lain", guestCount: 99 }), now);
    expect(second.order).toMatchObject({ no: "T-0113-2", room: "Kaliya Limasan", spot: "limasan", guest: "Contoh PT Sinar", guestCount: 5, pic: { id: PEOPLE.rina, name: "Contoh Rina Putri" } });
    expect(db.rows("coffee_orders")[1]).toMatchObject({ employee_id: PEOPLE.rina, person_bu: "WNS", person_group: "karyawan", room_spot: "limasan" });
    // Sent without a guest count, and with a PIC who has left meanwhile: still the first round's.
    const third = await submitMeeting(bagas, order(3, { parentId: second.order.id, picId: PEOPLE.keluar, guest: undefined, guestCount: undefined }), now);
    expect(third.order).toMatchObject({ no: "T-0113-3", guest: "Contoh PT Sinar", guestCount: 5, pic: { id: PEOPLE.rina } });
  });

  it("refuses Tambah lagi on a meeting that was refused, is not of today, or is not a meeting order from the tablet", async () => {
    const closed = { status: 409, message: "Pesanan awal sudah tidak bisa ditambah. Buat pesanan baru." };
    const first = await submitMeeting(bagas, order(1), now);
    const second = await submitMeeting(bagas, order(2, { parentId: first.order.id }), now);
    Object.assign(db.rows("coffee_orders")[0], { status: "ditolak", reject_note: "Dobel." });
    await expect(submitMeeting(bagas, order(3, { parentId: first.order.id }), now)).rejects.toMatchObject(closed);
    // The round asked for is fine, but its first round is the refused one.
    await expect(submitMeeting(bagas, order(4, { parentId: second.order.id }), now)).rejects.toMatchObject(closed);
    Object.assign(db.rows("coffee_orders")[0], { status: "selesai", reject_note: null });
    expect((await submitMeeting(bagas, order(5, { parentId: first.order.id }), now)).order.no).toBe("T-0113-3");
    // 25 Nov 17.00 UTC is 26 Nov 00.00 WIB: yesterday's meeting, and last month's, take no more rounds.
    const tomorrow = new Date("2026-11-25T17:00:00Z");
    db.state.now = tomorrow;
    await expect(submitMeeting(bagas, order(6, { parentId: first.order.id }), tomorrow)).rejects.toMatchObject(closed);
    db.state.now = new Date("2026-12-20T03:00:00Z");
    await expect(submitMeeting(bagas, order(7, { parentId: first.order.id }), db.state.now)).rejects.toMatchObject(closed);
    db.state.now = now;
    // A record made by hand, and a claim, are not meetings to add to.
    Object.assign(db.rows("coffee_orders")[0], { manual: true });
    await expect(submitMeeting(bagas, order(8, { parentId: first.order.id }), now)).rejects.toMatchObject(closed);
    Object.assign(db.rows("coffee_orders")[0], { manual: false, kind: "klaim" });
    await expect(submitMeeting(bagas, order(9, { parentId: first.order.id }), now)).rejects.toMatchObject({ status: 404 });
    expect(db.rows("coffee_orders")).toHaveLength(3);
  });

  it("is one order when the same key is sent twice", async () => {
    const first = await submitMeeting(bagas, order(1), now);
    const again = await submitMeeting(bagas, order(1), now);
    expect(again.order.id).toBe(first.order.id);
    expect(db.rows("coffee_orders")).toHaveLength(1);
  });

  it("is one order when two sendings of one key meet at the unique index, and a key of another kind is refused", async () => {
    const first = await submitMeeting(bagas, order(1), now);
    db.state.race = true;
    expect((await submitMeeting(bagas, order(1), now)).order.id).toBe(first.order.id);
    expect(db.rows("coffee_orders")).toHaveLength(1);
    db.state.race = false;
    await db.client.rpc("coffee_submit_claim", { p_employee: PEOPLE.rina, p_item: drink, p_at: now.toISOString(), p_manual: false, p_actor: PEOPLE.rina, p_actor_label: "Rina", p_key: key(2) });
    await expect(submitMeeting(bagas, order(2), now)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("sudah pernah diproses") });
    db.state.race = true;
    await expect(submitMeeting(bagas, order(2), now)).rejects.toMatchObject({ status: 409 });
    expect(db.rows("coffee_orders").filter(row => row.kind === "rapat")).toHaveLength(1);
  });

  it("is refused by the database when its time lies ahead", async () => {
    await expect(submitMeeting(bagas, order(1), new Date(now.getTime() + 6 * 60_000))).rejects.toMatchObject({ status: 422, message: "Isian pesanan tidak sesuai. Muat ulang halaman lalu coba lagi." });
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
