import {
  ACTIVITY_GROUP_KINDS, AWARD_METHODS, GUIDE_KINDS, NOMINEE_KINDS, NOTE_KINDS, PHOTO_AUDIENCES, PHOTO_STATUSES, SESSION_KINDS, SESSION_MODULES, SESSION_STATUSES,
  TRIP_DIRECTIONS, TRIP_KINDS,
  type LineupItem, type MwActivityGroup, type MwAwardCategory, type MwAwardNominee, type MwGroup, type MwGuide, type MwPhoto, type MwSession,
  type MwSilentQuestion, type MwTrip, type MwTripSeat, type RundownChange, type RundownField,
} from "./types";

/*
 * Database rows (snake_case, as Supabase returns them) to Main WAM's types, and the column lists
 * the readers select. One place, so a column added in a later migration is read the same way by
 * every area. Pure: tested without a database.
 */

type Row = Record<string, unknown>;
const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const strOrNull = (value: unknown) => (typeof value === "string" && value ? value : null);
const num = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() && Number.isFinite(Number(value)) ? Number(value) : fallback);
const numOrNull = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null);
const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T => ((list as readonly unknown[]).includes(value) ? value as T : fallback);

export const SESSION_COLUMNS = "id,title,kind,status,starts_at,ends_at,place,map_guide_id,dresscode,bring,lineup,meal,contact_id,uses_attendance,required,optional,module,description,sort,changed_at,changed_by";

function lineup(value: unknown): LineupItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Row => !!item && typeof item === "object")
    .map(item => ({ time: str(item.time).slice(0, 5), label: str(item.label).slice(0, 120) }))
    .filter(item => item.label);
}

export function sessionFromRow(row: Row): MwSession {
  return {
    id: str(row.id), title: str(row.title), kind: oneOf(SESSION_KINDS, row.kind, "sesi"), status: oneOf(SESSION_STATUSES, row.status, "draf"),
    startsAt: str(row.starts_at), endsAt: strOrNull(row.ends_at), place: str(row.place), mapGuideId: strOrNull(row.map_guide_id),
    dresscode: str(row.dresscode), bring: str(row.bring), lineup: lineup(row.lineup), meal: str(row.meal), contactId: strOrNull(row.contact_id),
    usesAttendance: row.uses_attendance === true, required: row.required === true, optional: row.optional === true,
    module: row.module ? oneOf(SESSION_MODULES, row.module, "silent") : null, description: str(row.description), sort: num(row.sort),
    changedAt: strOrNull(row.changed_at), changedBy: strOrNull(row.changed_by),
  };
}

export const RUNDOWN_LOG_COLUMNS = "id,session_id,changes,notified,recipients,changed_by,changed_at";
const FIELDS: readonly RundownField[] = ["startsAt", "endsAt", "place", "status"];
export function rundownChangeFromRow(row: Row): RundownChange {
  const changes = Array.isArray(row.changes) ? row.changes.filter((item): item is Row => !!item && typeof item === "object") : [];
  return {
    id: str(row.id), sessionId: str(row.session_id),
    changes: changes.filter(item => (FIELDS as readonly unknown[]).includes(item.field)).map(item => ({ field: item.field as RundownField, from: strOrNull(item.from), to: strOrNull(item.to) })),
    notified: row.notified === true, recipients: num(row.recipients), changedBy: strOrNull(row.changed_by), changedAt: str(row.changed_at),
  };
}

export const GROUP_COLUMNS = "id,number,name,sort,mw_group_members(employee_id,coordinator)";
export function groupFromRow(row: Row): MwGroup {
  const members = Array.isArray(row.mw_group_members) ? row.mw_group_members as Row[] : [];
  return {
    id: str(row.id), number: num(row.number), name: str(row.name), sort: num(row.sort),
    // The koordinator first (L01), then as stored.
    members: members.map(member => ({ employeeId: str(member.employee_id), coordinator: member.coordinator === true })).sort((a, b) => Number(b.coordinator) - Number(a.coordinator)),
  };
}

export const ACTIVITY_GROUP_COLUMNS = "id,session_id,kind,label,note,sort,mw_activity_group_members(employee_id)";
export function activityGroupFromRow(row: Row): MwActivityGroup {
  const members = Array.isArray(row.mw_activity_group_members) ? row.mw_activity_group_members as Row[] : [];
  return {
    id: str(row.id), sessionId: str(row.session_id), kind: oneOf(ACTIVITY_GROUP_KINDS, row.kind, "lain"), label: str(row.label), note: str(row.note), sort: num(row.sort),
    members: members.map(member => str(member.employee_id)).filter(Boolean),
  };
}

export const TRIP_COLUMNS = "id,direction,kind,title,place,starts_at,ends_at,detail,note,map_url,coordinator_id,session_id,distance_km,vehicles,sort";
export function tripFromRow(row: Row): MwTrip {
  return {
    id: str(row.id), direction: oneOf(TRIP_DIRECTIONS, row.direction, "berangkat"), kind: oneOf(TRIP_KINDS, row.kind, "lain"), title: str(row.title), place: str(row.place),
    startsAt: strOrNull(row.starts_at), endsAt: strOrNull(row.ends_at), detail: str(row.detail), note: str(row.note), mapUrl: str(row.map_url),
    coordinatorId: strOrNull(row.coordinator_id), sessionId: strOrNull(row.session_id), distanceKm: numOrNull(row.distance_km), vehicles: numOrNull(row.vehicles), sort: num(row.sort),
  };
}
export const TRIP_SEAT_COLUMNS = "trip_id,employee_id,seat,vehicle";
export const tripSeatFromRow = (row: Row): MwTripSeat => ({ tripId: str(row.trip_id), employeeId: str(row.employee_id), seat: str(row.seat), vehicle: str(row.vehicle) });

export const GUIDE_COLUMNS = "id,slug,kind,title,body,file_key,file_mime,file_size,sort,published,updated_at";
export function guideFromRow(row: Row): MwGuide {
  const updated = Date.parse(str(row.updated_at));
  return {
    id: str(row.id), slug: str(row.slug), kind: oneOf(GUIDE_KINDS, row.kind, "lain"), title: str(row.title), body: str(row.body),
    file: row.file_key ? { mime: str(row.file_mime, "application/pdf"), size: num(row.file_size), version: Number.isFinite(updated) ? String(updated) : "1" } : null,
    sort: num(row.sort), published: row.published === true,
  };
}

export const PHOTO_COLUMNS = "id,owner_id,audience,group_id,session_id,width,height,taken_at,created_at,visible_at,status";
export function photoFromRow(row: Row): MwPhoto {
  return {
    id: str(row.id), ownerId: str(row.owner_id), audience: oneOf(PHOTO_AUDIENCES, row.audience, "semua"), groupId: strOrNull(row.group_id), sessionId: strOrNull(row.session_id),
    width: num(row.width, 1), height: num(row.height, 1), takenAt: str(row.taken_at), createdAt: str(row.created_at), visibleAt: str(row.visible_at),
    status: oneOf(PHOTO_STATUSES, row.status, "tampil"),
  };
}

export const AWARD_COLUMNS = "id,title,description,method,nominee_kind,opens_at,closes_at,announce_at,session_id,sort,published,mw_award_nominees(id,category_id,employee_id,photo_id,label,reason,sort)";
export const nomineeFromRow = (row: Row): MwAwardNominee => ({
  id: str(row.id), categoryId: str(row.category_id), employeeId: strOrNull(row.employee_id), photoId: strOrNull(row.photo_id), label: str(row.label), reason: str(row.reason), sort: num(row.sort),
});
export function awardFromRow(row: Row): MwAwardCategory {
  const nominees = Array.isArray(row.mw_award_nominees) ? (row.mw_award_nominees as Row[]).map(nomineeFromRow).sort((a, b) => a.sort - b.sort) : [];
  return {
    id: str(row.id), title: str(row.title), description: str(row.description), method: oneOf(AWARD_METHODS, row.method, "voting"), nomineeKind: oneOf(NOMINEE_KINDS, row.nominee_kind, "orang"),
    opensAt: strOrNull(row.opens_at), closesAt: strOrNull(row.closes_at), announceAt: strOrNull(row.announce_at), sessionId: strOrNull(row.session_id),
    sort: num(row.sort), published: row.published === true, nominees,
  };
}

export const SILENT_COLUMNS = "id,session_id,question,topics,opened_at,closed_at";
export function silentFromRow(row: Row): MwSilentQuestion {
  return {
    id: str(row.id), sessionId: str(row.session_id), question: str(row.question), topics: Array.isArray(row.topics) ? row.topics.filter((topic): topic is string => typeof topic === "string") : [],
    openedAt: strOrNull(row.opened_at), closedAt: strOrNull(row.closed_at),
  };
}

export const NOTE_KIND = (value: unknown) => oneOf(NOTE_KINDS, value, "lain");
