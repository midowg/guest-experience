import { z } from "zod";

/*
 * Panitia WAM (20 Nov 2026, KONTRAK §15): what Admin WAM 2026 → Panitia WAM sends, and the seksi it
 * suggests. A seksi is a label only (pw_event_staff.seksi, at most 40 characters): every seksi has the
 * same rights in Main WAM. Empty is fine.
 */

export const SEKSI_MAX = 40;
/** Offered in the seksi box; anything else may be typed. */
export const SEKSI_SUGGESTIONS = ["Acara", "Kamar", "Konsumsi", "Dokumentasi", "Transportasi", "Perlengkapan"] as const;

const seksi = z.string().trim().max(SEKSI_MAX, `Seksi paling banyak ${SEKSI_MAX} karakter.`);
export const staffAddSchema = z.object({ employeeId: z.uuid("Pilih karyawan."), seksi: seksi.default("") });
export const staffSeksiSchema = z.object({ seksi });
