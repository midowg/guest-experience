"use client";

import {
  useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore,
  type FormEvent, type ReactNode,
} from "react";
import {
  ArrowLeft, ArrowUpDown, ChartColumn, Check, Clock, Coffee, Copy, Download, ExternalLink, FileSpreadsheet,
  Inbox, PenLine, Plus, RotateCcw, Search, Settings, SlidersHorizontal, User, Users, X,
} from "lucide-react";
import {
  DRINKS, GROUP_LABEL, ICE_LEVELS, MONTHLY_QUOTA, SUGAR_LEVELS, optionsLabel,
  type Ice, type QuotaGroup, type Sugar, type Temperature,
} from "@/lib/coffee/menu";
import {
  clockOf, nowIso, seedState, shortName, useCoffeeStore,
  type Claim, type CoffeeState, type Meeting, type MeetingItem, type Status,
} from "./store";
import styles from "./pengelola-prototype.module.css";

/*
 * Werkudara Coffee, pengelola (HR and admin) desktop tool, as a clickable prototype (25 Nov 2026).
 * A claim goes to everyone holding the Werkudara Coffee access; whoever opens it first buys the drink
 * by hand in the JumpStart web app (no API, never automated) and marks it done here. Reads and writes
 * the shared prototype store, so GA's tablet prototype in another tab feeds this queue live.
 * The month's older history is generated here, deterministically, so the rekap looks real.
 * Names are made up ("Contoh ...").
 */

type Kind = "klaim" | "tamu" | "tim";
type View = "antrean" | "rekap" | "pengaturan";
type Actor = { name: string; role: "HR" | "Admin" };
type Person = { name: string; group: QuotaGroup; position: string; bu: string };
/** Extra fields this prototype writes into the store's JSON (the store keeps unknown fields). */
type XClaim = Claim & { manual?: boolean; other?: string };
type XItem = MeetingItem & { other?: string };
type XMeeting = Omit<Meeting, "items"> & { manual?: boolean; items: XItem[] };

type Row = {
  key: string; at: string; no: string; kind: Kind; name: string; group: string; quotaGroup?: QuotaGroup;
  position: string; bu: string; pic: string; guest: string; guestCount?: number; room: string;
  drink: string; temperature: Temperature; sugar: Sugar; ice: Ice; status: Status; reason: string;
  doneBy: string; doneAt: string; claimNo?: number; manual: boolean;
};

const ACTORS: Actor[] = [{ name: "Contoh Dewi Lestari", role: "HR" }, { name: "Contoh Raka Aditya", role: "Admin" }];
const label = (actor: Actor) => `${actor.name} (${actor.role})`;
const JUMPSTART = "https://jumpstart.id/outlet/menu";
const STORE_KEY = "werkudara-coffee-prototype-v1"; // same key as store.ts, to notice orders sent from other tabs

const P = (name: string, group: QuotaGroup, position: string, bu: string): Person => ({ name: `Contoh ${name}`, group, position, bu });
const PEOPLE: Person[] = [
  P("Rina Putri", "karyawan", "Communications Specialist", "WNS"),
  P("Maya Lestari", "karyawan", "Account Executive", "TEE"),
  P("Arief Hidayat", "karyawan", "Finance Staff", "WNS"),
  P("Dimas Pratama", "karyawan", "Business Development", "TEE"),
  P("Sari Wulandari", "karyawan", "Project Manager", "WNS"),
  P("Andi Wijaya", "karyawan", "Head of Sales", "TEE"),
  P("Nadia Rahma", "karyawan", "Event Producer", "WNS"),
  P("Yoga Firmansyah", "karyawan", "Creative Lead", "CoE"),
  P("Intan Permata", "karyawan", "HR Officer", "Holding"),
  P("Rizky Ramadhan", "karyawan", "IT Support", "Holding"),
  P("Lukman Hakim", "karyawan", "Procurement Staff", "WNS"),
  P("Citra Anggraini", "karyawan", "Graphic Designer", "CoE"),
  P("Hendra Kusuma", "karyawan", "Operations Manager", "TEE"),
  P("Wulan Sari", "karyawan", "Account Manager", "WEO"),
  P("Bima Prakoso", "karyawan", "Videographer", "CoE"),
  P("Putri Ayu", "karyawan", "Finance Manager", "Holding"),
  P("Teguh Santoso", "karyawan", "Event Coordinator", "WEO"),
  P("Bagas Saputra", "ga", "General Affair", "WNS"),
  P("Joko Susilo", "ga", "General Affair", "Holding"),
  P("Fajar Nugroho", "intern", "Design Intern", "CoE"),
  P("Salsa Nabila", "intern", "Marketing Intern", "WEO"),
  P("Rafi Akbar", "intern", "Event Intern", "WNS"),
];
const PERSON = new Map(PEOPLE.map(person => [person.name, person]));
const ROOMS = ["CFC Ananta Room", "Kaliya Limasan", "Vasuki Room", "Komunal Space"];
const GUESTS = ["PT Sinar Jaya", "Bank Nusantara", "PT Arunika Media", "PT Samudra Logistik", "Yayasan Cipta Karsa", "PT Mitra Energi", "PT Kencana Wisata"];
const KIND_LABEL: Record<Kind, string> = { klaim: "Klaim", tamu: "Tamu", tim: "Tim · rapat" };
const STATUS_LABEL: Record<Status, string> = { diproses: "Diproses", selesai: "Selesai", ditolak: "Ditolak", batal: "Batal" };
const STATUS_TONE: Record<Status, string> = { diproses: "wait", selesai: "ok", ditolak: "no", batal: "off" };
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const REASONS = ["Minuman sedang habis di mesin.", "Saldo JumpStart sedang habis.", "Pengajuan dobel, sudah diproses."];

/* ---------- time helpers (WIB) */
const dayOf = (date: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(date);
const timeOf = (date: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
const isoAt = (day: string, time: string) => new Date(`${day}T${time}:00+07:00`).toISOString();
const monthOf = (iso: string) => dayOf(new Date(iso)).slice(0, 7);
const monthName = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const prevMonth = (key: string) => { const [y, m] = key.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };
const lastDay = (key: string) => { const [y, m] = key.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
const sheetDate = (iso: string) => dayOf(new Date(iso)).split("-").reverse().join("/");
const waited = (iso: string, now: number) => {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} mnt`;
  return `${Math.floor(minutes / 60)} j ${minutes % 60} mnt`;
};

/* A clock for "menunggu 12 mnt" that ticks without re-rendering the server pass. */
let clockNow = Date.now();
const clockListeners = new Set<() => void>();
let clockTimer: number | undefined;
function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  if (clockTimer === undefined) { clockNow = Date.now(); clockTimer = window.setInterval(() => { clockNow = Date.now(); clockListeners.forEach(fn => fn()); }, 15000); }
  return () => { clockListeners.delete(listener); if (!clockListeners.size) { window.clearInterval(clockTimer); clockTimer = undefined; } };
}
const noopSubscribe = () => () => {};
/** Phone layout (admins and HR process from their phone too); CSS uses the same breakpoint. */
const PHONE = "(max-width: 760px)";
function subscribePhone(listener: () => void) {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

const drinkName = (slug: string, other?: string) => slug === "lainnya" ? (other || "Lainnya") : DRINKS.find(drink => drink.slug === slug)?.name ?? slug;
const iceText = (row: { temperature: Temperature; ice: Ice }) => row.temperature === "es" ? row.ice : "";
const counts = (status: Status) => status === "diproses" || status === "selesai";

/* ---------- made-up history for this month and the one before (deterministic) */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Claims each seeded person already had this month before today's seeded claim (claimNo − 1). */
function seededBefore(state: CoffeeState) {
  const map = new Map<string, number>();
  for (const claim of state.claims) map.set(claim.person, Math.min(map.get(claim.person) ?? 99, claim.claimNo - 1));
  return map;
}

function historyRows(today: string, seedBefore: Map<string, number>): Row[] {
  const current = today.slice(0, 7);
  const rows: Row[] = [];
  for (const month of [prevMonth(current), current]) {
    const isCurrent = month === current;
    const r = rng(Number(month.replace("-", "")));
    const pick = <T,>(list: readonly T[]) => list[Math.floor(r() * list.length)];
    const days: string[] = [];
    for (let d = 1; d <= lastDay(month); d++) {
      const day = `${month}-${String(d).padStart(2, "0")}`;
      const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
      if (weekday !== 0 && weekday !== 6 && day < today) days.push(day);
    }
    if (!days.length) continue;
    const time = (from: number, to: number) => `${String(from + Math.floor(r() * (to - from))).padStart(2, "0")}:${String(Math.floor(r() * 60)).padStart(2, "0")}`;
    const done = (at: string) => {
      const doneAt = new Date(new Date(at).getTime() + (4 + Math.floor(r() * 22)) * 60000).toISOString();
      return { doneAt, doneBy: label(r() < .62 ? ACTORS[0] : ACTORS[1]) };
    };
    const options = (slug: string) => {
      const drink = DRINKS.find(item => item.slug === slug)!;
      const temperature: Temperature = drink.temperatures.length === 1 ? drink.temperatures[0] : r() < .35 ? "es" : "panas";
      return { temperature, sugar: pick(["Normal", "Normal", "Sedikit", "Kurang", "Tanpa", "Setengah"] as Sugar[]), ice: "Normal" as Ice };
    };

    const claims: Omit<Row, "no" | "claimNo">[] = [];
    for (const person of PEOPLE) {
      const quota = MONTHLY_QUOTA[person.group];
      const n = isCurrent ? (seedBefore.get(person.name) ?? Math.floor(r() * (quota + 1))) : 1 + Math.floor(r() * quota);
      const extra = r() < .1 ? 1 : 0; // a refused one now and then: it does not use the quota
      for (let i = 0; i < n + extra; i++) {
        const day = pick(days);
        const at = isoAt(day, time(8, 16));
        const slug = pick(DRINKS).slug;
        const refused = i >= n;
        const { doneAt, doneBy } = done(at);
        claims.push({
          key: "", at, kind: "klaim", name: person.name, group: GROUP_LABEL[person.group], quotaGroup: person.group,
          position: person.position, bu: person.bu, pic: "", guest: "", room: "", drink: drinkName(slug), ...options(slug),
          status: refused ? "ditolak" : "selesai", reason: refused ? pick(REASONS) : "", doneBy, doneAt, manual: !refused && r() < .1,
        });
      }
    }
    claims.sort((a, b) => a.at.localeCompare(b.at));
    const used = new Map<string, number>();
    claims.forEach((claim, index) => {
      const no = `K-${(isCurrent ? 300 : 120) + index}`;
      let claimNo: number | undefined;
      if (claim.status === "selesai") { claimNo = (used.get(claim.name) ?? 0) + 1; used.set(claim.name, claimNo); }
      rows.push({ ...claim, key: `h-${no}`, no, claimNo });
    });

    const meetings = isCurrent ? 13 : 16;
    const hosts = PEOPLE.filter(person => person.group === "karyawan");
    const meetingDays = Array.from({ length: meetings }, () => pick(days)).sort();
    meetingDays.forEach((day, index) => {
      const no = `T-${String((isCurrent ? 80 : 40) + index).padStart(4, "0")}`;
      const at = isoAt(day, time(9, 15));
      const pic = pick(hosts);
      const guest = pick(GUESTS);
      const guestCount = 2 + Math.floor(r() * 6);
      const room = pick(ROOMS);
      const { doneAt, doneBy } = done(at);
      const base = { at, no, guestCount, room, status: "selesai" as Status, reason: "", doneBy, doneAt, manual: false, pic: pic.name };
      const kinds = 1 + Math.floor(r() * 3);
      let left = guestCount;
      for (let k = 0; k < kinds && left > 0; k++) {
        const slug = pick(DRINKS).slug;
        const qty = k === kinds - 1 ? left : 1 + Math.floor(r() * left);
        left -= qty;
        const opts = options(slug);
        for (let q = 0; q < qty; q++) rows.push({
          ...base, ...opts, key: `h-${no}-${k}-${q}`, kind: "tamu", name: pic.name, group: "Tamu", position: pic.position, bu: pic.bu,
          guest, drink: drinkName(slug),
        });
      }
      const team = Math.floor(r() * 3);
      for (let t = 0; t < team; t++) {
        const person = t === 0 ? pic : pick(hosts);
        const slug = pick(DRINKS).slug;
        rows.push({
          ...base, ...options(slug), key: `h-${no}-t${t}`, kind: "tim", name: person.name, group: GROUP_LABEL[person.group],
          position: person.position, bu: person.bu, guest: "", drink: drinkName(slug),
        });
      }
    });
  }
  return rows;
}

/** One rekap row per drink from the live store. */
function storeRows(state: CoffeeState): Row[] {
  const rows: Row[] = [];
  for (const claim of state.claims as XClaim[]) rows.push({
    key: claim.id, at: claim.at, no: claim.id, kind: "klaim", name: claim.person, group: GROUP_LABEL[claim.group], quotaGroup: claim.group,
    position: claim.position, bu: claim.bu, pic: "", guest: "", room: "", drink: drinkName(claim.slug, claim.other),
    temperature: claim.temperature, sugar: claim.sugar, ice: claim.ice, status: claim.status, reason: claim.reason ?? "",
    doneBy: claim.doneBy ?? "", doneAt: claim.doneAt ?? "", claimNo: counts(claim.status) ? claim.claimNo : undefined, manual: !!claim.manual,
  });
  for (const meeting of state.meetings as XMeeting[]) {
    const no = meeting.round > 1 ? `${meeting.id}-${meeting.round}` : meeting.id;
    for (const item of meeting.items) for (let q = 0; q < item.qty; q++) {
      const person = PERSON.get(item.for === "tim" ? item.person ?? "" : meeting.pic);
      rows.push({
        key: `${no}-${item.id}-${q}`, at: meeting.at, no, kind: item.for, name: item.for === "tim" ? item.person ?? "—" : meeting.pic,
        group: item.for === "tim" ? (person ? GROUP_LABEL[person.group] : "—") : "Tamu", position: person?.position ?? "—", bu: person?.bu ?? "—",
        pic: meeting.pic, guest: item.for === "tamu" ? meeting.guest ?? "" : "", guestCount: meeting.guestCount, room: meeting.room,
        drink: drinkName(item.slug, item.other), temperature: item.temperature, sugar: item.sugar, ice: item.ice, status: meeting.status,
        reason: meeting.reason ?? "", doneBy: meeting.doneBy ?? "", doneAt: meeting.doneAt ?? "", manual: !!meeting.manual,
      });
    }
  }
  return rows;
}

const usedIn = (rows: Row[], person: string, month: string) =>
  rows.filter(row => row.kind === "klaim" && row.name === person && counts(row.status) && monthOf(row.at) === month).length;

/* ---------- export */
const DETAIL_HEAD = ["Tanggal", "Jam diajukan", "Nomor pesanan", "Jenis", "Nama", "Kelompok", "Jabatan", "BU", "PIC", "Tamu/instansi", "Jumlah tamu", "Ruangan",
  "Minuman", "Suhu", "Gula", "Takaran es", "Status", "Catatan tolak", "Diproses oleh", "Jam diproses", "Klaim ke-", "Dicatat manual"];
const detailCells = (row: Row) => [
  sheetDate(row.at), timeOf(new Date(row.at)), row.no, KIND_LABEL[row.kind], row.name.replace(/^Contoh /, ""), row.group, row.position, row.bu,
  row.pic.replace(/^Contoh /, ""), row.guest, row.guestCount && row.kind === "tamu" ? String(row.guestCount) : "", row.room, row.drink,
  row.temperature === "es" ? "Es" : "Panas", row.sugar, iceText(row), STATUS_LABEL[row.status], row.reason,
  row.doneBy.replace(/^Contoh /, ""), row.doneAt ? timeOf(new Date(row.doneAt)) : "", row.claimNo ? String(row.claimNo) : "", row.manual ? "Ya" : "",
];
const csvCell = (text: string) => /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;

/* ---------- summaries */
type Summary = ReturnType<typeof summarize>;
function summarize(rows: Row[]) {
  const live = rows.filter(row => counts(row.status));
  const by = (kind: Kind) => live.filter(row => row.kind === kind).length;
  const meetings = new Set(rows.filter(row => row.kind !== "klaim").map(row => row.no));
  const people = PEOPLE.map(person => {
    const mine = rows.filter(row => row.name === person.name);
    return {
      person, quota: MONTHLY_QUOTA[person.group],
      used: mine.filter(row => row.kind === "klaim" && counts(row.status)).length,
      team: mine.filter(row => row.kind === "tim" && counts(row.status)).length,
      refused: mine.filter(row => row.kind === "klaim" && row.status === "ditolak").length,
    };
  }).sort((a, b) => b.used / b.quota - a.used / a.quota || a.person.name.localeCompare(b.person.name));
  const picMap = new Map<string, { meetings: Set<string>; guests: number; drinks: number }>();
  for (const row of live.filter(row => row.kind === "tamu")) {
    const entry = picMap.get(row.pic) ?? { meetings: new Set<string>(), guests: 0, drinks: 0 };
    if (!entry.meetings.has(row.no)) { entry.meetings.add(row.no); entry.guests += row.guestCount ?? 0; }
    entry.drinks += 1;
    picMap.set(row.pic, entry);
  }
  const pics = [...picMap].map(([pic, entry]) => ({ pic, meetings: entry.meetings.size, guests: entry.guests, drinks: entry.drinks }))
    .sort((a, b) => b.drinks - a.drinks);
  const buMap = new Map<string, Record<Kind, number>>();
  for (const row of live) {
    const entry = buMap.get(row.bu) ?? { klaim: 0, tamu: 0, tim: 0 };
    entry[row.kind] += 1;
    buMap.set(row.bu, entry);
  }
  const bus = [...buMap].map(([bu, entry]) => ({ bu, ...entry, total: entry.klaim + entry.tamu + entry.tim })).sort((a, b) => b.total - a.total);
  const drinkMap = new Map<string, number>();
  for (const row of live) drinkMap.set(row.drink, (drinkMap.get(row.drink) ?? 0) + 1);
  const drinks = [...drinkMap].map(([drink, count]) => ({ drink, count })).sort((a, b) => b.count - a.count);
  return {
    total: live.length, klaim: by("klaim"), tamu: by("tamu"), tim: by("tim"), meetings: meetings.size,
    refused: rows.filter(row => row.status === "ditolak").length, waiting: rows.filter(row => row.status === "diproses").length,
    people, pics, bus, drinks,
  };
}
function summarySheet(summary: Summary, title: string): string[][] {
  const plain = (name: string) => name.replace(/^Contoh /, "");
  return [
    [`Rekap Werkudara Coffee · ${title}`],
    ["Total minuman", String(summary.total)], ["Klaim", String(summary.klaim)], ["Tamu", String(summary.tamu)],
    ["Tim · rapat", String(summary.tim)], ["Ditolak", String(summary.refused)], [],
    ["Per orang", "Kelompok", "BU", "Klaim terpakai", "Jatah", "Tim · rapat", "Ditolak"],
    ...summary.people.map(({ person, quota, used, team, refused }) => [plain(person.name), GROUP_LABEL[person.group], person.bu, String(used), String(quota), String(team), String(refused)]),
    [], ["Per PIC", "Rapat", "Tamu (orang)", "Minuman tamu"],
    ...summary.pics.map(pic => [plain(pic.pic), String(pic.meetings), String(pic.guests), String(pic.drinks)]),
    [], ["Per BU", "Klaim", "Tamu", "Tim · rapat", "Total"],
    ...summary.bus.map(bu => [bu.bu, String(bu.klaim), String(bu.tamu), String(bu.tim), String(bu.total)]),
    [], ["Per minuman", "Jumlah"], ...summary.drinks.map(drink => [drink.drink, String(drink.count)]),
  ];
}

/* ---------- text for JumpStart */
function claimText(claim: XClaim) {
  return [
    `Klaim ${claim.id} · ${shortName(claim.person)} (${GROUP_LABEL[claim.group]})`,
    `1× ${drinkName(claim.slug, claim.other)} · ${optionsLabel(claim.temperature, claim.sugar, claim.ice)}`,
  ].join("\n");
}
function meetingText(meeting: XMeeting) {
  const line = (item: XItem) => `- ${item.qty}× ${drinkName(item.slug, item.other)} · ${optionsLabel(item.temperature, item.sugar, item.ice)}${item.person ? ` (${item.person.replace(/^Contoh /, "")})` : ""}`;
  const guests = meeting.items.filter(item => item.for === "tamu");
  const team = meeting.items.filter(item => item.for === "tim");
  const total = meeting.items.reduce((sum, item) => sum + item.qty, 0);
  return [
    `Rapat ${meeting.id}${meeting.round > 1 ? ` (tambahan ke-${meeting.round})` : ""} · ${meeting.room} · PIC ${meeting.pic.replace(/^Contoh /, "")}`,
    ...(guests.length ? [`Tamu${meeting.guest ? ` ${meeting.guest}` : ""}${meeting.guestCount ? ` (${meeting.guestCount} orang)` : ""}:`, ...guests.map(line)] : []),
    ...(team.length ? ["Tim · rapat:", ...team.map(line)] : []),
    `Total ${total} minuman`,
  ].join("\n");
}
async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const area = document.createElement("textarea");
    area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
    document.body.appendChild(area); area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/* ---------- layer: dialog or side sheet with Escape, focus trap, focus return */
/** Open sheets that hold a history entry (phone back gesture). */
let openLayers = 0;
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function Layer({ onClose, labelledBy, side, children }: { onClose: () => void; labelledBy: string; side?: boolean; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const root = panel.current;
    (root?.querySelector<HTMLElement>("[data-autofocus]") ?? root?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); return; }
      if (event.key !== "Tab" || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    // On a phone the system back gesture closes the sheet: one history entry while it is open. The
    // entry keeps Next's own state so the router treats going back as staying on the same page.
    const usesBack = window.matchMedia(PHONE).matches;
    const onPop = () => { if (!window.history.state?.coffeeLayer) close.current(); };
    if (usesBack) {
      openLayers += 1;
      if (!window.history.state?.coffeeLayer) window.history.pushState({ ...window.history.state, coffeeLayer: true }, "");
      window.addEventListener("popstate", onPop);
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      if (usesBack) {
        openLayers -= 1;
        window.removeEventListener("popstate", onPop);
        // Deferred, so a remount (React's dev double effect) keeps the entry instead of going back.
        window.setTimeout(() => { if (openLayers === 0 && window.history.state?.coffeeLayer) window.history.back(); }, 0);
      }
      back?.focus?.();
    };
  }, []);
  return (
    <div className={styles.scrim} data-side={side ? "true" : undefined} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panel} className={side ? styles.sheet : styles.dialog} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>{children}</div>
    </div>
  );
}

/* ---------- person picker (combobox) */
function PersonPicker({ id, labelText, value, onChange, people, error }: {
  id: string; labelText: string; value: Person | null; onChange: (person: Person | null) => void; people: Person[]; error?: string;
}) {
  const [query, setQuery] = useState(value ? value.name.replace(/^Contoh /, "") : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter(person => !q || `${person.name} ${person.position} ${person.bu}`.toLowerCase().includes(q)).slice(0, 8);
  }, [people, query]);
  const choose = (person: Person) => { onChange(person); setQuery(person.name.replace(/^Contoh /, "")); setOpen(false); };
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{labelText}</label>
      <div className={styles.combo}>
        <Search size={18} aria-hidden className={styles.comboIcon} />
        <input
          id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${id}-${active}` : undefined} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
          value={query} placeholder="Ketik nama, jabatan, atau BU" autoComplete="off"
          onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); if (value) onChange(null); }}
          onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={event => {
            if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive(index => Math.min(results.length - 1, index + 1)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setActive(index => Math.max(0, index - 1)); }
            if (event.key === "Enter" && open && results[active]) { event.preventDefault(); choose(results[active]); }
            if (event.key === "Escape" && open) { event.stopPropagation(); event.preventDefault(); setOpen(false); }
          }}
        />
        {open && (
          <ul id={`${id}-list`} role="listbox" className={styles.comboList} aria-label={labelText}>
            {results.length ? results.map((person, index) => (
              <li
                key={person.name} id={`${id}-${index}`} role="option" aria-selected={index === active}
                onMouseDown={event => { event.preventDefault(); choose(person); }} onMouseEnter={() => setActive(index)}
              >
                <strong>{person.name.replace(/^Contoh /, "")}</strong>
                <span>{person.position} · {person.bu} · {GROUP_LABEL[person.group]}</span>
              </li>
            )) : <li className={styles.comboEmpty} role="presentation">Tidak ada nama yang cocok</li>}
          </ul>
        )}
      </div>
      {error && <p id={`${id}-error`} className={styles.error}>{error}</p>}
    </div>
  );
}

/* ============================================================ main */
type Toast = { title: string; body?: string; undo?: () => void };
type QueueItem = { key: string; at: string; claim?: XClaim; meeting?: XMeeting };

export function PengelolaPrototype() {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) return <div className={styles.app} aria-busy="true"><aside className={styles.sidebar} /><main className={styles.main} /></div>;
  return <Tool />;
}

function Tool() {
  const { state, update, reset } = useCoffeeStore();
  const now = useSyncExternalStore(subscribeClock, () => clockNow, () => clockNow);
  const [view, setView] = useState<View>("antrean");
  const [actorIndex, setActorIndex] = useState(0);
  const actor = ACTORS[actorIndex];
  const [manual, setManual] = useState(false);
  const [refuse, setRefuse] = useState<QueueItem | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const phone = useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false);
  const toastTimer = useRef<number | undefined>(undefined);
  const notify = useCallback((next: Toast) => {
    window.clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }, []);

  const today = dayOf(new Date(now));
  const history = useMemo(() => historyRows(today, seededBefore(state)), [today]); // eslint-disable-line react-hooks/exhaustive-deps -- history stays fixed for the day
  const rows = useMemo(() => [...history, ...storeRows(state)], [history, state]);

  const queue = useMemo<QueueItem[]>(() => [
    ...(state.claims as XClaim[]).filter(claim => claim.status === "diproses").map(claim => ({ key: claim.id, at: claim.at, claim })),
    ...(state.meetings as XMeeting[]).filter(meeting => meeting.status === "diproses").map(meeting => ({ key: `${meeting.id}-${meeting.round}`, at: meeting.at, meeting })),
  ].sort((a, b) => a.at.localeCompare(b.at)), [state]);

  // Orders sent from another tab (GA's tablet prototype, the employee app): say so.
  // Compared with the event's old value, not this tab's state: the store may already have re-rendered.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORE_KEY || !event.newValue) return;
      try {
        const next = JSON.parse(event.newValue) as CoffeeState;
        const before = event.oldValue ? JSON.parse(event.oldValue) as CoffeeState : seedState();
        const known = new Set([
          ...before.claims.filter(claim => claim.status === "diproses").map(claim => claim.id),
          ...before.meetings.filter(meeting => meeting.status === "diproses").map(meeting => `${meeting.id}-${meeting.round}`),
        ]);
        const fresh = [
          ...next.claims.filter(claim => claim.status === "diproses" && !known.has(claim.id)).map(claim => `Klaim ${shortName(claim.person)}`),
          ...next.meetings.filter(meeting => meeting.status === "diproses" && !known.has(`${meeting.id}-${meeting.round}`)).map(meeting => `Rapat ${meeting.room}`),
        ];
        if (fresh.length) notify({ title: fresh.length === 1 ? "Pesanan baru masuk" : `${fresh.length} pesanan baru masuk`, body: fresh.join(", ") });
      } catch { /* ignore */ }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [notify]);

  const setItem = (item: QueueItem, patch: { status: Status; doneBy?: string; doneAt?: string; reason?: string }) => update(current => ({
    ...current,
    claims: item.claim ? current.claims.map(claim => claim.id === item.claim!.id ? { ...claim, ...patch } as Claim : claim) : current.claims,
    meetings: item.meeting ? current.meetings.map(meeting => meeting.id === item.meeting!.id && meeting.round === item.meeting!.round ? { ...meeting, ...patch } as Meeting : meeting) : current.meetings,
  }));
  const undo = (item: QueueItem) => () => {
    setItem(item, { status: "diproses", doneBy: undefined, doneAt: undefined, reason: undefined });
    notify({ title: "Dikembalikan ke antrean" });
  };
  const who = (item: QueueItem) => item.claim ? shortName(item.claim.person) : `${item.meeting!.sentBy.replace(/^Contoh /, "")} dan PIC ${shortName(item.meeting!.pic)}`;
  const finish = (item: QueueItem) => {
    const by = label(actor);
    setItem(item, { status: "selesai", doneBy: by, doneAt: nowIso() });
    notify({ title: "Selesai diproses", body: `Notifikasi ke ${who(item)}: “Selesai diproses oleh ${shortName(by)}”.`, undo: undo(item) });
  };
  const reject = (item: QueueItem, reason: string) => {
    const by = label(actor);
    setItem(item, { status: "ditolak", reason, doneBy: by, doneAt: nowIso() });
    setRefuse(null);
    notify({ title: "Ditolak", body: `${who(item)} diberi tahu beserta catatannya.${item.claim ? " Jatah tidak terpakai." : ""}`, undo: undo(item) });
  };

  const addSample = () => {
    const month = today.slice(0, 7);
    const open = PEOPLE.filter(person => usedIn(rows, person.name, month) < MONTHLY_QUOTA[person.group]);
    if (!open.length) { notify({ title: "Semua jatah bulan ini sudah terpakai" }); return; }
    const person = open[(state.seq.claim * 7) % open.length];
    const drink = DRINKS[(state.seq.claim * 5) % DRINKS.length];
    const claim: Claim = {
      id: `K-${state.seq.claim}`, kind: "klaim", person: person.name, group: person.group, position: person.position, bu: person.bu,
      slug: drink.slug, temperature: drink.temperatures[0], sugar: "Normal", ice: "Normal", claimNo: usedIn(rows, person.name, month) + 1,
      at: nowIso(), status: "diproses",
    };
    update(current => ({ ...current, claims: [...current.claims, claim], seq: { ...current.seq, claim: current.seq.claim + 1 } }));
    setView("antrean");
    notify({ title: "Pesanan baru masuk", body: `Klaim ${shortName(person.name)} · ${drink.name}` });
  };

  const todayRows = (state.claims as { at: string; status: Status }[]).concat(state.meetings).filter(item => dayOf(new Date(item.at)) === today);
  const nav: { id: View; text: string; icon: ReactNode; badge?: number }[] = [
    { id: "antrean", text: "Antrean", icon: <Inbox size={20} aria-hidden />, badge: queue.length },
    { id: "rekap", text: "Rekap", icon: <ChartColumn size={20} aria-hidden /> },
    { id: "pengaturan", text: "Pengaturan", icon: <Settings size={20} aria-hidden /> },
  ];

  const firstName = actor.name.replace(/^Contoh /, "");
  const scenario = (
    <section className={styles.scenario} aria-labelledby="scenario-title">
      <h2 id="scenario-title">Prototype · skenario</h2>
      <label className={styles.scenarioField}>
        <span>Masuk sebagai</span>
        <select value={actorIndex} onChange={event => { setActorIndex(Number(event.target.value)); notify({ title: `Masuk sebagai ${shortName(label(ACTORS[Number(event.target.value)]))}`, body: "HR dan admin melihat antrean yang sama dan bertindak sama." }); }}>
          {ACTORS.map((item, index) => <option key={item.name} value={index}>{item.name.replace(/^Contoh /, "")} · {item.role}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => { addSample(); setScenarioOpen(false); }}><Plus size={16} aria-hidden />Tambah klaim contoh</button>
      <button type="button" onClick={() => { reset(); setScenarioOpen(false); notify({ title: "Data prototype kembali ke awal" }); }}><RotateCcw size={16} aria-hidden />Reset data</button>
      <p>Pesanan dari <a href="/dev-preview/coffee/ga" target="_blank" rel="noreferrer">tablet GA</a> di tab lain langsung masuk ke antrean.</p>
    </section>
  );
  const titles: Record<View, string> = { antrean: "Antrean", rekap: "Rekap", pengaturan: "Lainnya" };

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}><Coffee size={20} aria-hidden /></span>
          <span><strong>Werkudara Coffee</strong><small>Pengelola</small></span>
        </div>
        <nav aria-label="Menu pengelola" className={styles.nav}>
          {nav.map(item => (
            <button key={item.id} type="button" aria-current={view === item.id ? "page" : undefined} onClick={() => setView(item.id)}>
              {item.icon}<span>{item.text}</span>
              {item.badge ? <span className={styles.badge} aria-label={`${item.badge} menunggu`}>{item.badge}</span> : null}
            </button>
          ))}
        </nav>
        <button type="button" className={styles.manualButton} onClick={() => setManual(true)}><PenLine size={18} aria-hidden />Catat manual</button>

        <div className={styles.sideBottom}>
          <div className={styles.me}>
            <span className={styles.avatar} aria-hidden>{firstName[0]}</span>
            <span><strong>{firstName}</strong><small>{actor.role} · akses Werkudara Coffee</small></span>
          </div>
          {!phone && scenario}
        </div>
      </aside>

      {/* Phone: an app bar on top and a tab bar at the bottom replace the sidebar. */}
      <header className={styles.appBar}>
        <span className={styles.brandMark}><Coffee size={18} aria-hidden /></span>
        <span className={styles.appTitle}>
          <strong>{titles[view]}</strong>
          <small>{firstName} · {actor.role}</small>
        </span>
        {phone && (
          <button type="button" className={styles.panelToggle} aria-expanded={scenarioOpen} aria-controls="scenario-pop" onClick={() => setScenarioOpen(open => !open)}>
            Prototype
          </button>
        )}
      </header>
      {phone && scenarioOpen && <div id="scenario-pop" className={styles.scenarioPop}>{scenario}</div>}

      <main className={styles.main}>
        <div hidden={view !== "antrean"}>
          <QueueView
            queue={queue} now={now} todayRows={todayRows} state={state} actor={actor} phone={phone}
            onFinish={finish} onRefuse={setRefuse} onManual={() => setManual(true)}
          />
        </div>
        <div hidden={view !== "rekap"}><RekapView rows={rows} today={today} phone={phone} /></div>
        {view === "pengaturan" && <SettingsView />}
      </main>

      <nav className={styles.tabBar} aria-label="Menu pengelola (ponsel)">
        <button type="button" aria-current={view === "antrean" ? "page" : undefined} onClick={() => setView("antrean")}>
          <span className={styles.tabIcon}><Inbox size={22} aria-hidden />{queue.length ? <span className={styles.tabBadge} aria-label={`${queue.length} menunggu`}>{queue.length}</span> : null}</span>
          Antrean
        </button>
        <button type="button" aria-current={view === "rekap" ? "page" : undefined} onClick={() => setView("rekap")}>
          <span className={styles.tabIcon}><ChartColumn size={22} aria-hidden /></span>Rekap
        </button>
        <button type="button" className={styles.tabAction} onClick={() => setManual(true)}>
          <span className={styles.tabIcon}><PenLine size={22} aria-hidden /></span>Catat
        </button>
        <button type="button" aria-current={view === "pengaturan" ? "page" : undefined} onClick={() => setView("pengaturan")}>
          <span className={styles.tabIcon}><Settings size={22} aria-hidden /></span>Lainnya
        </button>
      </nav>

      {manual && <ManualSheet rows={rows} actor={actor} now={now} onClose={() => setManual(false)} onSaved={(text) => { setManual(false); notify({ title: "Dicatat manual", body: text }); }} />}
      {refuse && <RefuseDialog item={refuse} onClose={() => setRefuse(null)} onRefuse={reason => reject(refuse, reason)} />}

      <div className={styles.toastRegion} aria-live="polite">
        {toast && (
          <div className={styles.toast} role="status">
            <Check size={20} aria-hidden />
            <div><strong>{toast.title}</strong>{toast.body && <p>{toast.body}</p>}</div>
            {toast.undo && <button type="button" onClick={() => { toast.undo!(); }}>Urungkan</button>}
            <button type="button" className={styles.iconButton} aria-label="Tutup pemberitahuan" onClick={() => setToast(null)}><X size={18} aria-hidden /></button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Antrean */
function QueueView({ queue, now, todayRows, state, actor, phone, onFinish, onRefuse, onManual }: {
  queue: QueueItem[]; now: number; todayRows: { status: Status }[]; state: CoffeeState; actor: Actor; phone: boolean;
  onFinish: (item: QueueItem) => void; onRefuse: (item: QueueItem) => void; onManual: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (item: QueueItem) => {
    const ok = await copyText(item.claim ? claimText(item.claim) : meetingText(item.meeting!));
    if (ok) { setCopied(item.key); window.setTimeout(() => setCopied(current => current === item.key ? null : current), 2000); }
  };
  const done = [
    ...(state.claims as XClaim[]).map(claim => ({ key: claim.id, title: `${shortName(claim.person)} · ${drinkName(claim.slug, claim.other)}`, kind: "Klaim", status: claim.status, doneBy: claim.doneBy, doneAt: claim.doneAt, manual: claim.manual })),
    ...(state.meetings as XMeeting[]).map(meeting => ({ key: `${meeting.id}-${meeting.round}`, title: `${meeting.room} · ${meeting.items.reduce((sum, item) => sum + item.qty, 0)} minuman`, kind: "Rapat", status: meeting.status, doneBy: meeting.doneBy, doneAt: meeting.doneAt, manual: meeting.manual })),
  ].filter(item => item.doneAt && (item.status === "selesai" || item.status === "ditolak")).sort((a, b) => b.doneAt!.localeCompare(a.doneAt!)).slice(0, 6);
  const tally = (status: Status) => todayRows.filter(item => item.status === status).length;

  return (
    <>
      <header className={styles.top}>
        <div>
          <h1>Antrean</h1>
          <p>{phone ? "Terlama di atas. Beli di JumpStart, lalu tandai selesai." : "Pesanan menunggu, terlama di atas. Beli di aplikasi JumpStart, lalu tandai selesai. Terlihat oleh semua pemegang akses."}</p>
        </div>
        <button type="button" className={`${styles.secondary} ${styles.desktopOnly}`} onClick={onManual}><PenLine size={18} aria-hidden />Catat manual</button>
      </header>
      <div className={styles.queueLayout}>
        <section aria-label="Pesanan menunggu" className={styles.queue}>
          {queue.length === 0 && (
            <div className={styles.empty}>
              <Inbox size={32} aria-hidden />
              <h2>Antrean kosong</h2>
              <p>Pesanan baru muncul di sini tanpa memuat ulang halaman.</p>
            </div>
          )}
          {queue.map(item => {
            const claim = item.claim, meeting = item.meeting;
            const isCopied = copied === item.key;
            return (
              <article key={item.key} className={styles.card} aria-labelledby={`q-${item.key}`}>
                <div className={styles.cardHead}>
                  <span className={styles.kind} data-kind={claim ? "klaim" : "rapat"}>{claim ? <User size={16} aria-hidden /> : <Users size={16} aria-hidden />}{claim ? "Klaim" : "Rapat"}</span>
                  <span className={styles.cardNo}>{claim ? claim.id : `${meeting!.id}${meeting!.round > 1 ? ` · tambahan ke-${meeting!.round}` : ""}`}</span>
                  <span className={styles.waiting}><Clock size={16} aria-hidden />{phone ? "" : "Diproses · "}menunggu {waited(item.at, now)}</span>
                </div>
                {claim ? (
                  <div className={styles.claimBody}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- prototype photo */}
                    {claim.slug !== "lainnya" ? <img src={`/dev/coffee/${claim.slug}.jpg`} alt="" className={styles.thumb} /> : <span className={styles.thumb} />}
                    <div className={styles.grow}>
                      <h2 id={`q-${item.key}`}>{drinkName(claim.slug, claim.other)}</h2>
                      <p className={styles.optionsLine}>{optionsLabel(claim.temperature, claim.sugar, claim.ice)}</p>
                      <p className={styles.meta}>
                        <strong>{claim.person.replace(/^Contoh /, "")}</strong> · {GROUP_LABEL[claim.group]} · {claim.position} · {claim.bu}
                      </p>
                    </div>
                    <div className={styles.quotaBox}>
                      <Dots used={claim.claimNo} quota={MONTHLY_QUOTA[claim.group]} />
                      <span>Klaim ke-{claim.claimNo} dari {MONTHLY_QUOTA[claim.group]}</span>
                    </div>
                  </div>
                ) : (
                  <div className={styles.meetingBody}>
                    <h2 id={`q-${item.key}`}>{meeting!.room} · {meeting!.items.reduce((sum, line) => sum + line.qty, 0)} minuman</h2>
                    <p className={styles.meta}>
                      PIC <strong>{meeting!.pic.replace(/^Contoh /, "")}</strong>
                      {meeting!.guest && <> · {meeting!.guest}</>}{meeting!.guestCount ? <> · {meeting!.guestCount} tamu</> : null}
                      {" "}· dikirim {meeting!.sentBy.replace(/^Contoh /, "")} {clockOf(meeting!.at)}
                    </p>
                    <ul className={styles.lines}>
                      {meeting!.items.map(line => (
                        <li key={line.id}>
                          <span className={styles.lineFor} data-for={line.for}>{line.for === "tamu" ? "Tamu" : "Tim · rapat"}</span>
                          <span className={styles.qty}>{line.qty}×</span>
                          <span className={styles.grow}><strong>{drinkName(line.slug, line.other)}</strong> · {optionsLabel(line.temperature, line.sugar, line.ice)}</span>
                          {line.person && <span className={styles.linePerson}>{line.person.replace(/^Contoh /, "")}</span>}
                        </li>
                      ))}
                    </ul>
                    <p className={styles.note}>Tidak memakai jatah. Minuman tim dicatat atas nama orangnya.</p>
                  </div>
                )}
                <div className={styles.actions}>
                  <button type="button" className={styles.secondary} onClick={() => copy(item)} aria-live="polite">
                    {isCopied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}{isCopied ? "Tersalin" : phone ? "Salin" : "Salin rincian"}
                  </button>
                  <a className={styles.secondary} href={JUMPSTART} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={18} aria-hidden />{phone ? "JumpStart" : "Buka JumpStart"}<span className={styles.srOnly}> (tab baru)</span>
                  </a>
                  <span className={`${styles.grow} ${styles.desktopOnly}`} />
                  <button type="button" className={styles.dangerText} onClick={() => onRefuse(item)}>{phone && <X size={18} aria-hidden />}Tolak</button>
                  <button type="button" className={styles.primary} onClick={() => onFinish(item)}><Check size={18} aria-hidden />Selesai diproses</button>
                </div>
              </article>
            );
          })}
        </section>

        <aside className={styles.aside} aria-label="Ringkasan hari ini">
          <section className={`${styles.panel} ${styles.tallyPanel}`}>
            <h2>Hari ini</h2>
            <dl className={styles.tally}>
              <div data-tone="wait"><dt>Diproses</dt><dd>{tally("diproses")}</dd></div>
              <div data-tone="ok"><dt>Selesai</dt><dd>{tally("selesai")}</dd></div>
              <div data-tone="no"><dt>Ditolak</dt><dd>{tally("ditolak")}</dd></div>
            </dl>
            <p className={`${styles.small} ${styles.desktopOnly}`}>Dihitung per pesanan. Kamu masuk sebagai {shortName(label(actor))}.</p>
          </section>
          <section className={`${styles.panel} ${styles.recentPanel}`}>
            <h2>Baru diproses</h2>
            {done.length === 0 ? <p className={styles.small}>Belum ada.</p> : (
              <ul className={styles.recent}>
                {done.map(item => (
                  <li key={item.key}>
                    <span className={styles.pill} data-tone={STATUS_TONE[item.status]}>{item.manual ? "Dicatat manual" : STATUS_LABEL[item.status]}</span>
                    <span className={styles.recentText}>
                      <strong>{item.title}</strong>
                      <span>{item.kind} · {shortName(item.doneBy ?? "")} · {clockOf(item.doneAt!)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function Dots({ used, quota }: { used: number; quota: number }) {
  return (
    <span className={styles.dots} role="img" aria-label={`${used} dari ${quota} terpakai`}>
      {Array.from({ length: quota }, (_, index) => <span key={index} data-on={index < used ? "true" : undefined} />)}
    </span>
  );
}

/* ---------- Tolak */
function RefuseDialog({ item, onClose, onRefuse }: { item: QueueItem; onClose: () => void; onRefuse: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const titleId = useId();
  const error = tried && !reason.trim() ? "Tulis catatan untuk pemesan." : "";
  const submit = (event: FormEvent) => { event.preventDefault(); setTried(true); if (reason.trim()) onRefuse(reason.trim()); };
  const what = item.claim ? `klaim ${shortName(item.claim.person)} (${drinkName(item.claim.slug, item.claim.other)})` : `pesanan rapat ${item.meeting!.room}`;
  return (
    <Layer onClose={onClose} labelledBy={titleId}>
      <form onSubmit={submit} noValidate>
        <div className={styles.dialogHead}>
          <h2 id={titleId}>Tolak {what}?</h2>
          <button type="button" className={styles.iconButton} aria-label="Tutup" onClick={onClose}><X size={20} aria-hidden /></button>
        </div>
        <p className={styles.muted}>{item.claim ? "Jatah tidak terpakai. " : ""}Catatan ini dikirim ke {item.claim ? "pemesan" : "GA dan PIC"}.</p>
        <div className={styles.field}>
          <label htmlFor="refuse-reason">Catatan tolak</label>
          <textarea id="refuse-reason" data-autofocus rows={3} value={reason} onChange={event => setReason(event.target.value)}
            aria-invalid={!!error} aria-describedby={error ? "refuse-error" : undefined} />
          {error && <p id="refuse-error" className={styles.error}>{error}</p>}
        </div>
        <div className={styles.chips} role="group" aria-label="Catatan cepat">
          {REASONS.map(text => <button key={text} type="button" onClick={() => setReason(text)} aria-pressed={reason === text}>{text}</button>)}
        </div>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>Batal</button>
          <button type="submit" className={styles.danger}>Tolak</button>
        </div>
      </form>
    </Layer>
  );
}

/* ---------- Catat manual */
function ManualSheet({ rows, actor, now, onClose, onSaved }: { rows: Row[]; actor: Actor; now: number; onClose: () => void; onSaved: (text: string) => void }) {
  const { update } = useCoffeeStore();
  const titleId = useId();
  const start = new Date();
  const [day, setDay] = useState(dayOf(start));
  const [time, setTime] = useState(timeOf(start));
  const [kind, setKind] = useState<Kind>("klaim");
  const [person, setPerson] = useState<Person | null>(null);
  const [guest, setGuest] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [room, setRoom] = useState(ROOMS[0]);
  const [slug, setSlug] = useState(DRINKS[0].slug);
  const [other, setOther] = useState("");
  const [qty, setQty] = useState(1);
  const [temperature, setTemperature] = useState<Temperature>("panas");
  const [sugar, setSugar] = useState<Sugar>("Normal");
  const [ice, setIce] = useState<Ice>("Normal");
  const [tried, setTried] = useState(false);

  const drink = DRINKS.find(item => item.slug === slug);
  const temps: Temperature[] = drink ? drink.temperatures : ["panas", "es"];
  const temp = temps.includes(temperature) ? temperature : temps[0];
  const month = day.slice(0, 7);
  const quota = person ? MONTHLY_QUOTA[person.group] : 0;
  const used = person ? usedIn(rows, person.name, month) : 0;
  const full = kind === "klaim" && person && used >= quota;
  const errors = {
    person: !person ? (kind === "tamu" ? "Pilih PIC tamu." : "Pilih nama karyawan.") : "",
    other: slug === "lainnya" && !other.trim() ? "Tulis nama minumannya." : "",
    when: !day || !time ? "Isi tanggal dan jam." : new Date(`${day}T${time}:00+07:00`).getTime() > now + 60000 ? "Tanggal dan jam tidak boleh di masa depan." : "",
  };
  const invalid = Object.values(errors).some(Boolean) || !!full;

  const save = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (invalid || !person) return;
    const at = isoAt(day, time);
    const by = label(actor);
    const extra = slug === "lainnya" ? { other: other.trim() } : {};
    let text = "";
    update(current => {
      if (kind === "klaim") {
        const claim: XClaim = {
          id: `K-${current.seq.claim}`, kind: "klaim", person: person.name, group: person.group, position: person.position, bu: person.bu,
          slug, temperature: temp, sugar, ice, claimNo: used + 1, at, status: "selesai", manual: true, doneBy: by, doneAt: nowIso(), ...extra,
        };
        text = `${shortName(person.name)} · ${drinkName(slug, other)} · klaim ke-${used + 1} dari ${quota}.`;
        return { ...current, claims: [...current.claims, claim], seq: { ...current.seq, claim: current.seq.claim + 1 } };
      }
      const meeting: XMeeting = {
        id: `T-${String(current.seq.meeting).padStart(4, "0")}`, kind: "rapat", room, pic: person.name,
        guest: kind === "tamu" ? guest.trim() || undefined : undefined, guestCount: kind === "tamu" && Number(guestCount) > 0 ? Number(guestCount) : undefined,
        items: [{ id: "a", for: kind === "tamu" ? "tamu" : "tim", person: kind === "tim" ? person.name : undefined, slug, temperature: temp, sugar, ice, qty, ...extra }],
        at, status: "selesai", sentBy: by, doneBy: by, doneAt: nowIso(), round: 1, manual: true,
      };
      text = `${KIND_LABEL[kind]} · ${qty}× ${drinkName(slug, other)} · ${kind === "tamu" ? "PIC " : ""}${shortName(person.name)}.`;
      return { ...current, meetings: [...current.meetings, meeting as Meeting], seq: { ...current.seq, meeting: current.seq.meeting + 1 } };
    });
    onSaved(text);
  };
  const show = (key: keyof typeof errors) => tried ? errors[key] : "";

  return (
    <Layer onClose={onClose} labelledBy={titleId} side>
      <form className={styles.sheetForm} onSubmit={save} noValidate>
        <div className={styles.sheetHead}>
          <div>
            <h2 id={titleId}>Catat manual</h2>
            <p className={styles.muted}>Untuk permintaan di luar aplikasi. Tersimpan sebagai selesai dan ditandai “Dicatat manual”.</p>
          </div>
          <button type="button" className={styles.iconButton} aria-label="Tutup" onClick={onClose}><X size={20} aria-hidden /></button>
        </div>
        <div className={styles.sheetBody}>
          <div className={styles.twoCol}>
            <div className={styles.field}>
              <label htmlFor="m-day">Tanggal</label>
              <input id="m-day" type="date" value={day} max={dayOf(new Date(now))} onChange={event => setDay(event.target.value)} aria-invalid={!!show("when")} />
            </div>
            <div className={styles.field}>
              <label htmlFor="m-time">Jam</label>
              <input id="m-time" type="time" value={time} onChange={event => setTime(event.target.value)} aria-invalid={!!show("when")} />
            </div>
          </div>
          {show("when") && <p className={styles.error}>{show("when")}</p>}

          <fieldset className={styles.fieldset}>
            <legend>Jenis</legend>
            <div className={styles.segmented}>
              {(["klaim", "tamu", "tim"] as Kind[]).map(item => (
                <label key={item} data-checked={kind === item ? "true" : undefined}>
                  <input type="radio" name="m-kind" value={item} checked={kind === item} onChange={() => setKind(item)} data-autofocus={kind === item ? true : undefined} />
                  {KIND_LABEL[item]}
                </label>
              ))}
            </div>
          </fieldset>

          <PersonPicker
            id="m-person" labelText={kind === "tamu" ? "PIC tamu" : "Nama karyawan"} value={person} onChange={setPerson}
            people={PEOPLE} error={show("person")}
          />
          {kind === "klaim" && person && (
            <p className={styles.claimLine} data-full={full ? "true" : undefined} role="status">
              {full
                ? `Jatah ${MONTHS[Number(month.slice(5)) - 1]} ${shortName(person.name)} sudah habis (${used} dari ${quota}). Bila untuk rapat, pilih Tim · rapat.`
                : `Ini klaim ke-${used + 1} dari ${quota} bulan ${MONTHS[Number(month.slice(5)) - 1]}.`}
            </p>
          )}
          {kind === "tim" && <p className={styles.small}>Minuman tim saat rapat tidak memakai jatah, tetapi dicatat atas nama orangnya.</p>}
          {kind === "tamu" && (
            <div className={styles.twoCol}>
              <div className={styles.field}>
                <label htmlFor="m-guest">Tamu/instansi <span className={styles.optional}>(opsional)</span></label>
                <input id="m-guest" value={guest} onChange={event => setGuest(event.target.value)} />
              </div>
              <div className={styles.field}>
                <label htmlFor="m-count">Jumlah tamu <span className={styles.optional}>(opsional)</span></label>
                <input id="m-count" type="number" min={1} inputMode="numeric" value={guestCount} onChange={event => setGuestCount(event.target.value)} />
              </div>
            </div>
          )}
          {kind !== "klaim" && (
            <div className={styles.field}>
              <label htmlFor="m-room">Ruangan</label>
              <select id="m-room" value={room} onChange={event => setRoom(event.target.value)}>
                {[...ROOMS, "Lainnya"].map(item => <option key={item}>{item}</option>)}
              </select>
            </div>
          )}

          <div className={kind === "klaim" ? undefined : styles.drinkRow}>
            <div className={styles.field}>
              <label htmlFor="m-drink">Minuman</label>
              <select id="m-drink" value={slug} onChange={event => setSlug(event.target.value)}>
                <optgroup label="Kopi">{DRINKS.filter(item => item.group === "kopi").map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}</optgroup>
                <optgroup label="Non-kopi">{DRINKS.filter(item => item.group === "non-kopi").map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}</optgroup>
                <option value="lainnya">Lainnya (tulis sendiri)</option>
              </select>
            </div>
            {kind !== "klaim" && (
              <div className={styles.field}>
                <label htmlFor="m-qty">Jumlah</label>
                <input id="m-qty" type="number" min={1} max={30} value={qty} onChange={event => setQty(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} />
              </div>
            )}
          </div>
          {slug === "lainnya" && (
            <div className={styles.field}>
              <label htmlFor="m-other">Nama minuman</label>
              <input id="m-other" value={other} onChange={event => setOther(event.target.value)} aria-invalid={!!show("other")} aria-describedby={show("other") ? "m-other-error" : undefined} />
              {show("other") && <p id="m-other-error" className={styles.error}>{show("other")}</p>}
            </div>
          )}

          <fieldset className={styles.fieldset}>
            <legend>Suhu</legend>
            <div className={styles.segmented}>
              {(["panas", "es"] as Temperature[]).map(item => (
                <label key={item} data-checked={temp === item ? "true" : undefined} data-disabled={!temps.includes(item) ? "true" : undefined}>
                  <input type="radio" name="m-temp" checked={temp === item} disabled={!temps.includes(item)} onChange={() => setTemperature(item)} />
                  {item === "panas" ? "Panas" : "Es"}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className={styles.fieldset}>
            <legend>Gula</legend>
            <div className={styles.chips}>
              {SUGAR_LEVELS.map(level => (
                <label key={level} data-checked={sugar === level ? "true" : undefined}>
                  <input type="radio" name="m-sugar" checked={sugar === level} onChange={() => setSugar(level)} />{level}
                </label>
              ))}
            </div>
          </fieldset>
          {temp === "es" && (
            <fieldset className={styles.fieldset}>
              <legend>Takaran es</legend>
              <div className={styles.chips}>
                {ICE_LEVELS.map(level => (
                  <label key={level} data-checked={ice === level ? "true" : undefined}>
                    <input type="radio" name="m-ice" checked={ice === level} onChange={() => setIce(level)} />{level}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
        <div className={styles.sheetFoot}>
          <p className={styles.small}>Dicatat oleh {shortName(label(actor))}</p>
          <button type="button" className={styles.secondary} onClick={onClose}>Batal</button>
          <button type="submit" className={styles.primary} aria-disabled={tried && invalid ? true : undefined}><Check size={18} aria-hidden />Simpan</button>
        </div>
      </form>
    </Layer>
  );
}

/* ---------- Rekap */
type RekapTab = "ringkasan" | "detail";
function RekapView({ rows, today, phone }: { rows: Row[]; today: string; phone: boolean }) {
  const current = today.slice(0, 7);
  const months = [current, prevMonth(current)];
  const [month, setMonth] = useState(current);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<Kind | "semua">("semua");
  const [status, setStatus] = useState<Status | "semua">("semua");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<RekapTab>("ringkasan");
  const [newest, setNewest] = useState(true);
  const [excel, setExcel] = useState(false);
  const [filterSheet, setFilterSheet] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(row => {
      const day = dayOf(new Date(row.at));
      if (day.slice(0, 7) !== month) return false;
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (kind !== "semua" && row.kind !== kind) return false;
      if (status !== "semua" && row.status !== status) return false;
      if (q && !`${row.name} ${row.pic} ${row.drink} ${row.guest} ${row.bu} ${row.no}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key));
  }, [rows, month, from, to, kind, status, query]);
  const summary = useMemo(() => summarize(filtered), [filtered]);
  const title = `${monthName(month)}${from || to ? ` · ${from ? shortDate(isoAt(from, "12:00")) : "awal"} s.d. ${to ? shortDate(isoAt(to, "12:00")) : "akhir"}` : ""}`;
  const filterOn = !!(from || to || kind !== "semua" || status !== "semua" || query);
  const clear = () => { setFrom(""); setTo(""); setKind("semua"); setStatus("semua"); setQuery(""); };

  const downloadCsv = () => {
    const lines = [DETAIL_HEAD, ...filtered.map(detailCells)].map(cells => cells.map(csvCell).join(","));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `werkudara-coffee-rekap-${month}${from || to ? `-${from || "awal"}-${to || "akhir"}` : ""}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (excel) return <ExcelPreview rows={filtered} summary={summary} title={title} onBack={() => setExcel(false)} />;

  const minDay = `${month}-01`, maxDay = month === current ? today : `${month}-${lastDay(month)}`;
  const filterFields = (
    <>
        <div className={styles.field}>
          <label htmlFor="r-month">Bulan</label>
          <select id="r-month" value={month} onChange={event => { setMonth(event.target.value); setFrom(""); setTo(""); }}>
            {months.map(item => <option key={item} value={item}>{monthName(item)}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="r-from">Dari tanggal</label>
          <input id="r-from" type="date" min={minDay} max={to || maxDay} value={from} onChange={event => setFrom(event.target.value)} />
        </div>
        <div className={styles.field}>
          <label htmlFor="r-to">Sampai tanggal</label>
          <input id="r-to" type="date" min={from || minDay} max={maxDay} value={to} onChange={event => setTo(event.target.value)} />
        </div>
        <div className={styles.field}>
          <label htmlFor="r-status">Status</label>
          <select id="r-status" value={status} onChange={event => setStatus(event.target.value as Status | "semua")}>
            <option value="semua">Semua status</option>
            {(["selesai", "diproses", "ditolak"] as Status[]).map(item => <option key={item} value={item}>{STATUS_LABEL[item]}</option>)}
          </select>
        </div>
        <div className={`${styles.field} ${styles.searchField}`}>
          <label htmlFor="r-search">Cari</label>
          <div className={styles.combo}>
            <Search size={18} aria-hidden className={styles.comboIcon} />
            <input id="r-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nama, PIC, minuman, nomor" />
          </div>
        </div>
        <div className={styles.kindFilter}>
          <span id="r-kind">Jenis</span>
          <div className={styles.chips} role="group" aria-labelledby="r-kind">
            {(["semua", "klaim", "tamu", "tim"] as const).map(item => (
              <button key={item} type="button" aria-pressed={kind === item} onClick={() => setKind(item)}>{item === "semua" ? "Semua" : KIND_LABEL[item]}</button>
            ))}
          </div>
          {filterOn && <button type="button" className={styles.textButton} onClick={clear}>Hapus filter</button>}
        </div>
    </>
  );
  return (
    <>
      <header className={styles.top}>
        <div>
          <h1>Rekap</h1>
          <p>Satu baris per minuman. Filter, lalu unduh untuk diolah sendiri.</p>
        </div>
        <div className={styles.topActions}>
          <button type="button" className={styles.secondary} onClick={downloadCsv}><Download size={18} aria-hidden />Unduh CSV</button>
          <button type="button" className={styles.primary} onClick={() => setExcel(true)}><FileSpreadsheet size={18} aria-hidden />Unduh Excel</button>
        </div>
      </header>

      {phone ? (
        <div className={styles.filterBar}>
          <button type="button" className={styles.secondary} onClick={() => setFilterSheet(true)} aria-haspopup="dialog">
            <SlidersHorizontal size={18} aria-hidden />Filter{filterOn ? ` · ${[from || to, kind !== "semua", status !== "semua", query].filter(Boolean).length} aktif` : ""}
          </button>
          <span>{title}{kind !== "semua" ? ` · ${KIND_LABEL[kind]}` : ""}</span>
        </div>
      ) : <section className={styles.filters} aria-label="Filter rekap">{filterFields}</section>}
      {phone && filterSheet && (
        <Layer onClose={() => setFilterSheet(false)} labelledBy="filter-title">
          <div className={styles.dialogHead}>
            <h2 id="filter-title">Filter rekap</h2>
            <button type="button" className={styles.iconButton} aria-label="Tutup" onClick={() => setFilterSheet(false)}><X size={20} aria-hidden /></button>
          </div>
          <div className={styles.filterSheet}>{filterFields}</div>
          <div className={styles.dialogActions}>
            <button type="button" className={styles.primary} onClick={() => setFilterSheet(false)}>Lihat {filtered.length} baris</button>
          </div>
        </Layer>
      )}

      <section className={styles.stats} aria-label={`Angka ${title}`}>
        <div className={styles.stat} data-main="true">
          <span>Total minuman</span><strong>{summary.total}</strong>
          <small>klaim + tamu + tim · rapat</small>
        </div>
        <div className={styles.stat}><span>Klaim</span><strong>{summary.klaim}</strong><small>memakai jatah</small></div>
        <div className={styles.stat}><span>Tamu</span><strong>{summary.tamu}</strong><small>dari {summary.meetings} rapat</small></div>
        <div className={styles.stat}><span>Tim · rapat</span><strong>{summary.tim}</strong><small>tanpa jatah</small></div>
        <div className={styles.stat} data-tone="no"><span>Ditolak</span><strong>{summary.refused}</strong><small>jatah tidak terpakai</small></div>
      </section>

      <div className={styles.tabs} role="tablist" aria-label="Tampilan rekap">
        {(["ringkasan", "detail"] as RekapTab[]).map(item => (
          <button key={item} type="button" role="tab" id={`tab-${item}`} aria-selected={tab === item} aria-controls={`panel-${item}`} onClick={() => setTab(item)}>
            {item === "ringkasan" ? "Ringkasan" : `Detail · ${filtered.length} baris`}
          </button>
        ))}
        <span className={styles.tabsNote}>{title}</span>
      </div>

      {tab === "ringkasan" ? (
        <div id="panel-ringkasan" role="tabpanel" aria-labelledby="tab-ringkasan" className={styles.summaryGrid}>
          <section className={`${styles.panel} ${styles.peoplePanel}`} aria-labelledby="s-people">
            <h2 id="s-people">Per orang</h2>
            {phone ? (
              <ul className={styles.cardList}>
                {summary.people.map(({ person, quota, used, team, refused }) => (
                  <li key={person.name}>
                    <span className={styles.cardListMain}>
                      <strong>{person.name.replace(/^Contoh /, "")}</strong>
                      <span>{GROUP_LABEL[person.group]} · {person.bu}{team ? ` · tim · rapat ${team}` : ""}{refused ? ` · ditolak ${refused}` : ""}</span>
                    </span>
                    <span className={styles.cardListSide}><Dots used={used} quota={quota} /><span className={styles.num}>{used >= quota ? "Habis" : `${used}/${quota}`}</span></span>
                  </li>
                ))}
              </ul>
            ) : (
            <div className={styles.tableBox}>
              <table className={styles.table}>
                <thead><tr><th scope="col">Nama</th><th scope="col">Kelompok</th><th scope="col">BU</th><th scope="col">Jatah terpakai</th><th scope="col" className={styles.num}>Tim · rapat</th><th scope="col" className={styles.num}>Ditolak</th></tr></thead>
                <tbody>
                  {summary.people.map(({ person, quota, used, team, refused }) => (
                    <tr key={person.name}>
                      <th scope="row">{person.name.replace(/^Contoh /, "")}</th>
                      <td>{GROUP_LABEL[person.group]}</td>
                      <td>{person.bu}</td>
                      <td><span className={styles.quotaCell}><Dots used={used} quota={quota} /><span className={styles.num}>{used}/{quota}</span>{used >= quota && <span className={styles.pill} data-tone="off">Habis</span>}</span></td>
                      <td className={styles.num}>{team || "–"}</td>
                      <td className={styles.num}>{refused || "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </section>
          <section className={styles.panel} aria-labelledby="s-drinks">
            <h2 id="s-drinks">Per minuman</h2>
            <ul className={styles.bars}>
              {summary.drinks.map(item => (
                <li key={item.drink}>
                  <span className={styles.barName}>{item.drink}</span>
                  <span className={styles.barTrack} aria-hidden><span style={{ width: `${(item.count / (summary.drinks[0]?.count || 1)) * 100}%` }} /></span>
                  <span className={styles.num}>{item.count}</span>
                </li>
              ))}
              {!summary.drinks.length && <li className={styles.small}>Tidak ada data untuk filter ini.</li>}
            </ul>
          </section>
          <section className={styles.panel} aria-labelledby="s-pic">
            <h2 id="s-pic">Per PIC tamu</h2>
            {phone ? (
              <ul className={styles.cardList}>
                {summary.pics.map(pic => (
                  <li key={pic.pic}>
                    <span className={styles.cardListMain}><strong>{pic.pic.replace(/^Contoh /, "")}</strong><span>{pic.meetings} rapat · {pic.guests} tamu</span></span>
                    <span className={styles.cardListSide}><strong className={styles.num}>{pic.drinks}</strong> minuman</span>
                  </li>
                ))}
                {!summary.pics.length && <li className={styles.small}>Tidak ada tamu untuk filter ini.</li>}
              </ul>
            ) : (
            <div className={styles.tableBox}>
              <table className={styles.table}>
                <thead><tr><th scope="col">PIC</th><th scope="col" className={styles.num}>Rapat</th><th scope="col" className={styles.num}>Tamu (orang)</th><th scope="col" className={styles.num}>Minuman</th></tr></thead>
                <tbody>
                  {summary.pics.map(pic => (
                    <tr key={pic.pic}><th scope="row">{pic.pic.replace(/^Contoh /, "")}</th><td className={styles.num}>{pic.meetings}</td><td className={styles.num}>{pic.guests}</td><td className={styles.num}>{pic.drinks}</td></tr>
                  ))}
                  {!summary.pics.length && <tr><td colSpan={4} className={styles.small}>Tidak ada tamu untuk filter ini.</td></tr>}
                </tbody>
              </table>
            </div>
            )}
          </section>
          <section className={styles.panel} aria-labelledby="s-bu">
            <h2 id="s-bu">Per BU</h2>
            {phone ? (
              <ul className={styles.cardList}>
                {summary.bus.map(bu => (
                  <li key={bu.bu}>
                    <span className={styles.cardListMain}><strong>{bu.bu}</strong><span>Klaim {bu.klaim} · tamu {bu.tamu} · tim · rapat {bu.tim}</span></span>
                    <span className={styles.cardListSide}><strong className={styles.num}>{bu.total}</strong></span>
                  </li>
                ))}
              </ul>
            ) : (
            <div className={styles.tableBox}>
              <table className={styles.table}>
                <thead><tr><th scope="col">BU</th><th scope="col" className={styles.num}>Klaim</th><th scope="col" className={styles.num}>Tamu</th><th scope="col" className={styles.num}>Tim · rapat</th><th scope="col" className={styles.num}>Total</th></tr></thead>
                <tbody>
                  {summary.bus.map(bu => (
                    <tr key={bu.bu}><th scope="row">{bu.bu}</th><td className={styles.num}>{bu.klaim}</td><td className={styles.num}>{bu.tamu}</td><td className={styles.num}>{bu.tim}</td><td className={styles.num}><strong>{bu.total}</strong></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
            <p className={styles.small}>Tamu dihitung ke BU PIC-nya.</p>
          </section>
        </div>
      ) : (
        <div id="panel-detail" role="tabpanel" aria-labelledby="tab-detail" className={styles.panel}>
          <DetailTable rows={newest ? [...filtered].reverse() : filtered} newest={newest} onSort={() => setNewest(value => !value)} />
        </div>
      )}
    </>
  );
}

function DetailTable({ rows, newest, onSort }: { rows: Row[]; newest: boolean; onSort: () => void }) {
  if (!rows.length) return <p className={styles.small}>Tidak ada baris untuk filter ini.</p>;
  const plain = (name: string) => name.replace(/^Contoh /, "");
  return (
    <div className={`${styles.tableBox} ${styles.detailBox}`} tabIndex={0} aria-label="Tabel detail, bisa digulir ke samping">
      <table className={`${styles.table} ${styles.detail}`}>
        <thead>
          <tr>
            <th scope="col" aria-sort={newest ? "descending" : "ascending"}>
              <button type="button" className={styles.sortButton} onClick={onSort}>Tanggal<ArrowUpDown size={14} aria-hidden /><span className={styles.srOnly}>, urutkan {newest ? "terlama dulu" : "terbaru dulu"}</span></button>
            </th>
            {DETAIL_HEAD.slice(1, 21).map(head => <th key={head} scope="col">{head}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key}>
              <td className={styles.num}>{sheetDate(row.at)}</td>
              <td className={styles.num}>{timeOf(new Date(row.at))}</td>
              <td className={styles.num}>{row.no}</td>
              <td>{KIND_LABEL[row.kind]}</td>
              <td className={styles.nameCell}>{plain(row.name)}</td>
              <td>{row.group}</td>
              <td>{row.position}</td>
              <td>{row.bu}</td>
              <td>{plain(row.pic) || "–"}</td>
              <td>{row.guest || "–"}</td>
              <td className={styles.num}>{row.kind === "tamu" && row.guestCount ? row.guestCount : "–"}</td>
              <td>{row.room || "–"}</td>
              <td className={styles.nameCell}>{row.drink}</td>
              <td>{row.temperature === "es" ? "Es" : "Panas"}</td>
              <td>{row.sugar}</td>
              <td>{iceText(row) || "–"}</td>
              <td>
                <span className={styles.statusCell}>
                  <span className={styles.pill} data-tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</span>
                  {row.manual && <span className={styles.pill} data-tone="off">Dicatat manual</span>}
                </span>
              </td>
              <td>{row.reason || "–"}</td>
              <td>{plain(row.doneBy) || "–"}</td>
              <td className={styles.num}>{row.doneAt ? timeOf(new Date(row.doneAt)) : "–"}</td>
              <td className={styles.num}>{row.claimNo ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Excel preview */
function ExcelPreview({ rows, summary, title, onBack }: { rows: Row[]; summary: Summary; title: string; onBack: () => void }) {
  const [sheet, setSheet] = useState<"Detail" | "Ringkasan">("Detail");
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => { back.current?.focus(); }, []);
  const data = sheet === "Detail" ? [DETAIL_HEAD, ...rows.slice(0, 40).map(detailCells)] : summarySheet(summary, title);
  const width = Math.max(...data.map(cells => cells.length));
  const letters = Array.from({ length: width }, (_, index) => String.fromCharCode(65 + index));
  const more = sheet === "Detail" ? rows.length - 40 : 0;
  return (
    <>
      <header className={styles.top}>
        <div>
          <button ref={back} type="button" className={styles.textButton} onClick={onBack}><ArrowLeft size={18} aria-hidden />Kembali ke rekap</button>
          <h1>Pratinjau Excel</h1>
          <p>werkudara-coffee-rekap.xlsx · {title} · dua lembar: Detail ({rows.length} baris) dan Ringkasan.</p>
        </div>
      </header>
      <div className={styles.notice} role="note">
        <FileSpreadsheet size={20} aria-hidden />
        <p>Di prototype ini file .xlsx belum dibuat. Unduhan Excel asli menyusul saat halaman tersambung ke server; isinya sama dengan pratinjau ini. Untuk sekarang pakai <strong>Unduh CSV</strong>.</p>
      </div>
      <div className={styles.sheetFrame}>
        <div className={`${styles.tableBox} ${styles.gridBox}`} tabIndex={0} aria-label={`Lembar ${sheet}`}>
          <table className={styles.grid}>
            <thead><tr><th aria-hidden />{letters.map(letter => <th key={letter} scope="col">{letter}</th>)}</tr></thead>
            <tbody>
              {data.map((cells, index) => (
                <tr key={index} data-head={sheet === "Detail" ? index === 0 || undefined : (index === 0 || /^Per /.test(cells[0] ?? "")) || undefined}>
                  <th scope="row">{index + 1}</th>
                  {letters.map((_, col) => <td key={col}>{cells[col] ?? ""}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {more > 0 && <p className={styles.more}>… {more} baris lagi di file</p>}
        </div>
        <div className={styles.sheetTabs} role="tablist" aria-label="Lembar">
          {(["Detail", "Ringkasan"] as const).map(name => (
            <button key={name} type="button" role="tab" aria-selected={sheet === name} onClick={() => setSheet(name)}>{name}</button>
          ))}
        </div>
      </div>
    </>
  );
}

/* ---------- Pengaturan (placeholder) */
function SettingsView() {
  return (
    <>
      <header className={styles.top}>
        <div>
          <h1>Pengaturan</h1>
          <p>Hanya tampilan di prototype. Pengaturan sebenarnya di /admin/coffee.</p>
        </div>
      </header>
      <div className={styles.settingsGrid}>
        <section className={styles.panel} aria-labelledby="set-quota">
          <h2 id="set-quota">Jatah per bulan</h2>
          <dl className={styles.kv}>
            {(Object.keys(MONTHLY_QUOTA) as QuotaGroup[]).map(group => <div key={group}><dt>{GROUP_LABEL[group]}</dt><dd>{MONTHLY_QUOTA[group]} klaim</dd></div>)}
            <div><dt>Tamu</dt><dd>Tanpa batas, dicatat atas nama PIC</dd></div>
            <div><dt>Tim · rapat</dt><dd>Tanpa jatah, dicatat atas nama orangnya</dd></div>
          </dl>
          <p className={styles.small}>Bulan kalender WIB. Klaim yang ditolak tidak memakai jatah.</p>
        </section>
        <section className={styles.panel} aria-labelledby="set-access">
          <h2 id="set-access">Pemegang akses Werkudara Coffee</h2>
          <ul className={styles.recent}>
            {ACTORS.map(actor => (
              <li key={actor.name}><span className={styles.avatar} aria-hidden>{actor.name.replace(/^Contoh /, "")[0]}</span>
                <span className={styles.recentText}><strong>{actor.name.replace(/^Contoh /, "")}</strong><span>{actor.role} · menerima semua pesanan</span></span></li>
            ))}
          </ul>
          <p className={styles.small}>Siapa pun yang lebih dulu membuka pesanan memprosesnya. Pemesan melihat namanya.</p>
        </section>
        <section className={styles.panel} aria-labelledby="set-room">
          <h2 id="set-room">Ruangan</h2>
          <ul className={styles.plainList}>{[...ROOMS, "Lainnya (isi sendiri)"].map(room => <li key={room}>{room}</li>)}</ul>
        </section>
      </div>
    </>
  );
}

