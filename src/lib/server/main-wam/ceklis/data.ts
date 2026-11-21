import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import {
  ceklisBlock, checklistProgress, photoVersion, type CeklisBlock, type ChecklistItem, type ChecklistItemView, type ChecklistProgress, type ChecklistTick, type SessionChecklist,
} from "@/lib/main-wam/ceklis/ceklis";
import { DEMO_CEKLIS_COOKIE, parseDemoTicks, sampleChecklists } from "@/lib/main-wam/ceklis/sample";
import { isSampleId } from "@/lib/main-wam/demo-sample";
import type { MwSession } from "@/lib/main-wam/types";
import { isSupabaseConfigured, ServiceError } from "../../config";
import { databaseError } from "../../http";
import { createPrivilegedClient } from "../../supabase/admin";
import { demoRundown } from "../demo";
import { mwMissing, type Read } from "../errors";
import { allSessions } from "../read";

/*
 * Ceklis persiapan on the server (agen S1; migration 202611250001): what each agenda has, what a
 * person ticked, ticking, and the check that stops absen. Before the migration every reader answers
 * "nothing" (`migrated: false`) and nothing is asked of anyone, so the app runs as it did. Mode demo:
 * the sample's checklist stands in while the sample rundown does, its ticks kept in a cookie (a sample
 * item cannot be saved).
 */

const db = () => createPrivilegedClient();

type ItemRow = { id: string; session_id: string; text: string; note: string; photo_key: string | null; photo_mime: string | null; photo_size: number | null; sort: number; updated_at: string };
export const ITEM_COLUMNS = "id,session_id,text,note,photo_key,photo_mime,photo_size,sort,updated_at";

export function itemFromRow(row: ItemRow): ChecklistItem {
  return {
    id: row.id, sessionId: row.session_id, text: row.text, note: row.note ?? "", sort: row.sort ?? 0,
    photo: row.photo_key && row.photo_mime ? { key: row.photo_key, mime: row.photo_mime, size: Number(row.photo_size ?? 0), version: photoVersion(row.updated_at) } : null,
  };
}

/** The saved checklists, every agenda that has items or the switch: what Admin WAM edits (never the sample). */
async function realChecklistsUncached(): Promise<Read<Map<string, SessionChecklist>>> {
  const empty = new Map<string, SessionChecklist>();
  if (!isSupabaseConfigured()) return { data: empty, migrated: false };
  const [items, flags] = await Promise.all([
    db().from("mw_checklist_items").select(ITEM_COLUMNS).order("sort").order("created_at").limit(3000),
    db().from("mw_sessions").select("id").eq("checklist_required", true).limit(500),
  ]);
  if (items.error) { if (mwMissing(items.error)) return { data: empty, migrated: false }; databaseError({ message: items.error.message, code: items.error.code }); }
  // The switch's column comes with the table (one migration); a missing one reads as "off".
  if (flags.error && !mwMissing(flags.error)) databaseError({ message: flags.error.message, code: flags.error.code });
  const required = new Set(((flags.error ? [] : flags.data) ?? []).map(row => row.id as string));
  const map = new Map<string, SessionChecklist>();
  for (const row of (items.data ?? []) as ItemRow[]) {
    const list = map.get(row.session_id) ?? { required: required.has(row.session_id), items: [] };
    list.items.push(itemFromRow(row));
    map.set(row.session_id, list);
  }
  for (const id of required) if (!map.has(id)) map.set(id, { required: true, items: [] });
  return { data: map, migrated: true };
}
export const realChecklists = cache(realChecklistsUncached);

/** What the app shows: the saved checklists, or the sample's while Mode demo's sample rundown stands in and nothing is saved. */
async function checklistsUncached(): Promise<Read<Map<string, SessionChecklist>>> {
  const real = await realChecklists();
  const saved = [...real.data.values()].some(list => list.items.length > 0);
  if (saved || !(await demoRundown())) return real;
  return { data: sampleChecklists(), migrated: true };
}
export const readChecklists = cache(checklistsUncached);

/** The item ids this person ticked. In the demo, the sample's ticks come from the device's cookie. */
async function myChecksUncached(employeeId: string): Promise<Set<string>> {
  const ticked = new Set<string>();
  if (isSupabaseConfigured()) {
    const { data, error } = await db().from("mw_checklist_checks").select("item_id").eq("employee_id", employeeId).limit(3000);
    if (error) { if (!mwMissing(error)) databaseError({ message: error.message, code: error.code }); }
    else for (const row of data ?? []) ticked.add(row.item_id as string);
  }
  if (await demoRundown()) {
    try { for (const id of parseDemoTicks((await cookies()).get(DEMO_CEKLIS_COOKIE)?.value)) ticked.add(id); } catch { /* no request */ }
  }
  return ticked;
}
export const myChecks = cache(myChecksUncached);

/** An agenda's checklist as the person reads it, or null when it has none. */
export function checklistView(list: SessionChecklist | undefined, checked: ReadonlySet<string>): { required: boolean; items: ChecklistItemView[]; progress: ChecklistProgress; sample: boolean } | null {
  if (!list || !list.items.length) return null;
  return {
    required: list.required,
    items: list.items.map(item => ({ id: item.id, text: item.text, note: item.note, photoVersion: item.photo?.version ?? null, checked: checked.has(item.id) })),
    progress: checklistProgress(list.items, checked),
    sample: list.items.some(item => isSampleId(item.id)),
  };
}

/**
 * The checklist that stops this person's absen at `session`, or null (no gate, the module off, nothing
 * unfinished, or the migration not run yet). A read that FAILS throws a 503 ("coba lagi"): the QR check-in
 * must not slip past a gate that could not be read. Only the QR scan goes through this gate; panitia's
 * manual absen (Kelola absen) deliberately does not, as panitia vouch for the person present.
 */
export async function absenBlock(session: MwSession, employeeId: string): Promise<CeklisBlock | null> {
  if (!session.usesAttendance) return null;
  try {
    const [lists, sessions] = await Promise.all([readChecklists(), allSessions()]);
    if (!lists.migrated || lists.data.size === 0) return null;
    return ceklisBlock(session, sessions.data, lists.data, await myChecks(employeeId));
  } catch (error) {
    console.error("absenBlock: the checklist could not be read", error);
    throw new ServiceError(503, "Ceklis persiapan belum dapat diperiksa. Coba lagi sebentar.");
  }
}

/* ── Ticking ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * A person ticks one item, unticks it, or ticks them all. Only the items of a published agenda that
 * is not cancelled. Returns the ticked ids of that agenda and its progress.
 */
export async function tickChecklist(employeeId: string, sessionId: string, tick: ChecklistTick): Promise<{ checked: string[]; progress: ChecklistProgress }> {
  const { data: sessions } = await allSessions();
  const session = sessions.find(item => item.id === sessionId);
  if (!session || session.status !== "terbit") throw new ServiceError(404, "Agenda tidak ditemukan.");
  const real = await realChecklists();
  if (!real.migrated) throw new ServiceError(503, "Fitur ini menunggu pembaruan sistem. Hubungi tim CoE.");
  const items = real.data.get(sessionId)?.items ?? [];
  if (!items.length) throw new ServiceError(404, "Agenda ini tidak punya ceklis.");
  if ("all" in tick) {
    const { error } = await db().from("mw_checklist_checks").upsert(items.map(item => ({ item_id: item.id, employee_id: employeeId })), { onConflict: "item_id,employee_id", ignoreDuplicates: true });
    if (error) databaseError({ message: error.message, code: error.code });
  } else {
    if (!items.some(item => item.id === tick.itemId)) throw new ServiceError(404, "Item tidak ditemukan. Muat ulang ceklisnya.");
    if (tick.checked) {
      const { error } = await db().from("mw_checklist_checks").upsert({ item_id: tick.itemId, employee_id: employeeId }, { onConflict: "item_id,employee_id", ignoreDuplicates: true });
      if (error) databaseError({ message: error.message, code: error.code });
    } else {
      const { error } = await db().from("mw_checklist_checks").delete().eq("item_id", tick.itemId).eq("employee_id", employeeId);
      if (error) databaseError({ message: error.message, code: error.code });
    }
  }
  // Fresh: the answer follows the write (not the per-request cache).
  const { data, error } = await db().from("mw_checklist_checks").select("item_id").eq("employee_id", employeeId).in("item_id", items.map(item => item.id));
  if (error) databaseError({ message: error.message, code: error.code });
  const checked = (data ?? []).map(row => row.item_id as string);
  return { checked, progress: checklistProgress(items, new Set(checked)) };
}

/** An item's photo key, for the file route: of a published agenda that is not a draft (null when there is none). */
export async function itemPhotoKey(itemId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return null;
  const { data, error } = await db().from("mw_checklist_items").select("photo_key,session_id").eq("id", itemId).maybeSingle();
  if (error) { if (mwMissing(error)) return null; databaseError({ message: error.message, code: error.code }); }
  if (!data?.photo_key) return null;
  const { data: sessions } = await allSessions();
  const session = sessions.find(item => item.id === data.session_id);
  return session && session.status !== "draf" ? (data.photo_key as string) : null;
}
