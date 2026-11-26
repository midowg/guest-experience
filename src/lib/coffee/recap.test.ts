import { describe, expect, it } from "vitest";
import { claim, item, meeting, person } from "./fixtures";
import { DETAIL_HEAD, detailCells, expandRows, filterRows, recapTitle, rowStatus, summarize, summarySheet } from "./recap";

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
  it("fill the 23 columns of the sheet in WIB", () => {
    expect(DETAIL_HEAD).toHaveLength(23);
    expect(DETAIL_HEAD.slice(8, 12)).toEqual(["PIC", "Tamu/instansi", "Nama tamu", "Jumlah tamu"]);
    const numbered = expandRows(orders, new Map([["k1", 1]]));
    expect(detailCells(numbered[0])).toEqual(["25/11/2026", "09:12", "K-415", "Klaim", "Contoh Rina Putri", "Karyawan", "Contoh Staf", "WNS", "", "", "", "", "", "Café Latte",
      "Es", "Sedikit", "Ekstra", "Selesai", "", "Dewi", "09:30", "1", ""]);
    const guest = detailCells(rows.find(row => row.kind === "tamu")!);
    expect(guest.slice(3, 17)).toEqual(["Tamu", "Contoh Dimas Pratama", "Tamu", "Contoh Account Executive", "TEE", "Contoh Dimas Pratama", "Contoh PT Sinar", "", "5", "Kaliya Limasan", "Kopi Susu", "Panas", "Normal", ""]);
    expect(detailCells(rows.find(row => row.kind === "tim")!)[11]).toBe("");
    expect(detailCells({ ...rows[1], manual: true }).slice(17)).toEqual(["Ditolak", "Susu segar sedang habis.", "Dewi", "09:30", "", "Ya"]);
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
    expect(detailCells(cancelled).slice(17)).toEqual(["Dibatalkan", "", "Dewi", "09:30", "", "Ya"]);
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
    expect(summary.pics).toEqual([{ pic: "Contoh Dimas Pratama", meetings: 1, guests: 5, drinks: 5 }]);
  });
  it("takes the largest guest count among a meeting's rounds, whichever round comes first", () => {
    const rounds = [
      meeting("r1", 120, dimas, [item("a", "tamu", "kopi-susu")], { guestCount: 2 }),
      meeting("r2", 120, dimas, [item("b", "tamu", "kopi-susu")], { round: 2, parentId: "r1", guestCount: 7 }),
      meeting("r3", 120, dimas, [item("c", "tamu", "kopi-susu")], { round: 3, parentId: "r1", guestCount: null }),
      meeting("s1", 121, dimas, [item("d", "tamu", "kopi-susu")], { guestCount: 3 }),
    ];
    for (const order of [rounds, [...rounds].reverse()]) {
      expect(summarize(expandRows(order), [], settings).pics).toEqual([{ pic: "Contoh Dimas Pratama", meetings: 2, guests: 10, drinks: 4 }]);
    }
  });
  it("lists everyone against their quota, those who have not claimed and those no longer active too", () => {
    expect(summary.people.map(entry => [entry.person.name, entry.used, entry.quota, entry.team, entry.refused])).toEqual([
      ["Contoh Rina Putri", 2, 4, 0, 1], ["Contoh Andi Wijaya", 0, 2, 1, 0], ["Contoh Belum Klaim", 0, 2, 0, 0],
    ]);
  });
  it("adds up per BU and per drink", () => {
    expect(summary.bus).toEqual([{ bu: "TEE", klaim: 0, tamu: 5, tim: 0, total: 5 }, { bu: "WNS", klaim: 2, tamu: 0, tim: 0, total: 2 }, { bu: "CoE", klaim: 0, tamu: 0, tim: 1, total: 1 }]);
    expect(summary.drinks[0]).toEqual({ drink: "Kopi Susu", count: 4 });
    expect(summary.drinks.reduce((sum, drink) => sum + drink.count, 0)).toBe(summary.total);
  });
  it("writes the Ringkasan sheet with numbers as numbers", () => {
    const sheet = summarySheet(summary, "November 2026");
    expect(sheet[0]).toEqual(["Rekap Werkudara Coffee · November 2026"]);
    expect(sheet[1]).toEqual(["Total minuman", 8]);
    expect(sheet).toContainEqual(["Contoh Rina Putri", "Karyawan", "WNS", 2, 4, 0, 1]);
    expect(sheet).toContainEqual(["Contoh Dimas Pratama", 1, 5, 5]);
  });
  it("titles a whole month by its name, anything else by its days", () => {
    expect(recapTitle("2026-11-01", "2026-11-30")).toBe("November 2026");
    expect(recapTitle("2026-11-03", "2026-11-14")).toBe("3 November 2026 – 14 November 2026");
    expect(recapTitle("2026-11-01", "2026-12-31")).toBe("1 November 2026 – 31 Desember 2026");
    expect(recapTitle("2026-11-25", "2026-11-25")).toBe("25 November 2026");
  });
});
