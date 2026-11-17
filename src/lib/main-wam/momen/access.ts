import { mainWamCan } from "../access";
import type { MainWamViewer, MwPhoto } from "../types";

/*
 * Who may do what with one photo (the same rules as mw_photos_for in migration 202611200201, for
 * the single-photo APIs: file, heart, report, delete). Checked on the server; pure and tested.
 */

type Viewer = Pick<MainWamViewer, "id" | "roles" | "group">;
type Photo = Pick<MwPhoto, "ownerId" | "audience" | "groupId" | "status" | "visibleAt">;

/** Panitia and admin moderate (K08): they may open any photo's file (removing goes through moderation). */
export const moderates = (viewer: Pick<MainWamViewer, "roles">) => mainWamCan(viewer, "kelola");

/** Shown to this person: their own (any status), or shown, past its 5 seconds, for everyone or their kelompok. */
export function canSee(viewer: Viewer, photo: Photo, now = new Date()): boolean {
  if (photo.ownerId === viewer.id) return true;
  if (photo.status !== "tampil" || Date.parse(photo.visibleAt) > now.getTime()) return false;
  return photo.audience === "semua" || (!!viewer.group && photo.groupId === viewer.group.id);
}

/** The file may be served: whoever sees it, and panitia for moderation. */
export const canOpenFile = (viewer: Viewer, photo: Photo, now = new Date()) => canSee(viewer, photo, now) || moderates(viewer);

/**
 * Hapus foto through Momen's API: the owner only (Batalkan or Hapus). Panitia remove others' photos
 * through moderation (K08, mainWamApi.moderatePhoto → mw_moderate_photo): hidden first, logged, the
 * owner told (audit M2). Never both ways.
 */
export const canDelete = (viewer: Pick<MainWamViewer, "id">, photo: Pick<MwPhoto, "ownerId">) => photo.ownerId === viewer.id;

/** Laporkan: a photo the person sees that is not their own. */
export const canReport = (viewer: Viewer, photo: Photo, now = new Date()) => photo.ownerId !== viewer.id && canSee(viewer, photo, now);
