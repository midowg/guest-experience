import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "../pra-wam/session";
import { fakeDb, PEOPLE, seedPeople } from "./fake-db";

/* An employee's claims against the in-memory stand-in (fake-db.ts). Made-up people. */
let db = fakeDb();
vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => db.client }));
vi.mock("./session", () => ({ holdsCoffeeGrant: async (id: string) => db.rows("admin_grants").some(row => row.employee_id === id && (row.apps as string[]).includes("coffee")) }));

const { cancelClaim, myState, submitClaim } = await import("./claims");
const member = (id: string, nickname: string, category: Member["category"], roles: Member["roles"] = []) => ({ id, name: `Contoh ${nickname}`, nickname, category, roles }) as Member;
const rina = member(PEOPLE.rina, "Rina", "karyawan");
const fajar = member(PEOPLE.fajar, "Fajar", "intern");
const now = new Date("2026-11-25T03:00:00Z");
const key = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
const latte = { slug: "cafe-latte", temperature: "es", sugar: "Sedikit", ice: "Normal" } as const;

beforeEach(() => { db = fakeDb(); seedPeople(db); db.state.now = now; });

describe("a claim", () => {
  it("is saved for the one signed in, as being processed, and takes a place in the quota", async () => {
    const { order, me } = await submitClaim(rina, { ...latte, key: key(1) }, now);
    expect(order).toMatchObject({ no: "K-418", status: "diproses", slug: "cafe-latte", temperature: "es", sugar: "Sedikit", claimNo: 1, manual: false });
    expect(me).toEqual({ id: PEOPLE.rina, name: "Rina", group: "karyawan", quota: 4, used: 1, left: 3, month: "2026-11" });
    expect(db.rows("coffee_orders")[0]).toMatchObject({ employee_id: PEOPLE.rina, person_name: "Contoh Rina Putri", person_group: "karyawan", person_bu: "WNS", created_label: "Rina", quota_month: "2026-11" });
  });

  it("is one claim when the same key is sent twice", async () => {
    const first = await submitClaim(rina, { ...latte, key: key(1) }, now);
    const second = await submitClaim(rina, { ...latte, key: key(1) }, now);
    expect(second.order.id).toBe(first.order.id);
    expect(db.rows("coffee_orders")).toHaveLength(1);
    expect(second.me.used).toBe(1);
  });

  it("is refused with 409 when the month's quota is full, per group", async () => {
    for (let n = 1; n <= 2; n++) await submitClaim(fajar, { ...latte, key: key(n) }, now);
    await expect(submitClaim(fajar, { ...latte, key: key(3) }, now)).rejects.toMatchObject({ status: 409, message: "Jatah bulan ini sudah habis." });
    for (let n = 11; n <= 14; n++) await submitClaim(rina, { ...latte, key: key(n) }, now);
    await expect(submitClaim(rina, { ...latte, key: key(15) }, now)).rejects.toMatchObject({ status: 409 });
    expect(db.rows("coffee_orders")).toHaveLength(6);
  });

  it("follows the quota the pengelola set, and a new WIB month starts again", async () => {
    db.rows("coffee_settings")[0].quota_intern = 1;
    await submitClaim(fajar, { ...latte, key: key(1) }, now);
    await expect(submitClaim(fajar, { ...latte, key: key(2) }, now)).rejects.toMatchObject({ status: 409 });
    // 30 Nov 17.00 UTC is 1 Dec 00.00 WIB.
    const december = new Date("2026-11-30T17:00:00Z");
    db.state.now = december;
    const { me } = await submitClaim(fajar, { ...latte, key: key(3) }, december);
    expect(me).toMatchObject({ month: "2026-12", used: 1, left: 0 });
  });

  it("gives its place back when refused or cancelled, and keeps numbering right", async () => {
    const a = await submitClaim(fajar, { ...latte, key: key(1) }, new Date("2026-11-25T01:00:00Z"));
    const b = await submitClaim(fajar, { ...latte, key: key(2) }, new Date("2026-11-25T02:00:00Z"));
    Object.assign(db.rows("coffee_orders").find(row => row.id === a.order.id)!, { status: "ditolak", reject_note: "Susu habis.", processed_label: "Dewi", processed_at: "2026-11-25T02:30:00.000Z" });
    const state = await myState(fajar, now);
    expect(state.me).toMatchObject({ used: 1, left: 1 });
    expect(state.orders.map(order => [order.id, order.status, order.claimNo])).toEqual([[b.order.id, "diproses", 1], [a.order.id, "ditolak", undefined]]);
    expect(state.orders[1]).toMatchObject({ rejectNote: "Susu habis.", processedLabel: "Dewi" });
    const c = await submitClaim(fajar, { ...latte, key: key(3) }, now);
    expect(c.order.claimNo).toBe(2);
  });

  // Audit: the 23505 branch was never run (the stand-in had no unique index).
  it("is one claim when two sendings of one key meet at the unique index", async () => {
    const first = await submitClaim(rina, { ...latte, key: key(1) }, now);
    db.state.race = true;
    const second = await submitClaim(rina, { ...latte, key: key(1) }, now);
    expect(second.order.id).toBe(first.order.id);
    expect(db.rows("coffee_orders")).toHaveLength(1);
  });

  // Audit S-2: a key belongs to one sending of one person.
  it("never answers with someone else's claim, nor with one already cancelled, for a key used before", async () => {
    const { order } = await submitClaim(rina, { ...latte, key: key(1) }, now);
    const reused = { status: 409, message: "Kiriman ini sudah pernah diproses. Muat ulang halaman, lalu kirim lagi bila masih perlu." };
    await expect(submitClaim(fajar, { ...latte, key: key(1) }, now)).rejects.toMatchObject(reused);
    db.state.race = true;
    const raced = await submitClaim(fajar, { ...latte, key: key(1) }, now).catch((problem: unknown) => problem);
    expect(raced).toMatchObject({ status: 409 });
    expect(JSON.stringify(raced)).not.toContain("Rina");
    db.state.race = false;
    await cancelClaim(rina, order.id, now);
    await expect(submitClaim(rina, { ...latte, key: key(1) }, now)).rejects.toMatchObject(reused);
    expect(db.rows("coffee_orders")).toHaveLength(1);
    expect((await myState(rina, now)).me.used).toBe(0);
  });

  it("is refused by the database when its time lies ahead, or its drink is off the menu", async () => {
    await expect(submitClaim(rina, { ...latte, key: key(1) }, new Date(now.getTime() + 6 * 60_000))).rejects.toMatchObject({ status: 422, message: "Isian pesanan tidak sesuai. Muat ulang halaman lalu coba lagi." });
    // "lainnya" is for Catat manual only (audit S-6): the function refuses it even when zod is not in front.
    const sent = await db.client.rpc("coffee_submit_claim", { p_employee: PEOPLE.rina, p_item: { slug: "lainnya", other: "Teh tarik", temperature: "panas", sugar: "Normal" }, p_at: now.toISOString(), p_manual: false, p_actor: PEOPLE.rina, p_actor_label: "Rina", p_key: key(2) });
    expect(sent.error).toMatchObject({ message: "COFFEE_INVALID" });
    expect(db.rows("coffee_orders")).toHaveLength(0);
  });

  it("is refused for someone no longer active", async () => {
    await expect(submitClaim(member(PEOPLE.keluar, "Keluar", "karyawan"), { ...latte, key: key(1) }, now)).rejects.toMatchObject({ status: 422 });
  });
});

describe("cancelling", () => {
  it("lets the owner cancel a waiting claim, once", async () => {
    const { order } = await submitClaim(rina, { ...latte, key: key(1) }, now);
    const cancelled = await cancelClaim(rina, order.id, now);
    expect(cancelled.order).toMatchObject({ status: "batal" });
    expect(cancelled.order.claimNo).toBeUndefined();
    expect(cancelled.me).toMatchObject({ used: 0, left: 4 });
    await expect(cancelClaim(rina, order.id, now)).rejects.toMatchObject({ status: 409, message: "Pengajuan ini sudah diproses, tidak bisa dibatalkan." });
  });

  it("never cancels someone else's claim, nor one already processed", async () => {
    const { order } = await submitClaim(rina, { ...latte, key: key(1) }, now);
    await expect(cancelClaim(fajar, order.id, now)).rejects.toMatchObject({ status: 409 });
    expect(db.rows("coffee_orders")[0].status).toBe("diproses");
    db.rows("coffee_orders")[0].status = "selesai";
    await expect(cancelClaim(rina, order.id, now)).rejects.toMatchObject({ status: 409 });
    expect(db.rows("coffee_orders")[0].status).toBe("selesai");
  });
});

describe("what the phone is told", () => {
  it("offers Mode GA and Pengelola only to those who may open them", async () => {
    expect(await myState(rina, now)).toMatchObject({ ga: false, pengelola: false, orders: [] });
    expect(await myState(member(PEOPLE.bagas, "Bagas", "dw"), now)).toMatchObject({ ga: true, pengelola: false, me: { group: "ga", quota: 2 } });
    expect(await myState(member(PEOPLE.rina, "Rina", "karyawan", ["ga"]), now)).toMatchObject({ ga: true, pengelola: false });
    expect(await myState(member(PEOPLE.dewi, "Dewi", "karyawan"), now)).toMatchObject({ ga: true, pengelola: true });
  });

  it("shows only the person's own claims, never a meeting order", async () => {
    await submitClaim(rina, { ...latte, key: key(1) }, now);
    await submitClaim(fajar, { ...latte, key: key(2) }, now);
    db.rows("coffee_orders").push({ ...db.rows("coffee_orders")[0], id: "m1", kind: "rapat", number: 113 });
    const state = await myState(rina, now);
    expect(state.orders).toHaveLength(1);
    expect(JSON.stringify(state)).not.toContain("Fajar");
  });

  it("answers 503 with the migration's name before it runs", async () => {
    db.state.migrated = false;
    await expect(myState(rina, now)).rejects.toMatchObject({ status: 503, message: "Werkudara Coffee menunggu migrasi 202612010001_coffee.sql." });
    await expect(submitClaim(rina, { ...latte, key: key(1) }, now)).rejects.toMatchObject({ status: 503 });
    await expect(cancelClaim(rina, key(9), now)).rejects.toMatchObject({ status: 503 });
  });
});
