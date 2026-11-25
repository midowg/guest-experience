import { idCeklis } from "./id/ceklis";
import { idCommon } from "./id/common";
import { idDemo } from "./id/demo";
import { idKuis } from "./id/kuis";
import { idModul } from "./id/modul";
import { idMisi } from "./id/misi";
import { idMisiAturan } from "./id/misi-aturan";
import { idMisiDeteksi } from "./id/misi-deteksi";
import { idMomenEditor } from "./id/momen-editor";
import { idMomen } from "./id/momen";
import { idMomenViewer } from "./id/momen-viewer";
import { idPeserta } from "./id/peserta";

/*
 * Main WAM's texts in Indonesian: the source of every text and the language every screen is written
 * in (docs/main-wam/KIT.md, "Bahasa"). Split by area so agents do not edit the same file; the keys
 * are `area.name`. en.ts holds the same keys in English (a test keeps them the same). Never change
 * an Indonesian text here without changing the tests that read it.
 */
export const id = { ...idCommon, ...idPeserta, ...idMomen, ...idMomenViewer, ...idModul, ...idDemo, ...idKuis, ...idCeklis, ...idMisi, ...idMisiAturan, ...idMisiDeteksi, ...idMomenEditor } as const;

export type MessageKey = keyof typeof id;
