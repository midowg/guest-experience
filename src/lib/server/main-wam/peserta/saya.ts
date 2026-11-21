import "server-only";
import { visibleSessions } from "@/lib/main-wam/ceklis/ceklis";
import { mayUseMcp } from "@/lib/pra-wam/mcp";
import type { Contact } from "@/lib/main-wam/peserta/contact";
import { groupNotifications, type NotificationRow } from "@/lib/main-wam/peserta/notifications";
import { coordinatorOf, travelSteps, type TravelStep } from "@/lib/main-wam/peserta/travel";
import { timeChange } from "@/lib/main-wam/peserta/agenda";
import { shownGuides } from "@/lib/main-wam/peserta/guides";
import { hhmm } from "@/lib/main-wam/peserta/format";
import type { MwGuide, MwTrip, TripDirection } from "@/lib/main-wam/types";
import { mcpAccessOf } from "../../pra-wam/mcp";
import { myMainWamNotifications } from "../notes";
import { guideBySlug, listGuides, listTrips, rundownLog, seatsOf, shownSessions } from "../read";
import type { MainWamContext } from "../gate";
import { t } from "@/lib/main-wam/i18n";
import { readLang } from "../lang";
import { contactOf, contactsOf } from "./contacts";

/*
 * Saya and its screens (P05/P05B, L01, L03, L04, N01): what each reads, for the signed-in person
 * only. Colleagues by nama panggilan; numbers only of the contacts the event names.
 */

/** Saya: Akses MCP for a BOD with access (Pra WAM's Pengaturan holds McpCard), and the Bantuan contact. */
export async function loadMe({ viewer, settings }: MainWamContext): Promise<{ mcp: boolean; help: Contact | null }> {
  const lang = await readLang();
  const [access, help] = await Promise.all([
    mayUseMcp(viewer) ? mcpAccessOf(viewer.id).catch(() => null) : Promise.resolve(null),
    contactOf(settings.contacts.umum, t(lang, "peserta.contact.committee")).catch(() => null),
  ]);
  return { mcp: !!access?.granted, help };
}

export type RoomData = { roomHelp: Contact | null };

/** L01: the room is the viewer's own (HR's pairing, read by the fondasi); here only the contact for Bantuan kamar. */
export async function loadRoom({ settings }: MainWamContext): Promise<RoomData> {
  const lang = await readLang();
  const roomHelp = await contactOf(settings.contacts.kamar, t(lang, "peserta.contact.roomCommittee")).catch(() => null);
  return { roomHelp };
}

export type TravelData = {
  migrated: boolean;
  trips: MwTrip[];
  steps: Record<TripDirection, TravelStep[]>;
  coordinators: Partial<Record<TripDirection, Contact>>;
  /** "Jam kumpul berubah · tadinya 05.45", per direction. */
  changed: Partial<Record<TripDirection, string>>;
};

/** L03: both directions (the segmented switches without a request), the person's seats, the coordinators. */
export async function loadTravel({ viewer, settings }: MainWamContext): Promise<TravelData> {
  const lang = await readLang();
  const [trips, seats, sessions, log] = await Promise.all([
    listTrips(), seatsOf(viewer.id).then(read => read.data).catch(() => []),
    shownSessions().then(read => visibleSessions(read.data, settings.event, settings.modules.ceklis)).catch(() => []),
    rundownLog(undefined, 500).then(read => read.data).catch(() => []),
  ]);
  const ids = { berangkat: coordinatorOf(trips.data, "berangkat"), pulang: coordinatorOf(trips.data, "pulang") };
  const contacts = await contactsOf([
    { id: ids.berangkat ?? settings.contacts.perjalanan, role: t(lang, "peserta.travel.roleCoordinator") },
    { id: ids.pulang ?? settings.contacts.perjalanan, role: t(lang, "peserta.travel.roleCoordinator") },
  ]).catch(() => new Map<string, Contact>());
  const room = viewer.room?.name ?? null;
  const changed: Partial<Record<TripDirection, string>> = {};
  for (const direction of ["berangkat", "pulang"] as const) {
    const gather = trips.data.find(trip => trip.direction === direction && trip.kind === "kumpul" && trip.sessionId);
    const session = gather ? sessions.find(item => item.id === gather.sessionId) : null;
    const change = session ? timeChange(session, log, lang) : null;
    if (change && change.from.start !== session!.startsAt) changed[direction] = t(lang, "peserta.travel.gatherChanged", { time: hhmm(change.from.start, lang) });
  }
  const coordinator = (direction: TripDirection) => contacts.get((ids[direction] ?? settings.contacts.perjalanan) ?? "");
  return {
    migrated: trips.migrated,
    trips: trips.data,
    steps: { berangkat: travelSteps(trips.data, seats, "berangkat", room, lang), pulang: travelSteps(trips.data, seats, "pulang", room, lang) },
    coordinators: Object.fromEntries((["berangkat", "pulang"] as const).flatMap(direction => { const found = coordinator(direction); return found ? [[direction, found]] : []; })),
    changed,
  };
}

/** L04: the published guides, in order. */
export async function loadGuides(): Promise<{ migrated: boolean; guides: MwGuide[] }> {
  const read = await listGuides();
  return { migrated: read.migrated, guides: shownGuides(read.data) };
}

/** One published guide; null when there is none (the page is then not found). */
export const loadGuide = (slug: string) => guideBySlug(slug);

/** N01: the person's notes, grouped, and whether the migration has run. */
export async function loadNotifications({ viewer }: MainWamContext, now: Date): Promise<{ migrated: boolean; today: NotificationRow[]; earlier: NotificationRow[]; unread: number }> {
  const [read, lang] = await Promise.all([myMainWamNotifications(viewer.id), readLang()]);
  return { migrated: read.migrated, unread: read.unread, ...groupNotifications(read.items, now, lang) };
}
