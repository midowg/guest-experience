import { z } from "zod";
import { personKey } from "./mission";

/*
 * Misi Perjalanan's room list (Admin Pra WAM → Misi Perjalanan, 24 Nov 2026): the rooms with the
 * number people see, the HoD in them with their quiz hints and sleeping hours, and the BoD. It holds
 * real names, so it lives in pw_settings ('mission_journey'), never in the code. A room's key is
 * internal; a key starting with "C" is a men's room, which keeps the quiz's other names in the same
 * group of rooms.
 */
export type SheetPerson = { name: string; nick: string; dept: string; room: string; sleep: string | null; wake: string | null; sents: number[]; hints: string[] };
export type SheetBod = { name: string; sents: number[]; ceo?: boolean };
export type MissionSheet = { rooms: Record<string, string>; people: SheetPerson[]; bod: SheetBod[] };
export const EMPTY_SHEET: MissionSheet = { rooms: {}, people: [], bod: [] };
export const HINTS_MAX = 3;

export const isMenRoom = (key: string) => key.startsWith("C");

const text = (label: string, max: number) => z.string().trim().max(max, `${label} paling panjang ${max} huruf.`);
const sents = z.array(z.number().int().min(1, "Nomor kalimat 1–12.").max(12, "Nomor kalimat 1–12.")).max(3, "Paling banyak 3 kalimat.");
const hour = z.string().trim().max(40, "Jam paling panjang 40 huruf.").nullable();

/** What the admin may save: sensible sizes, every person in a room that exists, no name twice. */
export const missionSheetSchema = z.object({
  rooms: z.record(z.string().regex(/^[A-Za-z0-9_-]{1,12}$/, "Kode kamar tidak dikenal."), text("Nomor kamar", 20).min(1, "Isi nomor kamar.")),
  people: z.array(z.object({
    name: text("Nama", 120).min(2, "Isi nama lengkap HoD."), nick: text("Panggilan", 40), dept: text("Departemen", 80),
    room: z.string().min(1, "Pilih kamar."), sleep: hour, wake: hour, sents,
    hints: z.array(text("Petunjuk", 240)).max(HINTS_MAX, `Paling banyak ${HINTS_MAX} petunjuk.`),
  })).max(200),
  bod: z.array(z.object({ name: text("Nama", 120).min(2, "Isi nama lengkap BoD."), sents, ceo: z.boolean().optional() })).max(30),
}).superRefine((sheet, ctx) => {
  sheet.people.forEach((person, index) => {
    if (!(person.room in sheet.rooms)) ctx.addIssue({ code: "custom", path: ["people", index, "room"], message: `Kamar untuk ${person.name || "HoD"} belum dipilih atau sudah dihapus.` });
  });
  const seen = new Set<string>();
  for (const name of [...sheet.people.map(person => person.name), ...sheet.bod.map(person => person.name)]) {
    const key = personKey(name);
    if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["people"], message: `${name} tercatat dua kali.` });
    seen.add(key);
  }
  const codes = Object.values(sheet.rooms).map(code => code.trim().toUpperCase());
  if (new Set(codes).size !== codes.length) ctx.addIssue({ code: "custom", path: ["rooms"], message: "Ada nomor kamar yang sama." });
});

const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const nums = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is number => Number.isInteger(item) && item >= 1 && item <= 12).slice(0, 3) : []);

/** A stored list read leniently for the editor: missing parts empty, odd values left out. */
export function asMissionSheet(value: unknown): MissionSheet {
  if (!value || typeof value !== "object") return EMPTY_SHEET;
  const raw = value as Record<string, unknown>;
  const rooms: Record<string, string> = {};
  if (raw.rooms && typeof raw.rooms === "object") for (const [key, code] of Object.entries(raw.rooms as Record<string, unknown>)) if (typeof code === "string") rooms[key] = code;
  const people = (Array.isArray(raw.people) ? raw.people : []).filter(item => item && typeof item === "object").map(item => {
    const person = item as Record<string, unknown>;
    return {
      name: str(person.name), nick: str(person.nick), dept: str(person.dept), room: str(person.room),
      sleep: typeof person.sleep === "string" ? person.sleep : null, wake: typeof person.wake === "string" ? person.wake : null,
      sents: nums(person.sents), hints: (Array.isArray(person.hints) ? person.hints : []).filter((hint): hint is string => typeof hint === "string").slice(0, HINTS_MAX),
    };
  });
  const bod = (Array.isArray(raw.bod) ? raw.bod : []).filter(item => item && typeof item === "object").map(item => {
    const person = item as Record<string, unknown>;
    return { name: str(person.name), sents: nums(person.sents), ...(person.ceo === true ? { ceo: true } : {}) };
  });
  return { rooms, people, bod };
}

/** "6, 12" → [6, 12]; anything else left out. */
export const parseSentences = (text: string) => [...new Set(text.split(/[\s,;]+/).map(Number).filter(value => Number.isInteger(value) && value >= 1 && value <= 12))].slice(0, 3);
