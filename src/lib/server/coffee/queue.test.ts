import { beforeEach, describe, expect, it, vi } from "vitest";
import { manualSchema } from "@/lib/coffee/schemas";
import { fakeDb, PEOPLE, seedPeople } from "./fake-db";

/* The pengelola's queue against the in-memory stand-in (fake-db.ts). Made-up people. */
let db = fakeDb();
vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => db.client }));

const { cancelManual, finishOrder, queue, recordManual, rejectOrder, reopenOrder, waitingCount, UNDO_WINDOW_SECONDS } = await import("./queue");
const dewi = { employeeId: PEOPLE.dewi, label: "Dewi" };
const raka = { employeeId: null, label: "Super admin" };
const now = new Date("2026-11-25T03:00:00Z");
const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);
const drink = { slug: "cafe-latte", temperature: "panas", sugar: "Normal", ice: "Normal" };
const NOBODY = "00000000-0000-4000-8000-999999999999";
let n = 0;
const key = (value: number) => `cccccccc-cccc-4ccc-8ccc-${String(value).padStart(12, "0")}`;
const claim = async (employee: string, at = "2026-11-25T02:00:00.000Z") => (await db.client.rpc("coffee_submit_claim", { p_employee: employee, p_item: drink, p_at: at, p_manual: false, p_actor: employee, p_actor_label: "Contoh", p_key: key(++n) })).data as string;
const meeting = async () => (await db.client.rpc("coffee_submit_meeting", { p_order: { pic_id: PEOPLE.rina, room: "Vasuki Room", room_spot: "vasuki", actor_id: PEOPLE.bagas, actor_label: "Bagas", ordered_at: "2026-11-25T02:30:00.000Z" }, p_items: [{ for: "tamu", ...drink, qty: 2 }], p_key: key(++n) })).data as string;
const manual = (more: object) => manualSchema.parse({ kind: "klaim", employeeId: PEOPLE.rina, date: "2026-11-24", time: "10:00", ...drink, key: key(++n), ...more });

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

  // Audit: cases that had no test.
  it("puts a meeting order back too, and lets the super admin undo what the super admin processed", async () => {
    const id = await meeting();
    const done = await finishOrder(id, raka, now);
    expect(done).toMatchObject({ kind: "rapat", status: "selesai", undoable: true, processed: { employeeId: null, label: "Super admin" } });
    await expect(reopenOrder(id, dewi, later(10))).rejects.toMatchObject({ status: 409 });
    db.state.now = later(20);
    expect(await reopenOrder(id, raka, later(20))).toMatchObject({ status: "diproses", processed: null, room: "Vasuki Room" });
    expect((await queue(raka, later(20))).waiting.map(order => order.id)).toEqual([id]);
    await rejectOrder(id, "Salah ruangan.", raka, later(30));
    db.state.now = later(40);
    expect(await reopenOrder(id, raka, later(40))).toMatchObject({ status: "diproses", rejectNote: "" });
  });

  // Audit B-3: an order its owner cancelled is not "processed by someone else".
  it("says that the claimant cancelled when Selesai or Tolak comes too late", async () => {
    const id = await claim(PEOPLE.rina);
    await finishOrder(id, dewi, now);
    db.state.now = later(30);
    await reopenOrder(id, dewi, later(30));
    // The claimant cancels after it came back to the queue.
    Object.assign(db.rows("coffee_orders")[0], { status: "batal" });
    const cancelled = { status: 409, message: "Pengajuan ini sudah dibatalkan pemesannya. Antrean diperbarui." };
    await expect(finishOrder(id, dewi, later(40))).rejects.toMatchObject(cancelled);
    await expect(rejectOrder(id, "Terlambat.", dewi, later(40))).rejects.toMatchObject(cancelled);
    await expect(reopenOrder(id, dewi, later(40))).rejects.toMatchObject({ status: 409 });
    expect(db.rows("coffee_orders")[0]).toMatchObject({ status: "batal", processed_at: null });
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

// Audit B-2: sending Catat manual twice.
describe("Catat manual sent twice", () => {
  it("answers with the first record for the same key, whatever is sent the second time", async () => {
    const first = await recordManual(manual({ key: key(900) }), dewi, now);
    const again = await recordManual(manual({ key: key(900), slug: "americano", time: "11:00" }), dewi, later(5));
    expect(again.order.id).toBe(first.order.id);
    expect(again.message).toBe(first.message);
    expect(again.message).toBe("Contoh · Café Latte · klaim ke-1 dari 4.");
    expect(db.rows("coffee_orders")).toHaveLength(1);
    const guest = await recordManual(manual({ kind: "tamu", qty: 3, key: key(901) }), dewi, now);
    const guestAgain = await recordManual(manual({ kind: "tamu", qty: 9, slug: "americano", key: key(901) }), dewi, now);
    expect(guestAgain.order.id).toBe(guest.order.id);
    expect(guestAgain.message).toBe("Tamu · 3× Café Latte · PIC Contoh.");
    expect(db.rows("coffee_orders")).toHaveLength(2);
  });

  it("answers with the first record when both sendings meet at the unique index, never with words about a slug", async () => {
    const claimed = await recordManual(manual({ key: key(900) }), dewi, now);
    const team = await recordManual(manual({ kind: "tim", qty: 2, key: key(901) }), dewi, now);
    db.state.race = true;
    expect(await recordManual(manual({ key: key(900) }), dewi, now)).toMatchObject({ order: { id: claimed.order.id }, message: claimed.message });
    expect(await recordManual(manual({ kind: "tim", qty: 2, key: key(901) }), dewi, now)).toMatchObject({ order: { id: team.order.id }, message: "Tim · rapat · 2× Café Latte · Contoh." });
    expect(db.rows("coffee_orders")).toHaveLength(2);
  });

  it("refuses a key that belongs to another kind of sending, or to a record already cancelled", async () => {
    const reused = { status: 409, message: "Kiriman ini sudah pernah diproses. Muat ulang halaman, lalu kirim lagi bila masih perlu." };
    const id = await claim(PEOPLE.rina);
    const appKey = db.rows("coffee_orders")[0].idempotency_key as string;
    await expect(recordManual(manual({ key: appKey }), dewi, now)).rejects.toMatchObject(reused);
    await expect(recordManual(manual({ kind: "tamu", key: appKey }), dewi, now)).rejects.toMatchObject(reused);
    const { order } = await recordManual(manual({ key: key(900) }), dewi, now);
    await cancelManual(order.id, dewi, now);
    await expect(recordManual(manual({ key: key(900) }), dewi, now)).rejects.toMatchObject(reused);
    db.state.race = true;
    await expect(recordManual(manual({ key: key(900) }), dewi, now)).rejects.toMatchObject({ status: 409 });
    expect(db.rows("coffee_orders").map(row => [row.id === id, row.status])).toEqual([[true, "diproses"], [false, "batal"]]);
  });
});

// Audit B-1 (owner's decision): a pengelola may cancel a record made by hand.
describe("Batalkan catatan", () => {
  it("turns a claim recorded by hand into batal, with who cancelled it and when, and frees its place in the quota", async () => {
    await recordManual(manual({ employeeId: PEOPLE.fajar }), dewi, now);
    const wrong = await recordManual(manual({ employeeId: PEOPLE.fajar, time: "11:00" }), dewi, now);
    await expect(recordManual(manual({ employeeId: PEOPLE.fajar, time: "12:00" }), dewi, now)).rejects.toMatchObject({ status: 409 });
    expect((await queue(dewi, now)).today.selesai).toBe(2);
    db.state.now = later(3600);
    // Another pengelola may cancel it, an hour later: no window, no "only the one who recorded it".
    const { order, message } = await cancelManual(wrong.order.id, raka, later(3600));
    expect(message).toBe("Catatan dibatalkan. Jatah Contoh dikembalikan.");
    expect(order).toMatchObject({ status: "batal", manual: true, undoable: false, used: 1, quota: 2, sentBy: "Dewi", processed: { employeeId: null, label: "Super admin", at: later(3600).toISOString() } });
    expect(order.claimNo).toBeUndefined();
    expect(db.rows("coffee_orders").find(row => row.id === wrong.order.id)).toMatchObject({ status: "batal", created_by: PEOPLE.dewi, created_label: "Dewi", processed_by: null, processed_label: "Super admin" });
    const state = await queue(dewi, later(3600));
    expect(state.today).toEqual({ diproses: 0, selesai: 1, ditolak: 0 });
    expect(state.recent.map(item => item.id)).not.toContain(wrong.order.id);
    // The place is free again.
    expect((await recordManual(manual({ employeeId: PEOPLE.fajar, time: "12:00" }), dewi, later(3600))).order).toMatchObject({ claimNo: 2, used: 2 });
  });

  it("cancels a guest's or a team member's record with all its drinks", async () => {
    const guest = await recordManual(manual({ kind: "tamu", qty: 3, room: "Vasuki Room", guest: "Contoh Bank", guestCount: 4 }), dewi, now);
    const { order, message } = await cancelManual(guest.order.id, dewi, now);
    expect(message).toBe("Catatan dibatalkan.");
    expect(order).toMatchObject({ kind: "rapat", status: "batal", manual: true, processed: { label: "Dewi" } });
    expect(order.items).toMatchObject([{ for: "tamu", qty: 3 }]);
  });

  it("is for records made by hand only, once, and never for an order made in the app", async () => {
    const mine = await claim(PEOPLE.rina);
    const room = await meeting();
    const notManual = { status: 409, message: "Hanya catatan manual yang bisa dibatalkan." };
    await expect(cancelManual(mine, dewi, now)).rejects.toMatchObject(notManual);
    await finishOrder(mine, dewi, now);
    await expect(cancelManual(mine, dewi, now)).rejects.toMatchObject(notManual);
    await expect(cancelManual(room, dewi, now)).rejects.toMatchObject(notManual);
    expect(db.rows("coffee_orders").map(row => row.status)).toEqual(["selesai", "diproses"]);
    const { order } = await recordManual(manual({}), dewi, now);
    await cancelManual(order.id, dewi, now);
    await expect(cancelManual(order.id, dewi, now)).rejects.toMatchObject({ status: 409, message: "Catatan ini sudah dibatalkan." });
    await expect(reopenOrder(order.id, dewi, now)).rejects.toMatchObject({ status: 409 });
    await expect(cancelManual(NOBODY, dewi, now)).rejects.toMatchObject({ status: 404 });
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
  await expect(cancelManual(NOBODY, dewi, now)).rejects.toMatchObject(waits);
});
