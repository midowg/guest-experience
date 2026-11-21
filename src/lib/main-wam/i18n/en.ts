import { enCeklis } from "./en/ceklis";
import { enCommon } from "./en/common";
import { enDemo } from "./en/demo";
import { enKuis } from "./en/kuis";
import { enModul } from "./en/modul";
import { enMomen } from "./en/momen";
import { enPeserta } from "./en/peserta";
import type { MessageKey } from "./id";

/*
 * Main WAM's texts in English: a translation of id.ts with exactly the same keys and the same
 * `{variables}` (src/lib/main-wam/i18n/i18n.test.ts checks). Fixed terms: Home, Agenda, Moments, Me;
 * Group; Check in; Mosaic; Silent Meeting; Awarding. Texts that admins write (session titles,
 * announcements, guides) are never in here.
 */
export const en: Record<MessageKey, string> = { ...enCommon, ...enPeserta, ...enMomen, ...enModul, ...enDemo, ...enKuis, ...enCeklis };
