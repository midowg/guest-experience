import { describe, expect, it } from "vitest";
import { claim, item, meeting, person } from "./fixtures";
import { DETAIL_HEAD, NO_ROOM, DETAIL_WIDTHS, detailCells, expandRows, filterRows, recapTitle, rowStatus, spendOf, subtotalOf, summarize, summarySheet } from "./recap";

const rina = person("e1", "Contoh Rina Putri");
const dimas = person("e2", "Contoh Dimas Pratama", "karyawan", "TEE", "Contoh Account Executive");
const andi = person("e3", "Contoh Andi Wijaya", "intern", "CoE");
const settings = { karyawan: 4, ga: 2, intern: 2 };
const done = { employeeId: "e9", label: "Dewi", at: "2026-11-25T02:30:00.000Z" };

const orders = [
  claim("k1", 415, rina, "cafe-latte", { status: "selesai", processed: done, items: [item("k1-a", "klaim", "cafe-latte", { temperature: "es", sugar: "Sedikit", ice: "Ekstra" })] }),
  claim("k2", 416, rina, "americano", { status: "ditolak", rejectNote: "Susu segar sedang habis.", processed: done }),
  claim("k3", 417, rina, "kopi-susu", { orderedAt: "2026-11-25T03:00:00.000Z" }),
  meeting("m1", 112, dimas, [item("a", "tamu", "kopi-susu", { qty: 3 }), item("b", "tim", "americano", { person: andi })], { status: "selesai", processed: done }),
  // "Tambah lagi" sent without a guest count (audit R-1): the meeting still has its five guests.
  meeting("m2", 112, dimas, [item("c", "tamu", "cappuccino", { qty: 2 })], { round: 2, parentId: "m1", guestCount: null }),
  meeting("m3", 113, dimas, [item("d", "tamu", "classic-tea", { qty: 4 })], { status: "ditolak", rejectNote: "Dobel.", guestCount: 9 }),
];
// A guest who gave a name in the menu book (26 Nov): two cups of the same line carry it, the team's drink never does.
const named = meeting("m4", 114, dimas, [item("e", "tamu", "matcha-latte", { qty: 2, guestName: "Budi" }), item("f", "tim", "americano", { person: andi, guestName: "Bukan tamu" })]);

describe("Rekap's rows", () => {
  const rows = expandRows(orders);
  it("make one row per drink: a line of three is three rows", () => {
    expect(rows).toHaveLength(3 + 3 + 1 + 2 + 4);
    expect(rows.filter(row => row.no === "T-0112" && row.kind === "tamu")).toHaveLength(3);
    expect(new Set(rows.map(row => row.key)).size).toBe(rows.length);
  });
  it("record a guest's drink under the PIC and the PIC's BU, a team member's under that person", () => {
    const guest = rows.find(row => row.no === "T-0112" && row.kind === "tamu")!;
    expect(guest).toMatchObject({ name: "Contoh Dimas Pratama", employeeId: "e2", group: "Tamu", bu: "TEE", pic: "Contoh Dimas Pratama", guest: "Contoh PT Sinar", guestCount: 5, room: "Kaliya Limasan", quotaGroup: null });
    const team = rows.find(row => row.kind === "tim")!;
    expect(team).toMatchObject({ name: "Contoh Andi Wijaya", employeeId: "e3", group: "Intern", bu: "CoE", pic: "Contoh Dimas Pratama", guest: "" });
  });
  it("number the claims that count; a refused claim has no Klaim ke-", () => {
    const numbered = expandRows(orders, new Map([["k1", 1], ["k2", 2], ["k3", 2]]));
    expect(numbered.filter(row => row.kind === "klaim").map(row => row.claimNo)).toEqual([1, undefined, 2]);
    expect(expandRows([claim("k9", 1, rina, "espresso", { claimNo: 3 })])[0].claimNo).toBe(3);
  });
  it("fill the 25 columns of the sheet in WIB", () => {
    expect(DETAIL_HEAD).toHaveLength(25);
    expect(DETAIL_HEAD.slice(13, 19)).toEqual(["Minuman", "Suhu", "Gula", "Takaran es", "Harga satuan", "Subtotal"]);
    expect(DETAIL_WIDTHS).toHaveLength(DETAIL_HEAD.length);
    expect(DETAIL_WIDTHS.every(width => width >= 8 && width <= 40)).toBe(true);
    expect(DETAIL_HEAD.slice(8, 12)).toEqual(["PIC", "Tamu/instansi", "Nama tamu", "Jumlah tamu"]);
    const numbered = expandRows(orders, new Map([["k1", 1]]));
    expect(detailCells(numbered[0])).toEqual(["25/11/2026", "09:12", "K-415", "Klaim", "Contoh Rina Putri", "Karyawan", "Contoh Staf", "WNS", "", "", "", "", "", "Café Latte",
      "Es", "Sedikit", "Ekstra", "", "", "Selesai", "", "Dewi", "09:30", "1", ""]);
    const guest = detailCells(rows.find(row => row.kind === "tamu")!);
    expect(guest.slice(3, 19)).toEqual(["Tamu", "Contoh Dimas Pratama", "Tamu", "Contoh Account Executive", "TEE", "Contoh Dimas Pratama", "Contoh PT Sinar", "", "5", "Kaliya Limasan", "Kopi Susu", "Panas", "Normal", "", "", ""]);
    expect(detailCells(rows.find(row => row.kind === "tim")!)[11]).toBe("");
    expect(detailCells({ ...rows[1], manual: true }).slice(19)).toEqual(["Ditolak", "Susu segar sedang habis.", "Dewi", "09:30", "", "Ya"]);
  });
  it("carry the guest's own name on each of that line's cups, find it by a word, and never on a team drink", () => {
    const cups = expandRows([named]);
    expect(cups.map(row => [row.kind, row.guestName])).toEqual([["tamu", "Budi"], ["tamu", "Budi"], ["tim", ""]]);
    expect(detailCells(cups[0]).slice(8, 12)).toEqual(["Contoh Dimas Pratama", "Contoh PT Sinar", "Budi", "5"]);
    expect(detailCells(cups[0])).toHaveLength(DETAIL_HEAD.length);
    expect(filterRows(expandRows([...orders, named]), { q: "budi" }).map(row => row.no)).toEqual(["T-0114", "T-0114"]);
    expect(rows.every(row => row.guestName === "")).toBe(true);
  });
  it("carry the order's id, and word a cancelled record made by hand as Dibatalkan", () => {
    expect(rows.filter(row => row.no === "T-0112" && row.kind === "tamu").map(row => row.orderId)).toEqual(["m1", "m1", "m1"]);
    const [cancelled] = expandRows([claim("k8", 420, rina, "americano", { status: "batal", manual: true, processed: done })]);
    expect(rowStatus(cancelled)).toBe("Dibatalkan");
    expect(detailCells(cancelled).slice(19)).toEqual(["Dibatalkan", "", "Dewi", "09:30", "", "Ya"]);
    expect(cancelled.claimNo).toBeUndefined();
    // The claimant's own cancelling keeps its word.
    expect(rowStatus(expandRows([claim("k7", 421, rina, "americano", { status: "batal" })])[0])).toBe("Batal");
    expect(summarize([cancelled], [rina], settings)).toMatchObject({ total: 0, klaim: 0, people: [{ used: 0 }] });
  });
  it("filter by day, kind, status and a word", () => {
    expect(filterRows(rows, { jenis: "tim" })).toHaveLength(1);
    expect(filterRows(rows, { status: "ditolak" })).toHaveLength(5);
    expect(filterRows(rows, { q: "LIMASAN" })).toHaveLength(10);
    expect(filterRows(rows, { q: "andi" })).toHaveLength(1);
    expect(filterRows(rows, { dari: "2026-11-26" })).toHaveLength(0);
    expect(filterRows(rows, { dari: "2026-11-25", sampai: "2026-11-25", jenis: "klaim", status: "selesai" })).toHaveLength(1);
  });
});

describe("Rekap's summary", () => {
  const rows = expandRows(orders);
  const summary = summarize(rows, [rina, { id: "e4", name: "Contoh Belum Klaim", group: "ga", bu: "WNS" }], settings);
  it("counts only what is being processed or done", () => {
    expect(summary).toMatchObject({ total: 2 + 3 + 1 + 2, klaim: 2, tamu: 5, tim: 1, meetings: 2, refused: 5, waiting: 3 });
    expect(summary.total).toBe(rows.filter(row => row.status === "diproses" || row.status === "selesai").length);
  });
  it("counts a meeting's guests once for its PIC, also over its rounds", () => {
    expect(summary.pics).toEqual([{ pic: "Contoh Dimas Pratama", meetings: 1, guests: 5, drinks: 5, spend: 0 }]);
  });
  it("takes the largest guest count among a meeting's rounds, whichever round comes first", () => {
    const rounds = [
      meeting("r1", 120, dimas, [item("a", "tamu", "kopi-susu")], { guestCount: 2 }),
      meeting("r2", 120, dimas, [item("b", "tamu", "kopi-susu")], { round: 2, parentId: "r1", guestCount: 7 }),
      meeting("r3", 120, dimas, [item("c", "tamu", "kopi-susu")], { round: 3, parentId: "r1", guestCount: null }),
      meeting("s1", 121, dimas, [item("d", "tamu", "kopi-susu")], { guestCount: 3 }),
    ];
    for (const order of [rounds, [...rounds].reverse()]) {
      expect(summarize(expandRows(order), [], settings).pics).toEqual([{ pic: "Contoh Dimas Pratama", meetings: 2, guests: 10, drinks: 4, spend: 0 }]);
    }
  });
  it("lists everyone against their quota, those who have not claimed and those no longer active too", () => {
    expect(summary.people.map(entry => [entry.person.name, entry.used, entry.quota, entry.team, entry.refused])).toEqual([
      ["Contoh Rina Putri", 2, 4, 0, 1], ["Contoh Andi Wijaya", 0, 2, 1, 0], ["Contoh Belum Klaim", 0, 2, 0, 0],
    ]);
  });
  it("adds up per BU and per drink", () => {
    expect(summary.bus).toEqual([{ bu: "TEE", klaim: 0, tamu: 5, tim: 0, spend: 0, total: 5 }, { bu: "WNS", klaim: 2, tamu: 0, tim: 0, spend: 0, total: 2 }, { bu: "CoE", klaim: 0, tamu: 0, tim: 1, spend: 0, total: 1 }]);
    expect(summary.drinks[0]).toEqual({ drink: "Kopi Susu", count: 4, spend: 0 });
    expect(summary.drinks.reduce((sum, drink) => sum + drink.count, 0)).toBe(summary.total);
  });
  it("adds up per Kelompok: people, claims and team drinks, never guests", () => {
    expect(summary.groups).toEqual([
      { group: "karyawan", people: 1, klaim: 2, tim: 0, refused: 1, total: 2, spend: 0 },
      { group: "ga", people: 1, klaim: 0, tim: 0, refused: 0, total: 0, spend: 0 },
      { group: "intern", people: 1, klaim: 0, tim: 1, refused: 0, total: 1, spend: 0 },
    ]);
    expect(summary.groups.reduce((sum, entry) => sum + entry.total, 0)).toBe(summary.klaim + summary.tim);
  });
  it("adds up per Ruangan: meetings, guests once per meeting, guest and team drinks; no room last", () => {
    expect(summary.rooms).toEqual([{ room: "Kaliya Limasan", meetings: 1, guests: 5, tamu: 5, tim: 1, total: 6, spend: 0 }]);
    const more = expandRows([
      ...orders,
      meeting("r1", 130, dimas, [item("x", "tamu", "kopi-susu", { qty: 2 })], { room: "Vasuki Room", guestCount: 2 }),
      meeting("r2", 130, dimas, [item("y", "tamu", "kopi-susu", { qty: 1 })], { room: "Vasuki Room", round: 2, parentId: "r1", guestCount: 6 }),
      meeting("r3", 131, dimas, [item("z", "tamu", "kopi-susu", { qty: 4 })], { room: "", guestCount: 3 }),
    ]);
    const rooms = summarize(more, [], settings).rooms;
    expect(rooms.map(entry => entry.room)).toEqual(["Kaliya Limasan", "Vasuki Room", NO_ROOM]);
    expect(rooms[1]).toEqual({ room: "Vasuki Room", meetings: 1, guests: 6, tamu: 3, tim: 0, total: 3, spend: 0 });
    expect(rooms[2]).toMatchObject({ meetings: 1, guests: 3, tamu: 4 });
    expect(rooms.reduce((sum, entry) => sum + entry.total, 0)).toBe(summarize(more, [], settings).tamu + summarize(more, [], settings).tim);
  });
  it("writes the Ringkasan sheet with numbers as numbers", () => {
    const sheet = summarySheet(summary, "November 2026");
    expect(sheet[0]).toEqual(["Rekap WG Coffee · November 2026"]);
    expect(sheet[1]).toEqual(["Total minuman", 8]);
    expect(sheet).toContainEqual(["Pengeluaran (Rp)", 0]);
    expect(sheet).toContainEqual(["Contoh Rina Putri", "Karyawan", "WNS", 2, 4, 0, 1, 0]);
    expect(sheet).toContainEqual(["Contoh Dimas Pratama", 1, 5, 5, 0]);
  });
  it("titles a whole month by its name, anything else by its days", () => {
    expect(recapTitle("2026-11-01", "2026-11-30")).toBe("November 2026");
    expect(recapTitle("2026-11-03", "2026-11-14")).toBe("3 November 2026 – 14 November 2026");
    expect(recapTitle("2026-11-01", "2026-12-31")).toBe("1 November 2026 – 31 Desember 2026");
    expect(recapTitle("2026-11-25", "2026-11-25")).toBe("25 November 2026");
  });
});

/*
 * F9 (27 Nov 2026): what a drink cost when it was ordered, and Pengeluaran. Only Selesai counts
 * (made by hand too); guests and Tim · rapat count although they use no quota; a done drink with no
 * price adds nothing and is counted as unpriced.
 */
describe("Rekap's money", () => {
  const priced = (order: ReturnType<typeof claim>, price: number | undefined) => ({ ...order, items: order.items.map(line => ({ ...line, ...(price === undefined ? {} : { unitPrice: price }) })) });
  const money = [
    priced(claim("p1", 501, rina, "cafe-latte", { status: "selesai", processed: done }), 8000),
    priced(claim("p2", 502, rina, "espresso", { status: "selesai", processed: done, manual: true }), 8900),
    priced(claim("p3", 503, dimas, "kopi-susu", { status: "diproses" }), 6900),
    priced(claim("p4", 504, dimas, "americano", { status: "ditolak", processed: done, rejectNote: "Habis." }), 8000),
    priced(claim("p5", 505, andi, "classic-tea", { status: "selesai", processed: done }), undefined),
    priced(claim("p6", 506, andi, "americano", { status: "batal", manual: true, processed: done }), 8000),
    priced(meeting("p7", 140, dimas, [item("a", "tamu", "kopi-susu", { qty: 3, unitPrice: 6900 }), item("b", "tim", "americano", { person: andi, unitPrice: 8000 }), item("c", "tamu", "classic-tea", { qty: 2 })], { status: "selesai", processed: done, room: "Vasuki Room" }) as ReturnType<typeof claim>, undefined),
    meeting("p8", 141, dimas, [item("d", "tamu", "kopi-susu", { qty: 2, unitPrice: 6900 })], { status: "diproses", room: "Vasuki Room" }),
  ];
  const rows = expandRows(money);
  const summary = summarize(rows, [rina, dimas, andi].map(who => ({ id: who.id, name: who.name, group: who.group, bu: who.bu })), settings);

  it("carries each drink's price from its order line; a line without one has none", () => {
    expect(rows.filter(row => row.no === "K-501").map(row => row.unitPrice)).toEqual([8000]);
    expect(rows.filter(row => row.no === "K-505").map(row => row.unitPrice)).toEqual([null]);
    expect(rows.filter(row => row.no === "T-0140").map(row => row.unitPrice)).toEqual([6900, 6900, 6900, 8000, null, null]);
  });
  it("counts only Selesai as spent: waiting, refused and cancelled never are, hand records and guests are", () => {
    expect(spendOf(rows.find(row => row.no === "K-501")!)).toBe(8000);
    expect(spendOf(rows.find(row => row.no === "K-502")!)).toBe(8900);
    for (const no of ["K-503", "K-504", "K-506", "T-0141"]) expect(rows.filter(row => row.no === no).map(spendOf)).not.toContain(6900);
    expect(rows.filter(row => ["K-503", "K-504", "K-506", "T-0141"].includes(row.no)).every(row => spendOf(row) === 0)).toBe(true);
    // 8000 + 8900 + (3 guest cups at 6900) + the team's 8000; the two unpriced cups and the unpriced claim add nothing.
    expect(summary.spend).toEqual({ total: 8000 + 8900 + 3 * 6900 + 8000, drinks: 1 + 1 + 1 + 6, unpriced: 3 });
  });
  it("shows a subtotal only for what is spent, and writes both money cells as numbers", () => {
    const first = rows.find(row => row.no === "K-501")!;
    expect(subtotalOf(first)).toBe(8000);
    expect(subtotalOf(rows.find(row => row.no === "K-503")!)).toBeNull();
    expect(subtotalOf(rows.find(row => row.no === "K-505")!)).toBeNull();
    expect(detailCells(first).slice(17, 20)).toEqual([8000, 8000, "Selesai"]);
    const waiting = detailCells(rows.find(row => row.no === "K-503")!);
    expect(waiting.slice(17, 20)).toEqual([6900, "", "Diproses"]);
    expect(detailCells(rows.find(row => row.no === "K-505")!).slice(17, 19)).toEqual(["", ""]);
  });
  it("adds up per person (their own drinks), PIC (guests), BU, drink, Kelompok and Ruangan", () => {
    const of = (name: string) => summary.people.find(entry => entry.person.name.includes(name))!.spend;
    expect(of("Rina")).toBe(8000 + 8900);
    expect(of("Andi")).toBe(8000);
    expect(of("Dimas")).toBe(0);
    expect(summary.pics).toEqual([{ pic: "Contoh Dimas Pratama", meetings: 2, guests: 10, drinks: 7, spend: 3 * 6900 }]);
    expect(summary.bus.map(entry => [entry.bu, entry.spend])).toEqual(expect.arrayContaining([["WNS", 8000 + 8900], ["TEE", 3 * 6900], ["CoE", 8000]]));
    expect(summary.bus.reduce((sum, entry) => sum + entry.spend, 0)).toBe(summary.spend.total);
    expect(summary.drinks.reduce((sum, entry) => sum + entry.spend, 0)).toBe(summary.spend.total);
    expect(summary.drinks.find(entry => entry.drink === "Kopi Susu")!.spend).toBe(3 * 6900);
    expect(summary.groups.map(entry => [entry.group, entry.spend])).toEqual([["karyawan", 8000 + 8900], ["ga", 0], ["intern", 8000]].filter(([group]) => summary.groups.some(entry => entry.group === group)));
    expect(summary.rooms).toEqual([{ room: "Vasuki Room", meetings: 2, guests: 10, tamu: 7, tim: 1, total: 8, spend: 3 * 6900 + 8000 }]);
  });
  it("puts the figures in the Ringkasan sheet as numbers", () => {
    const sheet = summarySheet(summary, "November 2026");
    expect(sheet).toContainEqual(["Pengeluaran (Rp)", summary.spend.total]);
    expect(sheet).toContainEqual(["Selesai tanpa harga (tidak terhitung)", 3]);
    expect(sheet).toContainEqual(["Per PIC", "Rapat", "Tamu (orang)", "Minuman tamu", "Pengeluaran (Rp)"]);
    expect(sheet).toContainEqual(["Kopi Susu", 6, 3 * 6900]);
  });
  it("is zero with nothing priced, and a price of 0 (free) is a price", () => {
    const free = expandRows([priced(claim("z1", 600, rina, "espresso", { status: "selesai", processed: done }), 0)]);
    expect(summarize(free, [], settings).spend).toEqual({ total: 0, drinks: 1, unpriced: 0 });
    expect(summarize(expandRows(orders), [], settings).spend).toEqual({ total: 0, drinks: 1 + 3 + 1, unpriced: 5 });
  });
});
