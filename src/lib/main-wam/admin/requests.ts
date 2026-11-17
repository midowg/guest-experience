import { z } from "zod";
import { activityImportSchema, activityInputSchema, groupImportSchema, groupInputSchema, MAX_MEMBERS } from "./groups";
import { DATE, sessionImportSchema, sessionInputSchema, shiftSchema } from "./rundown";

/*
 * The bodies Admin WAM → Main WAM's isi acara APIs accept (agen E, src/app/api/admin/wam/main/…).
 * The page sends the same shapes; the server checks them again with these. Pure.
 */

/** POST mainWamAdminApi.sessions: add one, save an import, or move several. */
export const sessionsPostSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("tambah"), session: sessionInputSchema }),
  sessionImportSchema.safeExtend({ action: z.literal("impor") }),
  shiftSchema.safeExtend({ action: z.literal("geser") }),
], { message: "Aksi tidak dikenal." });
/** PUT mainWamAdminApi.session(id). */
export const sessionPutSchema = z.object({ session: sessionInputSchema, notify: z.boolean(), version: z.string().max(40).nullable().optional() });
/** POST mainWamAdminApi.session(id): "Salin sesi" to a day (null = the same day). */
export const sessionCopySchema = z.object({ date: z.string().regex(DATE, "Pilih hari acara.").nullable() });

/** POST mainWamAdminApi.groups: add one, or save an import. */
export const groupsPostSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("tambah"), group: groupInputSchema }),
  // safeExtend keeps the import's own checks (one kelompok per person, one koordinator each).
  groupImportSchema.safeExtend({ action: z.literal("impor") }),
], { message: "Aksi tidak dikenal." });

const members = z.array(z.uuid()).max(MAX_MEMBERS, `Paling banyak ${MAX_MEMBERS} anggota.`);
/** POST mainWamAdminApi.activityGroups: add one (with its people), or save an import of one session. */
export const activityPostSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("tambah"), group: activityInputSchema, employeeIds: members.optional() }),
  activityImportSchema.safeExtend({ action: z.literal("impor") }),
], { message: "Aksi tidak dikenal." });
/** PUT mainWamAdminApi.activityGroup(id): the fields, and the people when given. */
export const activityPutSchema = z.object({ group: activityInputSchema, employeeIds: members.optional() });

/** PUT mainWamAdminApi.roomDetail(roomId). */
export const roomDetailSchema = z.object({
  floor: z.string().trim().max(40, "Lantai paling panjang 40 karakter."),
  note: z.string().trim().max(200, "Catatan paling panjang 200 karakter."),
});

/** A uuid in the address (anything else is "not found"). */
export const isId = (value: string) => z.uuid().safeParse(value).success;
