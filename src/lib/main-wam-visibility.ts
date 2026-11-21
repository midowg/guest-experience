/*
 * Main WAM tersembunyi (20 Nov 2026, keputusan pemilik): Pra WAM's committee and admins are not the WAM
 * team, so Main WAM (Kuis live included) shows nowhere in Journey until the super admin presses
 * "Tampilkan" (Super admin → Halaman utama). While hidden:
 *   - Admin WAM's menu, Ringkasan, search and the Pra WAM side carry no Main WAM entry (its pages still open
 *     by their address for whoever may open them now);
 *   - /wam never sends anyone on to /wam/acara (Main WAM still opens by its own address, by its mode);
 *   - Main WAM's notes (bell and push) go only to the penguji an admin listed by name (mw_testers), never
 *     to the committee or admins by role, and never as a committee announcement (Pra WAM's list, the TV).
 * Shown: everything as before. Kept in admin_settings.main_wam_shown (migration 202611200602); missing,
 * unreadable or anything but `true` = hidden. Pure.
 */

export const MAIN_WAM_VISIBILITY_MIGRATION = "202611200602_main_wam_visibility.sql";

export type MainWamVisibility = {
  shown: boolean;
  /** False before the migration (then always hidden, and the switch cannot be saved). */
  migrated: boolean;
  /** When and by whom it was last switched (the record of the change). */
  changedAt: string | null;
  changedBy: string | null;
};

export const HIDDEN_MAIN_WAM: MainWamVisibility = { shown: false, migrated: false, changedAt: null, changedBy: null };

/** The row's columns as Supabase returns them: only `true` shows Main WAM. */
export function visibilityFromRow(row: { main_wam_shown?: unknown; main_wam_shown_at?: unknown; main_wam_shown_by?: unknown } | null): MainWamVisibility {
  if (!row) return { ...HIDDEN_MAIN_WAM, migrated: true };
  return {
    shown: row.main_wam_shown === true,
    migrated: true,
    changedAt: typeof row.main_wam_shown_at === "string" ? row.main_wam_shown_at : null,
    changedBy: typeof row.main_wam_shown_by === "string" ? row.main_wam_shown_by : null,
  };
}

/** The label the bell and the announcements' history carry for a Main WAM note sent while hidden. */
export const HIDDEN_AUDIENCE_LABEL = "Penguji WAM 2026";
