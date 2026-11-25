import { enCeklis } from "./en/ceklis";
import { enCommon } from "./en/common";
import { enDemo } from "./en/demo";
import { enKuis } from "./en/kuis";
import { enModul } from "./en/modul";
import { enMisi } from "./en/misi";
import { enMisiAturan } from "./en/misi-aturan";
import { enMisiDeteksi } from "./en/misi-deteksi";
import { enMomenEditor } from "./en/momen-editor";
import { enMomen } from "./en/momen";
import { enMomenViewer } from "./en/momen-viewer";
import { enPeserta } from "./en/peserta";
import type { MessageKey } from "./id";

/*
 * Main WAM's texts in English: a translation of id.ts with exactly the same keys and the same
 * `{variables}` (src/lib/main-wam/i18n/i18n.test.ts checks). Fixed terms: Home, Agenda, Moments, Me;
 * Group; Check in; Mosaic; Silent Meeting; Awarding. Texts that admins write (session titles,
 * announcements, guides) are never in here.
 */
export const en: Record<MessageKey, string> = { ...enCommon, ...enPeserta, ...enMomen, ...enMomenViewer, ...enModul, ...enDemo, ...enKuis, ...enCeklis, ...enMisi, ...enMisiAturan, ...enMisiDeteksi, ...enMomenEditor };
