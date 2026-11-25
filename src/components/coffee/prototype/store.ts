"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Ice, QuotaGroup, Sugar, Temperature } from "@/lib/coffee/menu";

/*
 * The prototypes' shared make-believe data (25 Nov 2026): GA's tablet (/dev-preview/coffee/ga) and
 * the pengelola page (/dev-preview/coffee/hr) read and write it, so an order sent from one shows on
 * the other, also across tabs. It lives in this browser's localStorage only; nothing reaches a server.
 * Names are made up ("Contoh ...").
 */

export type Status = "diproses" | "selesai" | "ditolak" | "batal";
export type Drinkline = { slug: string; temperature: Temperature; sugar: Sugar; ice: Ice };

/** An employee's own claim (from the HP app), or one recorded by hand by a pengelola. */
export type Claim = Drinkline & {
  id: string; kind: "klaim"; person: string; group: QuotaGroup; position: string; bu: string;
  claimNo: number; at: string; status: Status; manual?: boolean; doneBy?: string; doneAt?: string; reason?: string;
};
/** One line of a meeting order: a guest's drink or a team member's (no quota). */
export type MeetingItem = Drinkline & { id: string; for: "tamu" | "tim"; person?: string; qty: number };
export type Meeting = {
  id: string; kind: "rapat"; room: string; spot?: string; pic: string; guest?: string; guestCount?: number;
  items: MeetingItem[]; at: string; status: Status; sentBy: string; doneBy?: string; doneAt?: string; reason?: string;
  /** Rounds added later to the same meeting ("Tambah lagi"); each is sent and processed on its own. */
  round: number;
};
export type CoffeeState = { claims: Claim[]; meetings: Meeting[]; seq: { claim: number; meeting: number } };

const KEY = "werkudara-coffee-prototype-v1";
const today = (time: string) => {
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(new Date());
  return new Date(`${day}T${time}:00+07:00`).toISOString();
};

/** A busy morning: three claims waiting, one meeting order waiting, some already done. */
export function seedState(): CoffeeState {
  const claim = (id: number, person: string, group: QuotaGroup, position: string, bu: string, slug: string, opts: Partial<Claim>): Claim => ({
    id: `K-${id}`, kind: "klaim", person, group, position, bu, slug, temperature: "panas", sugar: "Normal", ice: "Normal",
    claimNo: 1, at: today("08:40"), status: "diproses", ...opts,
  });
  return {
    claims: [
      claim(415, "Contoh Rina Putri", "karyawan", "Communications Specialist", "WNS", "cafe-latte", { claimNo: 2, at: today("09:12"), temperature: "es", sugar: "Sedikit" }),
      claim(416, "Contoh Bagas Saputra", "ga", "General Affair", "WNS", "kopi-susu", { claimNo: 1, at: today("09:20") }),
      claim(417, "Contoh Maya Lestari", "karyawan", "Account Executive", "TEE", "americano", { claimNo: 4, at: today("09:31"), sugar: "Tanpa" }),
      claim(412, "Contoh Fajar Nugroho", "intern", "Design Intern", "CoE", "matcha-latte", { claimNo: 1, at: today("08:05"), status: "selesai", doneBy: "Contoh Dewi Lestari (HR)", doneAt: today("08:14") }),
      claim(413, "Contoh Arief Hidayat", "karyawan", "Finance Staff", "WNS", "cappuccino", { claimNo: 3, at: today("08:22"), status: "ditolak", reason: "Susu segar sedang habis.", doneBy: "Contoh Dewi Lestari (HR)", doneAt: today("08:30") }),
    ],
    meetings: [
      {
        id: "T-0112", kind: "rapat", room: "Kaliya Limasan", spot: "limasan", pic: "Contoh Dimas Pratama", guest: "PT Sinar Jaya", guestCount: 5,
        at: today("09:40"), status: "diproses", sentBy: "Contoh Bagas Saputra (GA)", round: 1,
        items: [
          { id: "a", for: "tamu", slug: "kopi-susu", temperature: "panas", sugar: "Normal", ice: "Normal", qty: 3 },
          { id: "b", for: "tamu", slug: "cappuccino", temperature: "panas", sugar: "Sedikit", ice: "Normal", qty: 2 },
          { id: "c", for: "tim", person: "Contoh Andi Wijaya", slug: "americano", temperature: "panas", sugar: "Tanpa", ice: "Normal", qty: 1 },
        ],
      },
      {
        id: "T-0110", kind: "rapat", room: "CFC Ananta Room", spot: "ananta", pic: "Contoh Sari Wulandari", guest: "Bank Nusantara", guestCount: 3,
        at: today("08:50"), status: "selesai", sentBy: "Contoh Bagas Saputra (GA)", doneBy: "Contoh Raka Aditya (Admin)", doneAt: today("09:02"), round: 1,
        items: [
          { id: "a", for: "tamu", slug: "cafe-latte", temperature: "es", sugar: "Normal", ice: "Normal", qty: 2 },
          { id: "b", for: "tamu", slug: "classic-tea", temperature: "panas", sugar: "Kurang", ice: "Normal", qty: 1 },
        ],
      },
    ],
    seq: { claim: 418, meeting: 113 },
  };
}

let cache: CoffeeState | null = null;
const listeners = new Set<() => void>();
const read = (): CoffeeState => {
  if (cache) return cache;
  try { const raw = localStorage.getItem(KEY); cache = raw ? JSON.parse(raw) as CoffeeState : seedState(); }
  catch { cache = seedState(); }
  return cache;
};
const SERVER = seedState();
function write(next: CoffeeState) {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: this tab only */ }
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === KEY) { cache = null; listener(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

/** The shared prototype data and a way to change it; `reset` goes back to the seed. */
export function useCoffeeStore() {
  const state = useSyncExternalStore(subscribe, read, () => SERVER);
  const update = useCallback((change: (state: CoffeeState) => CoffeeState) => write(change(read())), []);
  const reset = useCallback(() => write(seedState()), []);
  return { state, update, reset };
}

export const nowIso = () => new Date().toISOString();
export const clockOf = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
/** "Contoh Dewi Lestari (HR)" → "Dewi (HR)". */
export const shortName = (name: string) => name.replace(/^Contoh /, "").replace(/^(\S+)(?:\s[^(]+)?(\s\(.+\))?$/, "$1$2");
