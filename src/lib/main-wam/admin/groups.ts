import { z } from "zod";
import { ACTIVITY_GROUP_KINDS, type ActivityGroupKind, type MwActivityGroup, type MwGroup } from "../types";
import { activityKindLabels } from "./labels";
import { matchPerson, type AdminPerson } from "./people";
import type { ImportRow } from "./rundown";
import { MAX_PASTE_ROWS, cellAt, fold, parseTsv, readColumns, yesNo } from "./tsv";

/*
 * Admin WAM → Main WAM → Kelompok (agen E): kelompok ("Kelompok 4 · Arjuno", one per person, one
 * koordinator) and kelompok kegiatan (per session: a post, a minibus, a table; one per person per
 * session), typed or pasted from a sheet. Pure: tested without a server.
 */

export const MAX_MEMBERS = 200;

export const groupInputSchema = z.object({
  number: z.number({ message: "Isi nomor kelompok." }).int("Nomor kelompok bilangan bulat.").min(1, "Nomor kelompok 1–99.").max(99, "Nomor kelompok 1–99."),
  name: z.string().trim().min(1, "Tulis nama kelompok.").max(40, "Nama kelompok paling panjang 40 karakter."),
});
export type GroupInput = z.infer<typeof groupInputSchema>;

export const membersInputSchema = z.object({
  employeeIds: z.array(z.uuid()).max(MAX_MEMBERS, `Paling banyak ${MAX_MEMBERS} anggota.`),
  coordinatorId: z.uuid().nullable(),
}).superRefine((value, ctx) => {
  if (new Set(value.employeeIds).size !== value.employeeIds.length) ctx.addIssue({ code: "custom", path: ["employeeIds"], message: "Ada anggota yang tertulis dua kali." });
  if (value.coordinatorId && !value.employeeIds.includes(value.coordinatorId)) ctx.addIssue({ code: "custom", path: ["coordinatorId"], message: "Koordinator harus anggota kelompok ini." });
});
export type MembersInput = z.infer<typeof membersInputSchema>;

/** A kelompok with its people, as the import saves it. */
export const groupImportSchema = z.object({
  groups: z.array(groupInputSchema.extend({ employeeIds: z.array(z.uuid()).max(MAX_MEMBERS), coordinatorId: z.uuid().nullable() })).min(1, "Tidak ada kelompok yang bisa disimpan.").max(99),
}).superRefine((value, ctx) => {
  const numbers = new Set<number>(), people = new Set<string>();
  value.groups.forEach((group, index) => {
    if (numbers.has(group.number)) ctx.addIssue({ code: "custom", path: ["groups", index, "number"], message: `Kelompok ${group.number} tertulis dua kali.` });
    numbers.add(group.number);
    for (const id of group.employeeIds) {
      if (people.has(id)) ctx.addIssue({ code: "custom", path: ["groups", index, "employeeIds"], message: "Satu orang hanya boleh di satu kelompok." });
      people.add(id);
    }
    if (group.coordinatorId && !group.employeeIds.includes(group.coordinatorId)) ctx.addIssue({ code: "custom", path: ["groups", index, "coordinatorId"], message: "Koordinator harus anggota kelompoknya." });
  });
});
export type GroupImport = z.infer<typeof groupImportSchema>;

/** Who has no kelompok yet (the list flags them). */
export function ungrouped<T extends { id: string }>(people: readonly T[], groups: readonly MwGroup[]): T[] {
  const placed = new Set(groups.flatMap(group => group.members.map(member => member.employeeId)));
  return people.filter(person => !placed.has(person.id));
}

/** employee id → the kelompok they are in. */
export function groupByPerson(groups: readonly MwGroup[]): Map<string, MwGroup> {
  return new Map(groups.flatMap(group => group.members.map(member => [member.employeeId, group] as const)));
}

/** "Kelompok 4 · Arjuno". */
export const groupLabel = (group: Pick<MwGroup, "number" | "name">) => `Kelompok ${group.number} · ${group.name}`;

/** The smallest number not used yet (a new kelompok's default). */
export function nextGroupNumber(groups: readonly Pick<MwGroup, "number">[]): number {
  const used = new Set(groups.map(group => group.number));
  for (let number = 1; number <= 99; number++) if (!used.has(number)) return number;
  return 99;
}

/* ── Impor kelompok ───────────────────────────────────────────────────────────────────────────── */

const GROUP_COLUMNS = {
  number: /^(no(mor)?( kelompok)?|kelompok|nomor kelompok|group)$/,
  name: /^(nama kelompok|nama tim|tim|group name)$/,
  person: /^(nama( karyawan| lengkap| peserta| anggota)?|anggota|karyawan|peserta)$/,
  coordinator: /^(koordinator|ketua|pj|leader)\b/,
};
export const groupColumnLabels = ["Kelompok", "Nama kelompok", "Nama karyawan", "Koordinator"];

export type GroupPasteRow = { number: number; name: string; personId: string; coordinator: boolean };
export type GroupPaste = {
  rows: ImportRow<GroupPasteRow>[];
  groups: GroupImport["groups"];
  header: boolean;
};

/**
 * Kelompok pasted from a sheet, one person per row: the kelompok's number ("4" or "Kelompok 4"),
 * its name (once is enough), the person (full name, or a nama panggilan only one person has), and
 * "ya" for the koordinator. Checked row by row: one kelompok per person, one koordinator per
 * kelompok, one name per number. People already in another kelompok move (the preview says so).
 */
export function parseGroupPaste(paste: string, ctx: { people: readonly AdminPerson[]; groups: readonly MwGroup[] }): GroupPaste {
  const all = parseTsv(paste);
  const { columns, header } = readColumns(all, GROUP_COLUMNS, { number: 0, name: 1, person: 2, coordinator: 3 }, 2);
  const rows = (header ? all.slice(1) : all).slice(0, MAX_PASTE_ROWS);
  const names = new Map<number, { name: string; line: number }>();
  const coordinators = new Map<number, number>();
  const persons = new Map<string, number>();
  const parsed = rows.map((cells, index) => {
    const line = index + (header ? 2 : 1);
    const errors: string[] = [];
    const rawNumber = cellAt(cells, columns.number);
    const numberMatch = fold(rawNumber).match(/^(?:kelompok |klp\.? |tim )?(\d{1,2})$/);
    const number = numberMatch ? Number(numberMatch[1]) : NaN;
    if (!Number.isInteger(number) || number < 1 || number > 99) errors.push(rawNumber ? `Kelompok "${rawNumber}": tulis nomor 1–99.` : "Nomor kelompok kosong.");
    const name = cellAt(cells, columns.name).slice(0, 80);
    if (name.length > 40) errors.push("Nama kelompok paling panjang 40 karakter.");
    const found = matchPerson(cellAt(cells, columns.person), ctx.people);
    if (!found.person) errors.push(found.error);
    const coordinator = yesNo(cellAt(cells, columns.coordinator));
    if (coordinator === null) errors.push(`Koordinator "${cellAt(cells, columns.coordinator)}": tulis ya atau kosongkan.`);
    if (Number.isInteger(number) && name) {
      const known = names.get(number);
      if (known && fold(known.name) !== fold(name)) errors.push(`Kelompok ${number} sudah bernama "${known.name}" di baris ${known.line}.`);
      else if (!known) names.set(number, { name, line });
    }
    if (found.person) {
      const before = persons.get(found.person.id);
      if (before) errors.push(`${found.person.fullName} sudah ada di baris ${before}. Satu orang satu kelompok.`);
      else persons.set(found.person.id, line);
    }
    if (coordinator && Number.isInteger(number)) {
      const before = coordinators.get(number);
      if (before) errors.push(`Kelompok ${number} sudah punya koordinator di baris ${before}.`);
      else coordinators.set(number, line);
    }
    const valid = !errors.length && found.person;
    return { line, cells, errors, input: valid ? { number, name, personId: found.person!.id, coordinator: coordinator === true } : null };
  });
  // A kelompok without a name in the paste keeps its current name, or needs one.
  for (const row of parsed) {
    if (!row.input || row.input.name || names.has(row.input.number)) continue;
    const existing = ctx.groups.find(group => group.number === row.input!.number);
    if (existing) names.set(row.input.number, { name: existing.name, line: 0 });
    else { row.errors.push(`Kelompok ${row.input.number} baru: tulis namanya di salah satu baris.`); row.input = null; }
  }
  const groups = [...new Set(parsed.flatMap(row => (row.input ? [row.input.number] : [])))].sort((a, b) => a - b).map(number => {
    const members = parsed.filter(row => row.input?.number === number).map(row => row.input!);
    return { number, name: names.get(number)!.name, employeeIds: members.map(member => member.personId), coordinatorId: members.find(member => member.coordinator)?.personId ?? null };
  });
  const result = parsed.map(row => ({ ...row, input: row.errors.length ? null : row.input }));
  // Moving someone out of another kelompok is allowed; the preview says where from (movesOut).
  if ((header ? all.length - 1 : all.length) > MAX_PASTE_ROWS) result.push({ line: MAX_PASTE_ROWS + 1, cells: [], input: null, errors: [`Paling banyak ${MAX_PASTE_ROWS} baris sekali impor.`] });
  return { rows: result, groups, header };
}

/** The kelompok a person leaves when the import moves them (shown in the preview). */
export function movesOut(personId: string, toNumber: number, groups: readonly MwGroup[]): MwGroup | null {
  const now = groupByPerson(groups).get(personId);
  return now && now.number !== toNumber ? now : null;
}

/* ── Kelompok kegiatan ────────────────────────────────────────────────────────────────────────── */

export const activityInputSchema = z.object({
  sessionId: z.uuid({ message: "Pilih sesinya." }),
  kind: z.enum(ACTIVITY_GROUP_KINDS, { message: "Jenis: pos, angkot, meja, atau lainnya." }),
  label: z.string().trim().min(1, "Tulis nama, misalnya Pos 2.").max(40, "Nama paling panjang 40 karakter."),
  note: z.string().trim().max(200, "Catatan paling panjang 200 karakter."),
  sort: z.number().int().min(0).max(10_000),
});
export type ActivityInput = z.infer<typeof activityInputSchema>;
export const activityMembersSchema = z.object({ employeeIds: z.array(z.uuid()).max(MAX_MEMBERS) }).refine(value => new Set(value.employeeIds).size === value.employeeIds.length, "Ada anggota yang tertulis dua kali.");

export const activityImportSchema = z.object({
  sessionId: z.uuid({ message: "Pilih sesinya." }),
  groups: z.array(activityInputSchema.omit({ sessionId: true }).extend({ employeeIds: z.array(z.uuid()).max(MAX_MEMBERS) })).min(1, "Tidak ada kelompok kegiatan yang bisa disimpan.").max(100),
}).superRefine((value, ctx) => {
  const labels = new Set<string>(), people = new Set<string>();
  value.groups.forEach((group, index) => {
    const key = fold(group.label);
    if (labels.has(key)) ctx.addIssue({ code: "custom", path: ["groups", index, "label"], message: `${group.label} tertulis dua kali.` });
    labels.add(key);
    for (const id of group.employeeIds) {
      if (people.has(id)) ctx.addIssue({ code: "custom", path: ["groups", index, "employeeIds"], message: "Satu orang hanya boleh di satu kelompok kegiatan per sesi." });
      people.add(id);
    }
  });
});
export type ActivityImport = z.infer<typeof activityImportSchema>;

const ACTIVITY_COLUMNS = {
  label: /^(kelompok( kegiatan)?|pos|angkot|meja|grup|group|label)$/,
  person: /^(nama( karyawan| lengkap| peserta| anggota)?|anggota|karyawan|peserta)$/,
  kind: /^(jenis|tipe)$/,
  note: /^(catatan|keterangan|note)$/,
};
export const activityColumnLabels = ["Kelompok kegiatan", "Nama karyawan", "Jenis", "Catatan"];

function activityKindOf(value: string, label: string, fallback: ActivityGroupKind): ActivityGroupKind | null {
  const word = fold(value);
  if (!word) {
    const first = fold(label).split(" ")[0];
    return (ACTIVITY_GROUP_KINDS as readonly string[]).includes(first) ? first as ActivityGroupKind : fallback;
  }
  return (Object.entries(activityKindLabels).find(([key, name]) => key === word || fold(name) === word)?.[0] as ActivityGroupKind | undefined) ?? null;
}

export type ActivityPasteRow = { label: string; personId: string };
export type ActivityPaste = { rows: ImportRow<ActivityPasteRow>[]; groups: ActivityImport["groups"]; header: boolean };

/**
 * Kelompok kegiatan of one session pasted from a sheet, one person per row: the group ("Pos 2",
 * "Angkot 3", "Meja 7"), the person, and optionally the kind (else read from the group's first
 * word) and a note. One group per person in that session.
 */
export function parseActivityPaste(paste: string, ctx: { people: readonly AdminPerson[]; existing: readonly MwActivityGroup[]; kind: ActivityGroupKind }): ActivityPaste {
  const all = parseTsv(paste);
  const { columns, header } = readColumns(all, ACTIVITY_COLUMNS, { label: 0, person: 1, kind: 2, note: 3 }, 2);
  const rows = (header ? all.slice(1) : all).slice(0, MAX_PASTE_ROWS);
  const persons = new Map<string, number>();
  const meta = new Map<string, { label: string; kind: ActivityGroupKind; note: string }>();
  const parsed = rows.map((cells, index) => {
    const line = index + (header ? 2 : 1);
    const errors: string[] = [];
    const label = cellAt(cells, columns.label);
    if (!label) errors.push("Nama kelompok kegiatan kosong.");
    else if (label.length > 40) errors.push("Nama kelompok kegiatan paling panjang 40 karakter.");
    const kind = activityKindOf(cellAt(cells, columns.kind), label, ctx.kind);
    if (!kind) errors.push(`Jenis "${cellAt(cells, columns.kind)}" tidak dikenal (pos, angkot, meja, lainnya).`);
    const note = cellAt(cells, columns.note);
    if (note.length > 200) errors.push("Catatan paling panjang 200 karakter.");
    const found = matchPerson(cellAt(cells, columns.person), ctx.people);
    if (!found.person) errors.push(found.error);
    else {
      const before = persons.get(found.person.id);
      if (before) errors.push(`${found.person.fullName} sudah ada di baris ${before}. Satu orang satu kelompok kegiatan per sesi.`);
      else persons.set(found.person.id, line);
    }
    if (!errors.length) {
      const key = fold(label);
      const known = meta.get(key);
      if (!known) meta.set(key, { label, kind: kind!, note });
      else if (note && !known.note) known.note = note;
    }
    return { line, cells, errors, input: errors.length ? null : { label, personId: found.person!.id } };
  });
  const existingSort = new Map(ctx.existing.map(group => [fold(group.label), group.sort]));
  const groups = [...meta.entries()].map(([key, value], index) => ({
    label: value.label, kind: value.kind, note: value.note, sort: existingSort.get(key) ?? sortOf(value.label, index),
    employeeIds: parsed.filter(row => row.input && fold(row.input.label) === key).map(row => row.input!.personId),
  }));
  if ((header ? all.length - 1 : all.length) > MAX_PASTE_ROWS) parsed.push({ line: MAX_PASTE_ROWS + 1, cells: [], errors: [`Paling banyak ${MAX_PASTE_ROWS} baris sekali impor.`], input: null });
  return { rows: parsed, groups, header };
}

/** "Pos 2" sorts as 2, "Meja 12" as 12; otherwise in order of the paste. */
export function sortOf(label: string, fallback: number): number {
  const number = label.match(/(\d{1,4})\s*$/);
  return number ? Number(number[1]) : 1000 + fallback;
}
