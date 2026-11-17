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
export const mwMissing = (error: DbError | null | undefined) => !!error && (CODES.includes(error.code ?? "") || /\bmw_/.test(error.message ?? ""));

export const mwWaiting = (migration = MAIN_WAM_MIGRATION) => new ServiceError(503, `Main WAM menunggu migrasi ${migration}.`);

/** For writers: missing → 503 menunggu migrasi; anything else as the database said. */
export function mwFail(error: DbError, migration = MAIN_WAM_MIGRATION): never {
  if (mwMissing(error)) throw mwWaiting(migration);
  return databaseError({ message: error.message ?? "", code: error.code });
}

/** A reader's answer: the rows, and whether the migration has run. */
export type Read<T> = { data: T; migrated: boolean };
