import "server-only";
import { visibleSessions } from "@/lib/main-wam/ceklis/ceklis";
import { canSee } from "@/lib/main-wam/momen/access";
import { GALLERY_PAGE, parsePhotoId, parseSession, STACK_PAGE } from "@/lib/main-wam/momen/filters";
import { countTotals, sessionChoice, type SessionChoice } from "@/lib/main-wam/momen/sessions";
import { UMUM, type FeedPhoto, type SessionCount, type SessionFilter } from "@/lib/main-wam/momen/types";
import { QR_ABSEN_VISIBLE } from "@/lib/main-wam/modules";
import type { MwSession, PhotoStatus } from "@/lib/main-wam/types";
import type { MainWamContext } from "../gate";
import { readLang } from "../lang";
import { allSessions } from "../read";
import type { TaggedAnswer } from "@/lib/main-wam/momen/tagged";
import { feedPhotos, listFeed, photoRecord, sessionCounts } from "./feed";
import { listTagged } from "./tagged";

/*
 * What each Momen screen needs from the server for its first paint (the client continues with the
 * APIs): the stack (M01–M03), the camera (U01). The pages pass these to their
 * client components; the dev previews build the same shapes from sample data.
 */

type Search = Record<string, string | string[] | undefined>;

/**
 * Published sessions, as the sheets need them (no more fields than that). With module Ceklis off the
 * Persiapan agendas (H-n) are left out, as in Beranda and Agenda.
 */
async function publishedSessions({ settings }: Pick<MainWamContext, "settings">): Promise<MwSession[]> {
  const sessions = await allSessions().catch(() => ({ data: [] as MwSession[], migrated: false }));
  return visibleSessions(sessions.data.filter(session => session.status === "terbit"), settings.event, settings.modules.ceklis);
}

const titleOf = (session: SessionFilter, sessions: readonly { id: string; title: string }[]) =>
  session === UMUM ? "Umum" : session ? sessions.find(entry => entry.id === session)?.title ?? null : null;

export type StackScreen = {
  mode: "baru" | "sesi" | "galeri";
  session: SessionFilter;
  sessionTitle: string | null;
  items: FeedPhoto[];
  next: string | null;
  total: number;
  startIndex: number;
  offset: number;
  counts: SessionCount[] | null;
  sessions: SessionChoice[];
  mozaik: boolean;
  migrated: boolean;
  anyPhotos: boolean;
  own: { id: string; status: PhotoStatus; reason: string } | null;
  eventName: string;
  /** The viewer, for their avatar on the reactions pill. */
  me: { name: string; photo: string | null };
  nowIso: string;
};

export async function stackScreen(context: MainWamContext, search: Search, now = new Date()): Promise<StackScreen> {
  const { viewer, settings } = context;
  const lang = await readLang();
  const view = "semua" as const;
  const session = parseSession(search.sesi);
  const foto = parsePhotoId(search.foto);
  const [sessions, counts] = await Promise.all([publishedSessions(context), sessionCounts(context, view)]);
  const base = {
    session, sessionTitle: titleOf(session, sessions), counts, sessions: sessions.map(entry => sessionChoice(entry, now, lang)),
    mozaik: settings.modules.mozaik, anyPhotos: countTotals(counts ?? []).all > 0, own: null, eventName: settings.event.name, me: { name: viewer.name, photo: viewer.photo }, nowIso: now.toISOString(),
  };

  // Opened at one photo (a toast, a note about one's own photo, Foto sesi).
  const photo = foto ? await photoRecord(foto).catch(() => null) : null;
  if (photo && canSee(viewer, photo, now)) {
    if (photo.ownerId === viewer.id && photo.status !== "tampil") {
      const [item] = await feedPhotos([{
        id: photo.id, owner_id: photo.ownerId, audience: photo.audience, group_id: photo.groupId, session_id: photo.sessionId, width: photo.width, height: photo.height,
        taken_at: photo.takenAt, visible_at: photo.visibleAt, status: photo.status, file_key: photo.fileKey, thumb_key: photo.thumbKey, reactions: [], seen: true, total: 1,
      }], context);
      return { ...base, mode: "galeri", items: [item], next: null, total: 1, startIndex: 0, offset: 0, migrated: settings.migrated, own: { id: photo.id, status: photo.status, reason: "" } };
    }
    const cursor = { at: photo.visibleAt, id: photo.id };
    const [older, newer] = await Promise.all([
      listFeed(context, { view, session, mode: "semua", cursor, direction: "older_incl", limit: STACK_PAGE }),
      listFeed(context, { view, session, mode: "semua", cursor, direction: "newer", limit: 60 }),
    ]);
    if (older.items.some(item => item.id === photo.id)) {
      const before = [...newer.items].reverse();
      return {
        ...base, mode: "galeri", items: [...before, ...older.items], next: older.next, total: newer.total + older.total, startIndex: before.length,
        offset: Math.max(0, newer.total - before.length), migrated: settings.migrated && older.migrated,
      };
    }
  }

  if (session) {
    const page = await listFeed(context, { view, session, mode: "semua", limit: STACK_PAGE });
    return { ...base, mode: "sesi", items: page.items, next: page.next, total: page.total, startIndex: 0, offset: 0, migrated: settings.migrated && page.migrated };
  }
  const page = await listFeed(context, { view, session: null, mode: "baru", limit: STACK_PAGE });
  return { ...base, mode: "baru", items: page.items, next: page.next, total: page.total, startIndex: 0, offset: 0, migrated: settings.migrated && page.migrated };
}

export type GalleryScreenData = {
  /** The tab it opens on (?tab=ditandai). */
  tab: "fotoku" | "ditandai";
  /** Fotoku: the person's own photos (any status), the first page. */
  own: { items: FeedPhoto[]; next: string | null; total: number; migrated: boolean };
  /** Ditandai: photos of others that tag the person, the first page (empty before migration 202611300001). */
  tagged: TaggedAnswer;
  /** The sessions' names for a photo's details. */
  sessions: { id: string; title: string }[];
  mozaik: boolean;
  migrated: boolean;
  nowIso: string;
};

/** M05 Galeri (the icon in Momen's bar): Fotoku and Ditandai, each a grid of three with "Muat lagi" past 30. */
export async function galleryScreen(context: MainWamContext, search: Search, now = new Date()): Promise<GalleryScreenData> {
  const { settings } = context;
  const tab = (Array.isArray(search.tab) ? search.tab[0] : search.tab) === "ditandai" ? "ditandai" : "fotoku";
  const [own, tagged, sessions] = await Promise.all([
    listFeed(context, { view: "saya", session: null, mode: "semua", limit: GALLERY_PAGE }),
    // Never a reason to lose the Galeri: a trouble reading the tags is an empty Ditandai.
    listTagged(context, { now }).catch(() => ({ items: [], next: null, total: 0, migrated: false } satisfies TaggedAnswer)),
    publishedSessions(context),
  ]);
  return {
    tab, own, tagged, sessions: sessions.map(session => ({ id: session.id, title: session.title })),
    mozaik: settings.modules.mozaik, migrated: settings.migrated && own.migrated, nowIso: now.toISOString(),
  };
}

export type CameraScreenData = {
  sessions: MwSession[]; nowIso: string; absen: boolean; migrated: boolean;
  initialSession: string | null;
};

/** The camera: the sessions it can tag (only what a sheet row needs), the address's choice. */
export async function cameraScreen(context: MainWamContext, search: Search, now = new Date()): Promise<CameraScreenData> {
  const { settings } = context;
  const sessions = (await publishedSessions(context)).map(session => ({
    ...session, place: "", mapGuideId: null, dresscode: "", bring: "", lineup: [], meal: "", contactId: null, description: "", changedAt: null, changedBy: null,
  }));
  // Before area B's migration the camera says "menunggu pembaruan sistem" (its uploads would wait anyway).
  const probe = await listFeed(context, { view: "saya", session: null, mode: "semua", limit: 1 });
  const sesi = parseSession(search.sesi);
  return {
    sessions, nowIso: now.toISOString(), absen: settings.modules.absen && QR_ABSEN_VISIBLE, // the permission card names "scan the check-in QR" only while the QR check-in is shown (KONTRAK 41)
    migrated: settings.migrated && probe.migrated, initialSession: sesi,
  };
}
