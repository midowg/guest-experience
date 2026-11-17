import "server-only";
import { MAIN_WAM_MIGRATION } from "@/lib/main-wam/settings";
import { ServiceError } from "../config";
import { databaseError } from "../http";

/*
 * Main WAM before its migrations (aturan-wam §1, struktur-kode "Menambah tabel"): a table, column or
 * function that is not there yet is "menunggu migrasi", never an error. Readers return an empty
 * answer with `migrated: false`; writers throw 503 with the migration's name.
 */

export type DbError = { code?: string; message?: string };
const CODES = ["42P01", "PGRST205", "42703", "PGRST204", "42883", "PGRST202"];

/** A Main WAM table or column that is not there yet. */
export function mwMissing(error: DbError | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (CODES.includes(code)) return true;
  // A coded refusal (23505 unik, 23514 check, 23503 FK, P0001 raise …) is a real answer, never "menunggu migrasi".
  if (code) return false;
  // No code (a bare PostgREST message): only "this mw_ thing does not exist" counts.
  const message = error.message ?? "";
  return /\bmw_/.test(message) && /does not exist|could not find|schema cache/i.test(message);
}

export const mwWaiting = (migration = MAIN_WAM_MIGRATION) => new ServiceError(503, `Main WAM menunggu migrasi ${migration}.`);

/** For writers: missing → 503 menunggu migrasi; anything else as the database said. */
export function mwFail(error: DbError, migration = MAIN_WAM_MIGRATION): never {
  if (mwMissing(error)) throw mwWaiting(migration);
  return databaseError({ message: error.message ?? "", code: error.code });
}

/** A reader's answer: the rows, and whether the migration has run. */
export type Read<T> = { data: T; migrated: boolean };
