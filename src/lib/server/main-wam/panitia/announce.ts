import "server-only";
import type { AnnounceInput } from "@/lib/main-wam/panitia/schemas";
import type { AnnouncementAudience } from "@/lib/main-wam/types";
import { ServiceError } from "../../config";
import { databaseError } from "../../http";
import { mwMissing } from "../errors";
import type { MainWamContext } from "../gate";
import { mainWamAudience, sendMainWamNote } from "../notes";
import { mainWamEventPeople, mainWamPeople } from "../people";
import { listGroups } from "../read";
import { db } from "./common";
import { waitingUpdate } from "./rundown";

/*
 * Kirim pengumuman (K06): to everyone, some kelompok, some departments, or panitia only, through
 * fondasi's one inbox (sendMainWamNote: lonceng + push; a panitia's announcement always reaches the
 * phone, also in jam tenang). "Sematkan di Beranda" pins it until a time. The panitia see what was
 * sent and by whom ("dikirim Dimas · 10.28"), unpin it, or remove it.
 */

export type AudienceCounts = {
  semua: number;
  panitia: number;
  groups: { id: string; label: string; count: number }[];
  departments: { name: string; count: number }[];
};
export type SentAnnouncement = { id: string; title: string; body: string; at: string; by: string | null; audience: string; pinnedUntil: string | null };
export type AnnounceData = { migrated: boolean; counts: AudienceCounts; sent: SentAnnouncement[] };

/** How many each choice reaches now (within the people Main WAM is on for). */
async function audienceCounts(context: MainWamContext): Promise<AudienceCounts> {
  const [within, people, groups, roles] = await Promise.all([mainWamAudience(context.settings), mainWamPeople(), listGroups(), mainWamEventPeople()]);
  const inside = new Set(within);
  const departments = new Map<string, number>();
  for (const id of within) {
    const department = people.get(id)?.department.trim();
    if (department) departments.set(department, (departments.get(department) ?? 0) + 1);
  }
  return {
    semua: within.length,
    panitia: [...roles.panitia].filter(id => inside.has(id)).length,
    groups: groups.data.map(group => ({ id: group.id, label: `Kelompok ${group.number} · ${group.name}`, count: group.members.filter(member => inside.has(member.employeeId)).length })),
    departments: [...departments.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, "id")),
  };
}

type SentRow = { id: string; title: string; body: string; created_at: string; created_by: string | null; audience_label: string; mw_notes: { kind: string; pinned_until: string | null } | { kind: string; pinned_until: string | null }[] | null };

/** The latest announcements panitia sent (newest first). */
async function sentAnnouncements(limit = 20): Promise<{ migrated: boolean; sent: SentAnnouncement[] }> {
  const { data, error } = await db().from("pw_announcements").select("id,title,body,created_at,created_by,audience_label,mw_notes!inner(kind,pinned_until)")
    .eq("mw_notes.kind", "pengumuman").order("created_at", { ascending: false }).limit(limit);
  if (error) {
    if (mwMissing(error) || error.code === "PGRST200") return { migrated: false, sent: [] };
    databaseError(error);
  }
  const people = await mainWamPeople();
  return {
    migrated: true,
    sent: ((data ?? []) as unknown as SentRow[]).map(row => {
      const note = Array.isArray(row.mw_notes) ? row.mw_notes[0] : row.mw_notes;
      return { id: row.id, title: row.title, body: row.body, at: row.created_at, by: row.created_by ? people.get(row.created_by)?.name ?? null : null, audience: row.audience_label, pinnedUntil: note?.pinned_until ?? null };
    }),
  };
}

export async function announceData(context: MainWamContext): Promise<AnnounceData> {
  const [counts, sent] = await Promise.all([audienceCounts(context), sentAnnouncements()]);
  return { migrated: sent.migrated && context.settings.migrated, counts, sent: sent.sent };
}

export async function listSent(): Promise<{ migrated: boolean; sent: SentAnnouncement[] }> {
  return sentAnnouncements(50);
}

/** The pin must end later today or tomorrow: after now, within 48 hours. */
function checkPin(pinnedUntil: string | null, now: Date) {
  if (!pinnedUntil) return;
  const until = Date.parse(pinnedUntil);
  if (until <= now.getTime()) throw new ServiceError(422, "Pilih jam setelah sekarang.", { pinnedUntil: ["Pilih jam setelah sekarang."] });
  if (until - now.getTime() > 48 * 3_600_000) throw new ServiceError(422, "Sematkan paling lama 2 hari.", { pinnedUntil: ["Sematkan paling lama 2 hari."] });
}

/** Sends it now; how many received it. */
export async function sendAnnouncement(context: MainWamContext, input: AnnounceInput, now = new Date()): Promise<number> {
  checkPin(input.pinnedUntil, now);
  if (input.audience.type === "kelompok") {
    const known = new Set((await listGroups()).data.map(group => group.id));
    if (input.audience.groupIds.some(id => !known.has(id))) throw new ServiceError(422, "Kelompok tidak dikenali. Muat ulang halaman.");
  }
  const audience: AnnouncementAudience = input.audience;
  try {
    return await sendMainWamNote({ kind: "pengumuman", title: input.title, body: input.body, to: { audience }, pinnedUntil: input.pinnedUntil, by: context.viewer.id });
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.status === 503 && /migrasi/.test(error.message)) throw waitingUpdate();
      throw error;
    }
    throw error;
  }
}

async function ownAnnouncement(id: string): Promise<void> {
  const { data, error } = await db().from("mw_notes").select("kind").eq("announcement_id", id).maybeSingle();
  if (error) { if (mwMissing(error)) throw waitingUpdate(); databaseError(error); }
  if (!data || data.kind !== "pengumuman") throw new ServiceError(404, "Pengumuman ini sudah tidak ada.");
}

/** Lepas dari Beranda. */
export async function unpinAnnouncement(context: MainWamContext, id: string): Promise<void> {
  await ownAnnouncement(id);
  const { error } = await db().from("mw_notes").update({ pinned_until: null, updated_by: context.viewer.id, updated_at: new Date().toISOString() }).eq("announcement_id", id);
  if (error) databaseError(error);
}

/** Hapus: gone from everyone's lonceng (a phone's push already shown stays). */
export async function removeAnnouncement(id: string): Promise<void> {
  await ownAnnouncement(id);
  const { error } = await db().from("pw_announcements").delete().eq("id", id);
  if (error) databaseError(error);
}
