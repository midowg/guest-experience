import "server-only";
import { createHash } from "node:crypto";
import {
  CARBON_ANSWER_ROW, CARBON_SETTING_KEY, EMPTY_CARBON_SETUP, asCarbonAnswer, asCarbonSetup, carbonPeopleFrom, tripValid,
  type CarbonPerson, type CarbonSetup, type CarbonTravel,
} from "@/lib/pra-wam/carbon";
import { MISSION_SETTING_KEY, personKey } from "@/lib/pra-wam/mission";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import type { Member } from "./session";

/*
 * Jejak karbon (24 Nov 2026): the panitia's setup, the participants' answers, and the people with
 * their rooms from Misi Perjalanan's sheet, all rows of pw_settings (migration 202611120001, already
 * there). One row per participant (carbonAnswerKey), so saves never overwrite one another. The
 * sheet holds real names, so it stays in the database: the repository is public.
 */

const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(error.code ?? "") || /pw_settings/.test(error.message ?? "");
const waiting = () => new ServiceError(503, "Jejak karbon menunggu tabel pw_settings (migrasi 202611120001).");

/** A participant's row: "carbon_" and the first 32 hex characters of their person key's SHA-256. */
export const carbonAnswerKey = (id: string) => `carbon_${createHash("sha256").update(id).digest("hex").slice(0, 32)}`;

type Row = { key: string; value: unknown; updated_at: string | null };
type Sheet = Parameters<typeof carbonPeopleFrom>[0];

async function readRows(keys: string[]) {
  const { data, error } = await createPrivilegedClient().from("pw_settings").select("key,value,updated_at").in("key", keys);
  if (error) { if (missing(error)) return null; databaseError(error); }
  return new Map(((data ?? []) as Row[]).map(row => [row.key, row]));
}

/** Every participant's row (the setup row also starts with "carbon_" and is left out). */
async function readAnswerRows(): Promise<Row[]> {
  const { data, error } = await createPrivilegedClient().from("pw_settings").select("key,value,updated_at").like("key", "carbon_%").limit(2000);
  if (error) { if (missing(error)) return []; databaseError(error); }
  return ((data ?? []) as Row[]).filter(row => CARBON_ANSWER_ROW.test(row.key));
}

async function write(key: string, value: unknown) {
  const { error } = await createPrivilegedClient().from("pw_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }
}

/* ---- Admin Pra WAM ------------------------------------------------------------------------------ */

export type CarbonAdminState = { setup: CarbonSetup; people: CarbonPerson[]; saved: boolean; migrated: boolean; updatedAt: string | null };

/** Everything the admin page shows. Before pw_settings exists: the empty setup, nothing saved. */
export async function carbonAdminState(): Promise<CarbonAdminState> {
  const [rows, answerRows] = await Promise.all([readRows([CARBON_SETTING_KEY, MISSION_SETTING_KEY]), readAnswerRows()]);
  if (!rows) return { setup: EMPTY_CARBON_SETUP, people: [], saved: false, migrated: false, updatedAt: null };
  const setupRow = rows.get(CARBON_SETTING_KEY);
  const sheet = (rows.get(MISSION_SETTING_KEY)?.value ?? null) as Sheet;
  const byRow = new Map(answerRows.map(row => [row.key, asCarbonAnswer(row.value)]));
  const answers: Record<string, CarbonTravel> = {};
  for (const person of sheet?.people ?? []) {
    const answer = byRow.get(carbonAnswerKey(personKey(person.name)));
    if (answer) answers[personKey(person.name)] = answer;
  }
  return {
    setup: asCarbonSetup(setupRow?.value),
    people: carbonPeopleFrom(sheet, answers, personKey),
    saved: !!setupRow, migrated: true, updatedAt: setupRow?.updated_at ?? null,
  };
}

/** The panitia's setup, already checked by carbonSetupSchema. */
export const saveCarbonSetup = (setup: CarbonSetup) => write(CARBON_SETTING_KEY, setup);

/** Send someone back to the group trip: their own trip is dropped, their other answers kept. */
export async function sendToGroup(id: string): Promise<void> {
  const key = carbonAnswerKey(id);
  const rows = await readRows([key]);
  const answer = asCarbonAnswer(rows?.get(key)?.value);
  if (!answer?.own) throw new ServiceError(404, "Peserta ini sudah ikut rombongan.");
  await write(key, { ...answer, own: null });
}

/* ---- The participant's own card ----------------------------------------------------------------- */

export type MyCarbon = { setup: CarbonSetup; occupants: number; travel: CarbonTravel | null };

/**
 * This person's Jejak karbon for Beranda: null when they are not in Misi Perjalanan's room list, or
 * the panitia have not set a trip that can be counted. Only their own answer and room size.
 */
export async function myCarbon(member: Pick<Member, "name">): Promise<MyCarbon | null> {
  const me = personKey(member.name);
  const key = carbonAnswerKey(me);
  const rows = await readRows([CARBON_SETTING_KEY, MISSION_SETTING_KEY, key]);
  if (!rows) return null;
  const setup = asCarbonSetup(rows.get(CARBON_SETTING_KEY)?.value);
  if (!tripValid(setup.trip)) return null;
  const person = carbonPeopleFrom((rows.get(MISSION_SETTING_KEY)?.value ?? null) as Sheet, {}, personKey).find(item => item.id === me);
  if (!person) return null;
  return { setup, occupants: person.occupants, travel: asCarbonAnswer(rows.get(key)?.value) };
}

/** Saves this person's answer (checked by carbonAnswerInputSchema) while the panitia keep the form open. */
export async function saveMyCarbon(member: Pick<Member, "name">, answer: Omit<CarbonTravel, "answeredAt">): Promise<CarbonTravel> {
  const rows = await readRows([CARBON_SETTING_KEY, MISSION_SETTING_KEY]);
  if (!rows) throw waiting();
  const setup = asCarbonSetup(rows.get(CARBON_SETTING_KEY)?.value);
  const me = personKey(member.name);
  const listed = carbonPeopleFrom((rows.get(MISSION_SETTING_KEY)?.value ?? null) as Sheet, {}, personKey).some(item => item.id === me);
  if (!listed) throw new ServiceError(403, "Jejak karbon belum dibuka untuk akunmu.");
  if (!tripValid(setup.trip)) throw new ServiceError(409, "Panitia belum mengisi perjalanan.");
  if (!setup.formOpen) throw new ServiceError(409, "Pengisian sudah ditutup.");
  const travel: CarbonTravel = { own: answer.own && { ...answer.own, from: answer.own.from.trim() }, bottles: answer.bottles, laptopHours: answer.laptopHours, phoneCharges: answer.phoneCharges, answeredAt: new Date().toISOString() };
  await write(carbonAnswerKey(me), travel);
  return travel;
}
