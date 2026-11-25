import { beforeEach, describe, expect, it, vi } from "vitest";
import { manualSchema } from "@/lib/coffee/schemas";
import { fakeDb, PEOPLE, seedPeople } from "./fake-db";

/* The pengelola's queue against the in-memory stand-in (fake-db.ts). Made-up people. */
let db = fakeDb();
vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => db.client }));

const { finishOrder, queue, recordManual, rejectOrder, reopenOrder, waitingCount, UNDO_WINDOW_SECONDS } = await import("./queue");
const dewi = { employeeId: PEOPLE.dewi, label: "Dewi" };
const raka = { employeeId: null, label: "Super admin" };
const now = new Date("2026-11-25T03:00:00Z");
const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);
const drink = { slug: "cafe-latte", temperature: "panas", sugar: "Normal", ice: "Normal" };
const NOBODY = "00000000-0000-4000-8000-999999999999";
let n = 0;
const claim = async (employee: string, at = "2026-11-25T02:00:00.000Z") => (await db.client.rpc("coffee_submit_claim", { p_employee: employee, p_item: drink, p_at: at, p_manual: false, p_actor: employee, p_actor_label: "Contoh", p_key: `k${++n}` })).data as string;
const meeting = async () => (await db.client.rpc("coffee_submit_meeting", { p_order: { pic_id: PEOPLE.rina, room: "Vasuki Room", room_spot: "vasuki", actor_id: PEOPLE.bagas, actor_label: "Bagas", ordered_at: "2026-11-25T02:30:00.000Z" }, p_items: [{ for: "tamu", ...drink, qty: 2 }], p_key: `m${++n}` })).data as string;
const manual = (more: object) => manualSchema.parse({ kind: "klaim", employeeId: PEOPLE.rina, date: "2026-11-24", time: "10:00", ...drink, ...more });

beforeEach(() => { db = fakeDb(); seedPeople(db); db.state.now = now; n = 0; });

describe("the queue", () => {
  it("lists what waits, oldest first, with each claim's number and quota", async () => {
    const second = await claim(PEOPLE.rina, "2026-11-25T02:20:00.000Z");
    const first = await claim(PEOPLE.rina, "2026-11-25T02:00:00.000Z");
    const room = await meeting();
    const state = await queue(dewi, now);
    expect(state.waiting.map(order => order.id)).toEqual([first, second, room]);
    expect(state.waiting.map(order => [order.claimNo, order.used, order.quota])).toEqual([[1, 2, 4], [2, 2, 4], [undefined, undefined, undefined]]);
    expect(state.today).toEqual({ diproses: 3, selesai: 0, ditolak: 0 });
    expect(state.recent).toEqual([]);
    expect(await waitingCount()).toBe(3);
  });

  it("marks an order done once: the second press reads that someone else processed it", async () => {
    const id = await claim(PEOPLE.rina);
    const done = await finishOrder(id, dewi, now);
    expect(done).toMatchObject({ status: "selesai", processed: { employeeId: PEOPLE.dewi, label: "Dewi", at: now.toISOString() }, undoable: true, claimNo: 1 });
    await expect(finishOrder(id, raka, later(5))).rejects.toMatchObject({ status: 409, message: "Pesanan ini sudah diproses orang lain. Antrean diperbarui." });
    await expect(rejectOrder(id, "Terlambat.", raka, later(5))).rejects.toMatchObject({ status: 409 });
    expect(db.rows("coffee_orders")[0]).toMatchObject({ status: "selesai", processed_label: "Dewi", reject_note: null });
    await expect(finishOrder(NOBODY, dewi, now)).rejects.toMatchObject({ status: 404 });
  });

  it("refuses with a note, and the claim's place in the quota comes back", async () => {
    const id = await claim(PEOPLE.fajar);
    await claim(PEOPLE.fajar, "2026-11-25T02:10:00.000Z");
    const refused = await rejectOrder(id, "  Susu segar sedang habis. ", raka, now);
    expect(refused).toMatchObject({ status: "ditolak", rejectNote: "Susu segar sedang habis.", processed: { employeeId: null, label: "Super admin" }, used: 1, quota: 2 });
    expect(refused.claimNo).toBeUndefined();
    const state = await queue(raka, later(10));
    expect(state.today).toEqual({ diproses: 1, selesai: 0, ditolak: 1 });
    expect(state.recent.map(order => [order.id, order.undoable])).toEqual([[id, true]]);
    expect((await queue(dewi, later(10))).recent[0].undoable).toBe(false);
  });
});

describe("Urungkan", () => {
  it("puts it back in the queue for the one who processed it, within five minutes", async () => {
    const id = await claim(PEOPLE.rina);
    await rejectOrder(id, "Salah tekan.", dewi, now);
    db.state.now = later(60);
    const back = await reopenOrder(id, dewi, later(60));
    expect(back).toMatchObject({ status: "diproses", processed: null, rejectNote: "", undoable: false, claimNo: 1 });
    expect(UNDO_WINDOW_SECONDS).toBe(300);
  });

  it("is refused for another pengelola, after the window, and for what still waits", async () => {
    const id = await claim(PEOPLE.rina);
    await expect(reopenOrder(id, dewi, now)).rejects.toMatchObject({ status: 409 });
    await finishOrder(id, dewi, now);
    await expect(reopenOrder(id, raka, later(10))).rejects.toMatchObject({ status: 409, message: "Sudah lewat batas waktu untuk mengurungkan." });
    await expect(reopenOrder(id, { employeeId: PEOPLE.dewi, label: "Orang lain" }, later(10))).rejects.toMatchObject({ status: 409 });
    db.state.now = later(301);
    await expect(reopenOrder(id, dewi, later(301))).rejects.toMatchObject({ status: 409 });
    expect((await queue(dewi, later(301))).recent[0].undoable).toBe(false);
    expect(db.rows("coffee_orders")[0].status).toBe("selesai");
    await expect(reopenOrder(NOBODY, dewi, now)).rejects.toMatchObject({ status: 404 });
  });

  it("is refused for a refused claim when the quota filled up meanwhile", async () => {
    const id = await claim(PEOPLE.fajar);
    await rejectOrder(id, "Mesin mati.", dewi, now);
    await claim(PEOPLE.fajar, "2026-11-25T02:40:00.000Z");
    await claim(PEOPLE.fajar, "2026-11-25T02:50:00.000Z");
    await expect(reopenOrder(id, dewi, later(30))).rejects.toMatchObject({ status: 409, message: "Jatah bulan ini sudah habis." });
    expect(db.rows("coffee_orders")[0].status).toBe("ditolak");
  });
});

describe("Catat manual", () => {
  // The made-up people are all called "Contoh ...", so the first name in the messages is "Contoh".
  it("saves a claim as done, marked manual, and counts it in the quota of its own month", async () => {
    const { order, message } = await recordManual(manual({}), dewi, now);
    expect(order).toMatchObject({ status: "selesai", manual: true, undoable: false, claimNo: 1, used: 1, quota: 4, processed: { label: "Dewi" }, orderedAt: "2026-11-24T03:00:00.000Z" });
    expect(message).toBe("Contoh · Café Latte · klaim ke-1 dari 4.");
    await expect(reopenOrder(order.id, dewi, now)).rejects.toMatchObject({ status: 409 });
    const october = await recordManual(manual({ date: "2026-10-31", time: "23:59" }), dewi, now);
    expect(db.rows("coffee_orders").find(row => row.id === october.order.id)).toMatchObject({ quota_month: "2026-10" });
    expect(october.message).toBe("Contoh · Café Latte · klaim ke-1 dari 4.");
  });

  it("is refused when that month's quota is full, and further back than the start of last month", async () => {
    await recordManual(manual({ employeeId: PEOPLE.fajar }), dewi, now);
    await recordManual(manual({ employeeId: PEOPLE.fajar, time: "11:00" }), dewi, now);
    await expect(recordManual(manual({ employeeId: PEOPLE.fajar, time: "12:00" }), dewi, now)).rejects.toMatchObject({ status: 409, message: "Jatah bulan ini sudah habis." });
    await expect(recordManual(manual({ date: "2026-09-30", time: "23:59" }), dewi, now)).rejects.toMatchObject({ status: 422, fieldErrors: { date: ["Catat manual paling lama sampai awal bulan lalu."] } });
    await expect(recordManual(manual({ employeeId: PEOPLE.keluar }), dewi, now)).rejects.toMatchObject({ status: 422 });
  });

  it("records a guest's or a team member's drink as a done meeting order, off the menu too", async () => {
    const guest = await recordManual(manual({ kind: "tamu", qty: 3, room: "Vasuki Room", guest: "Contoh Bank", guestCount: 4, slug: "lainnya", other: "Teh tarik" }), raka, now);
    expect(guest.order).toMatchObject({ kind: "rapat", status: "selesai", manual: true, room: "Vasuki Room", spot: "vasuki", guest: "Contoh Bank", guestCount: 4, person: { id: PEOPLE.rina }, processed: { employeeId: null, label: "Super admin" } });
    expect(guest.order.items).toMatchObject([{ for: "tamu", qty: 3, slug: "lainnya", other: "Teh tarik", person: null }]);
    expect(guest.message).toBe("Tamu · 3× Teh tarik · PIC Contoh.");
    const team = await recordManual(manual({ kind: "tim", employeeId: PEOPLE.fajar, qty: 2 }), dewi, now);
    expect(team.order.items).toMatchObject([{ for: "tim", qty: 2, person: { id: PEOPLE.fajar, group: "intern" } }]);
    expect(team.message).toBe("Tim · rapat · 2× Café Latte · Contoh.");
    expect((await queue(dewi, now)).waiting).toEqual([]);
  });
});

it("answers 503 with the migration's name before it runs", async () => {
  db.state.migrated = false;
  const waits = { status: 503, message: "Werkudara Coffee menunggu migrasi 202612010001_coffee.sql." };
  await expect(queue(dewi, now)).rejects.toMatchObject(waits);
  await expect(waitingCount()).rejects.toMatchObject(waits);
  await expect(finishOrder(NOBODY, dewi, now)).rejects.toMatchObject(waits);
  await expect(rejectOrder(NOBODY, "Catatan.", dewi, now)).rejects.toMatchObject(waits);
  await expect(reopenOrder(NOBODY, dewi, now)).rejects.toMatchObject(waits);
  await expect(recordManual(manual({}), dewi, now)).rejects.toMatchObject(waits);
});
