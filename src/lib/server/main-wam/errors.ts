import "server-only";
import { MAIN_WAM_MIGRATION } from "@/lib/main-wam/settings";
import { ServiceError } from "../config";
import { databaseError } from "../http";

/*
 * Main WAM before its migrations (aturan-wam §1, struktur-kode "Menambah tabel"): a table, column or
 * function that is not there yet is "menunggu migrasi", never an error. Readers return an empty
 * answer with `migrated: false`; writers throw 503 with a plain message (the migration's name is
 * logged on the server, and Admin WAM names it on its own pages).
 */

export type DbError = { code?: string; message?: string };
const CODES = ["42P01", "PGRST205", "42703", "PGRST204", "42883", "PGRST202"];

/** A Main WAM table or column that is not there yet. */
export function mwMissing(error: DbError | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (CODES.includes(code)) return true;
  // An embed of an mw_ table that is not there yet ("Could not find a relationship … 'mw_notes'").
  if (code === "PGRST200") return /\bmw_/.test(error.message ?? "");
  // A coded refusal (23505 unik, 23514 check, 23503 FK, P0001 raise …) is a real answer, never "menunggu migrasi".
  if (code) return false;
  // No code (a bare PostgREST message): only "this mw_ thing does not exist" counts.
  const message = error.message ?? "";
  return /\bmw_/.test(message) && /does not exist|could not find|schema cache/i.test(message);
}

/** What a person reads while a feature waits for its migration (audit R13: no file names, those are for the server log and Admin WAM). */
export const MW_WAITING_MESSAGE = "Fitur ini menunggu pembaruan sistem. Hubungi tim CoE.";

/** 503 for a writer before its migration; the migration's name goes to the server log only. */
export function mwWaiting(migration = MAIN_WAM_MIGRATION): ServiceError {
  console.warn(`main-wam: menunggu migrasi ${migration}`);
  return new ServiceError(503, MW_WAITING_MESSAGE);
}

/** For writers: missing → 503 menunggu migrasi; anything else as the database said. */
export function mwFail(error: DbError, migration = MAIN_WAM_MIGRATION): never {
  if (mwMissing(error)) throw mwWaiting(migration);
  return databaseError({ message: error.message ?? "", code: error.code });
}

/** A reader's answer: the rows, and whether the migration has run. */
export type Read<T> = { data: T; migrated: boolean };
