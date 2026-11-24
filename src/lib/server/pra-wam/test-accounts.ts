import "server-only";
import { cache } from "react";
import { asTestAccounts, NO_TEST_ACCOUNTS, TEST_ACCOUNTS_KEY, type TestAccounts } from "@/lib/pra-wam/test-accounts";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";

/* Akun uji (24 Nov 2026): one row of pw_settings (migration 202611120001, already there). */

const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(error.code ?? "") || /pw_settings/.test(error.message ?? "");

async function readUncached(): Promise<{ accounts: TestAccounts; migrated: boolean }> {
  const { data, error } = await createPrivilegedClient().from("pw_settings").select("value").eq("key", TEST_ACCOUNTS_KEY).maybeSingle();
  if (error) { if (missing(error)) return { accounts: NO_TEST_ACCOUNTS, migrated: false }; databaseError(error); }
  return { accounts: asTestAccounts((data as { value: unknown } | null)?.value), migrated: true };
}
/** Read once per request, however many parts of the page ask. */
const read = cache(readUncached);

/** The test accounts; none when the row cannot be read (never in the way of a page). */
export const testAccounts = async (): Promise<TestAccounts> => (await read().catch(() => ({ accounts: NO_TEST_ACCOUNTS }))).accounts;

export type TestAccountsState = { accounts: TestAccounts; migrated: boolean; people: { id: string; name: string; department: string }[] };

/** The admin page: the list, and every active employee to pick from (names and departments only). */
export async function testAccountsState(): Promise<TestAccountsState> {
  const [{ accounts, migrated }, people] = await Promise.all([readUncached(), listPeople()]);
  return { accounts, migrated, people: people.filter(person => person.active).map(person => ({ id: person.id, name: person.fullName || person.name, department: person.department })) };
}

/** Saves the list (already checked by testAccountsSchema); only active employees are kept. */
export async function saveTestAccounts(accounts: TestAccounts): Promise<void> {
  const active = new Set((await listPeople()).filter(person => person.active).map(person => person.id));
  const unknown = accounts.ids.filter(id => !active.has(id));
  if (unknown.length) throw new ServiceError(400, "Ada akun yang tidak aktif atau tidak dikenal. Muat ulang halaman.");
  const { error } = await createPrivilegedClient().from("pw_settings").upsert({ key: TEST_ACCOUNTS_KEY, value: { ids: [...new Set(accounts.ids)], carbonTestOnly: accounts.carbonTestOnly }, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) { if (missing(error)) throw new ServiceError(503, "Akun uji menunggu tabel pw_settings (migrasi 202611120001)."); databaseError(error); }
}
