import { GROUP_LABEL, drinkName } from "./menu";
import { countsForQuota, nextDay, wibClock, wibDay } from "./quota";
import { KIND_LABEL, STATUS_LABEL, type CoffeeSettings, type ItemFor, type QueueOrder, type QuotaGroup, type RecapRow, type Status } from "./types";

/*
 * Rekap (25 Nov 2026): one row per drink, and the summary HR reads at the end of the month. A
 * guest's drink is recorded under the meeting's PIC and the PIC's BU; a team member's under that
 * person; neither touches a quota. Only drinks being processed or done are counted in the totals.
 * Moved from the approved prototype (PengelolaPrototype.tsx). Pure, so it is tested without a server.
 */

/** One row per drink: a line of three is three rows. `numbers`: "Klaim ke-" worked out over whole months. */
export function expandRows(orders: QueueOrder[], numbers?: Map<string, number>): RecapRow[] {
  const rows: RecapRow[] = [];
  for (const order of orders) {
    const shared = {
      orderId: order.id, at: order.orderedAt, no: order.no, status: order.status, reason: order.rejectNote,
      doneBy: order.processed?.label ?? "", doneAt: order.processed?.at ?? "", manual: order.manual,
    };
    for (const item of order.items) {
      const drink = { drink: drinkName(item), temperature: item.temperature, sugar: item.sugar, ice: item.ice };
      if (order.kind === "klaim") {
        const claimNo = countsForQuota(order.status) ? numbers?.get(order.id) ?? order.claimNo : undefined;
        rows.push({
          ...shared, ...drink, key: `${order.id}:${item.id}`, kind: "klaim", employeeId: order.person.id, name: order.person.name,
          group: order.person.group ? GROUP_LABEL[order.person.group] : "—", quotaGroup: order.person.group,
          position: order.person.position, bu: order.person.bu, pic: "", guest: "", guestName: "", guestCount: null, room: "", claimNo,
        });
        continue;
      }
      const team = item.for === "tim";
      const person = team ? item.person : order.person;
      for (let index = 0; index < item.qty; index++) rows.push({
        ...shared, ...drink, key: `${order.id}:${item.id}:${index}`, kind: team ? "tim" : "tamu", employeeId: person?.id ?? null, name: person?.name ?? "—",
        group: team ? (person?.group ? GROUP_LABEL[person.group] : "—") : "Tamu", quotaGroup: team ? person?.group ?? null : null,
        position: person?.position || "—", bu: person?.bu || "—", pic: order.person.name,
        guest: team ? "" : order.guest, guestName: team ? "" : item.guestName ?? "", guestCount: order.guestCount, room: order.room,
      });
    }
  }
  return rows;
}

export const DETAIL_HEAD = ["Tanggal", "Jam diajukan", "Nomor pesanan", "Jenis", "Nama", "Kelompok", "Jabatan", "BU", "PIC", "Tamu/instansi", "Nama tamu", "Jumlah tamu", "Ruangan",
  "Minuman", "Suhu", "Gula", "Takaran es", "Status", "Catatan tolak", "Diproses oleh", "Jam diproses", "Klaim ke-", "Dicatat manual"] as const;
/**
 * The Detail sheet's column widths, by column name (audit F5-08: a list of numbers beside the head
 * fell one short when "Nama tamu" was added, and every width after it slid one column to the left).
 * A column added to DETAIL_HEAD without a width here does not compile.
 */
const DETAIL_WIDTH: Record<(typeof DETAIL_HEAD)[number], number> = {
  "Tanggal": 12, "Jam diajukan": 10, "Nomor pesanan": 12, "Jenis": 12, "Nama": 26, "Kelompok": 12, "Jabatan": 26, "BU": 10, "PIC": 26, "Tamu/instansi": 24, "Nama tamu": 18,
  "Jumlah tamu": 10, "Ruangan": 20, "Minuman": 24, "Suhu": 8, "Gula": 10, "Takaran es": 10, "Status": 10, "Catatan tolak": 30, "Diproses oleh": 16, "Jam diproses": 10,
  "Klaim ke-": 8, "Dicatat manual": 10,
};
export const DETAIL_WIDTHS: number[] = DETAIL_HEAD.map(name => DETAIL_WIDTH[name]);

const sheetDate = (iso: string) => wibDay(iso).split("-").reverse().join("/");
/** The status as Rekap words it: a record made by hand and cancelled by a pengelola reads "Dibatalkan". */
export const rowStatus = (row: Pick<RecapRow, "status" | "manual">): string => row.status === "batal" && row.manual ? "Dibatalkan" : STATUS_LABEL[row.status];
/** Suhu and Takaran es as the table and the files write them; empty when the option was not asked (F6). */
export const temperatureCell = (row: Pick<RecapRow, "temperature">): string => row.temperature === "es" ? "Es" : row.temperature === "panas" ? "Panas" : "";
export const iceCell = (row: Pick<RecapRow, "temperature" | "ice">): string => row.temperature === "es" && row.ice ? row.ice : "";
/** A row's 23 cells, in DETAIL_HEAD's order: the table, the .csv and the .xlsx all show these. */
export const detailCells = (row: RecapRow): string[] => [
  sheetDate(row.at), wibClock(row.at), row.no, KIND_LABEL[row.kind], row.name, row.group, row.position, row.bu,
  row.pic, row.guest, row.guestName, row.guestCount && row.kind === "tamu" ? String(row.guestCount) : "", row.room, row.drink,
  temperatureCell(row), row.sugar ?? "", iceCell(row), rowStatus(row), row.reason,
  row.doneBy, row.doneAt ? wibClock(row.doneAt) : "", row.claimNo ? String(row.claimNo) : "", row.manual ? "Ya" : "",
];

export type RecapFilter = { dari?: string; sampai?: string; jenis?: ItemFor; status?: Status; q?: string };
/** Rekap's filters: a span of WIB days, the kind, the status, and a word found anywhere a person would look. */
export function filterRows(rows: RecapRow[], filter: RecapFilter): RecapRow[] {
  const word = filter.q?.trim().toLowerCase();
  return rows.filter(row => {
    const day = wibDay(row.at);
    if (filter.dari && day < filter.dari) return false;
    if (filter.sampai && day > filter.sampai) return false;
    if (filter.jenis && row.kind !== filter.jenis) return false;
    if (filter.status && row.status !== filter.status) return false;
    return !word || [row.name, row.pic, row.guest, row.guestName, row.room, row.drink, row.no, row.bu, row.position].some(text => text.toLowerCase().includes(word));
  });
}

/** A meeting's rounds ("T-0113", "T-0113-2") are one meeting. */
const meetingOf = (no: string) => no.replace(/^(T-\d+)-\d+$/, "$1");

/** The name Per ruangan gives a meeting order that carries no room. */
export const NO_ROOM = "Tanpa ruangan";
export type RecapPerson = { id: string; name: string; group: QuotaGroup; bu: string };
export type RecapSummary = ReturnType<typeof summarize>;

/**
 * The summary of a set of rows: totals, per person (against their monthly quota), per PIC (guests
 * counted once per meeting), per BU and per drink. `people`: the active employees, so someone who
 * has not claimed yet still shows with zero; a person in the rows who is no longer active is added.
 */
export function summarize(rows: RecapRow[], people: RecapPerson[], settings: CoffeeSettings) {
  const live = rows.filter(row => countsForQuota(row.status));
  const by = (kind: ItemFor) => live.filter(row => row.kind === kind).length;
  const known = new Map(people.map(person => [person.id, person]));
  for (const row of rows) {
    if (row.kind !== "tamu" && row.employeeId && row.quotaGroup && !known.has(row.employeeId)) known.set(row.employeeId, { id: row.employeeId, name: row.name, group: row.quotaGroup, bu: row.bu });
  }
  const perPerson = [...known.values()].map(person => {
    const mine = rows.filter(row => row.employeeId === person.id);
    return {
      person, quota: settings[person.group],
      used: mine.filter(row => row.kind === "klaim" && countsForQuota(row.status)).length,
      team: mine.filter(row => row.kind === "tim" && countsForQuota(row.status)).length,
      refused: mine.filter(row => row.kind === "klaim" && row.status === "ditolak").length,
    };
  }).sort((a, b) => b.used / Math.max(b.quota, 1) - a.used / Math.max(a.quota, 1) || a.person.name.localeCompare(b.person.name, "id"));

  // A meeting's guests are counted once: the largest count among its rounds (a later round may carry none).
  const picMap = new Map<string, { pic: string; meetings: Map<string, number>; drinks: number }>();
  for (const row of live.filter(row => row.kind === "tamu")) {
    const key = row.employeeId ?? row.pic;
    const entry = picMap.get(key) ?? { pic: row.pic, meetings: new Map<string, number>(), drinks: 0 };
    const meeting = meetingOf(row.no);
    entry.meetings.set(meeting, Math.max(entry.meetings.get(meeting) ?? 0, row.guestCount ?? 0));
    entry.drinks += 1;
    picMap.set(key, entry);
  }
  const pics = [...picMap.values()].map(entry => ({ pic: entry.pic, meetings: entry.meetings.size, guests: [...entry.meetings.values()].reduce((sum, count) => sum + count, 0), drinks: entry.drinks }))
    .sort((a, b) => b.drinks - a.drinks || a.pic.localeCompare(b.pic, "id"));

  const buMap = new Map<string, Record<ItemFor, number>>();
  for (const row of live) {
    const entry = buMap.get(row.bu) ?? { klaim: 0, tamu: 0, tim: 0 };
    entry[row.kind] += 1;
    buMap.set(row.bu, entry);
  }
  const bus = [...buMap].map(([bu, entry]) => ({ bu, ...entry, total: entry.klaim + entry.tamu + entry.tim })).sort((a, b) => b.total - a.total || a.bu.localeCompare(b.bu, "id"));

  const drinkMap = new Map<string, number>();
  for (const row of live) drinkMap.set(row.drink, (drinkMap.get(row.drink) ?? 0) + 1);
  const drinks = [...drinkMap].map(([drink, count]) => ({ drink, count })).sort((a, b) => b.count - a.count || a.drink.localeCompare(b.drink, "id"));

  // Per Kelompok (Karyawan, Tim GA, Intern): the people in it and what they claimed; guests belong to no group.
  const groups = (Object.keys(GROUP_LABEL) as QuotaGroup[]).map(group => {
    const members = perPerson.filter(entry => entry.person.group === group);
    const klaim = members.reduce((sum, entry) => sum + entry.used, 0), tim = members.reduce((sum, entry) => sum + entry.team, 0);
    return { group, people: members.length, klaim, tim, refused: members.reduce((sum, entry) => sum + entry.refused, 0), total: klaim + tim };
  }).filter(entry => entry.people > 0);

  // Per Ruangan: the meeting orders (guests and team) by the room they were ordered for; guests once per meeting like the PIC.
  const roomMap = new Map<string, { meetings: Map<string, number>; tamu: number; tim: number }>();
  for (const row of live.filter(row => row.kind !== "klaim")) {
    const room = row.room.trim() || NO_ROOM;
    const entry = roomMap.get(room) ?? { meetings: new Map<string, number>(), tamu: 0, tim: 0 };
    const meeting = meetingOf(row.no);
    entry.meetings.set(meeting, Math.max(entry.meetings.get(meeting) ?? 0, row.kind === "tamu" ? row.guestCount ?? 0 : 0));
    entry[row.kind === "tamu" ? "tamu" : "tim"] += 1;
    roomMap.set(room, entry);
  }
  const rooms = [...roomMap].map(([room, entry]) => ({
    room, meetings: entry.meetings.size, guests: [...entry.meetings.values()].reduce((sum, count) => sum + count, 0), tamu: entry.tamu, tim: entry.tim, total: entry.tamu + entry.tim,
  })).sort((a, b) => (a.room === NO_ROOM ? 1 : 0) - (b.room === NO_ROOM ? 1 : 0) || b.total - a.total || a.room.localeCompare(b.room, "id"));

  return {
    total: live.length, klaim: by("klaim"), tamu: by("tamu"), tim: by("tim"),
    meetings: new Set(rows.filter(row => row.kind !== "klaim").map(row => meetingOf(row.no))).size,
    refused: rows.filter(row => row.status === "ditolak").length, waiting: rows.filter(row => row.status === "diproses").length,
    people: perPerson, pics, bus, drinks, groups, rooms,
  };
}

/** The Ringkasan sheet of the .xlsx: the same numbers as the screen; counts are number cells. */
export function summarySheet(summary: RecapSummary, title: string): (string | number)[][] {
  return [
    [`Rekap WG Coffee · ${title}`],
    ["Total minuman", summary.total], ["Klaim", summary.klaim], ["Tamu", summary.tamu],
    ["Tim · rapat", summary.tim], ["Ditolak", summary.refused], [],
    ["Per orang", "Kelompok", "BU", "Klaim terpakai", "Jatah", "Tim · rapat", "Ditolak"],
    ...summary.people.map(({ person, quota, used, team, refused }) => [person.name, GROUP_LABEL[person.group], person.bu, used, quota, team, refused]),
    [], ["Per PIC", "Rapat", "Tamu (orang)", "Minuman tamu"],
    ...summary.pics.map(pic => [pic.pic, pic.meetings, pic.guests, pic.drinks]),
    [], ["Per BU", "Klaim", "Tamu", "Tim · rapat", "Total"],
    ...summary.bus.map(bu => [bu.bu, bu.klaim, bu.tamu, bu.tim, bu.total]),
    [], ["Per minuman", "Jumlah"], ...summary.drinks.map(drink => [drink.drink, drink.count]),
  ];
}

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const longDay = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
/** "November 2026" for a whole month, else "3 November 2026 – 14 November 2026". */
export function recapTitle(dari: string, sampai: string): string {
  const wholeMonth = dari.slice(0, 7) === sampai.slice(0, 7) && dari.endsWith("-01") && nextDay(sampai).endsWith("-01");
  if (wholeMonth) return `${MONTHS[Number(dari.slice(5, 7)) - 1]} ${dari.slice(0, 4)}`;
  return dari === sampai ? longDay(dari) : `${longDay(dari)} – ${longDay(sampai)}`;
}
