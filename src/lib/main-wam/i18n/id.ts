import { idCommon } from "./id/common";
import { idModul } from "./id/modul";
import { idMomen } from "./id/momen";
import { idPeserta } from "./id/peserta";

/*
 * Main WAM's texts in Indonesian: the source of every text and the language every screen is written
 * in (docs/main-wam/KIT.md, "Bahasa"). Split by area so agents do not edit the same file; the keys
 * are `area.name`. en.ts holds the same keys in English (a test keeps them the same). Never change
 * an Indonesian text here without changing the tests that read it.
 */
export const id = { ...idCommon, ...idPeserta, ...idMomen, ...idModul } as const;

export type MessageKey = keyof typeof id;
