import "server-only";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { notMigrated, waitingForMigration } from "./session";

/*
 * Pra WAM accounts, set up by the super admin. Each active person in Data karyawan with an email
 * gets a Supabase Auth user with the shared first password (PRA_WAM_DEFAULT_PASSWORD, a server
 * secret that is never written in the repository) and a row in pw_accounts.
 */

export type AccountRow = { employeeId: string; name: string; department: string; email: string; active: boolean; hasAccount: boolean; lastLoginAt: string | null };

function defaultPassword(): string {
  const password = process.env.PRA_WAM_DEFAULT_PASSWORD ?? "";
  if (password.length < 8) throw new ServiceError(503, "Password awal Pra WAM belum disiapkan. Isi PRA_WAM_DEFAULT_PASSWORD (minimal 8 karakter) pada server.");
  return password;
}

export async function listAccounts(): Promise<{ rows: AccountRow[]; migrated: boolean }> {
  const client = createPrivilegedClient();
  const [{ data: people, error: peopleError }, { data: accounts, error }] = await Promise.all([
    client.from("employees").select("id,full_name,department,email,active").order("department").order("full_name").limit(2000),
    client.from("pw_accounts").select("employee_id,last_login_at,active"),
  ]);
  if (peopleError) { if (notMigrated(peopleError)) return { rows: [], migrated: false }; databaseError(peopleError); }
  if (error) { if (notMigrated(error)) return { rows: [], migrated: false }; databaseError(error); }
  const byPerson = new Map((accounts ?? []).map(account => [account.employee_id, account]));
  return {
    migrated: true,
    rows: (people ?? []).map(person => ({
      employeeId: person.id, name: person.full_name, department: person.department, email: person.email, active: person.active,
      hasAccount: byPerson.has(person.id), lastLoginAt: byPerson.get(person.id)?.last_login_at ?? null,
    })),
  };
}

/**
 * Creates the missing accounts. A person without an email, or whose email is already used by
 * another sign-in, is reported and skipped; running it again picks up whoever was added since.
 */
export async function createMissingAccounts(): Promise<{ created: number; skipped: string[] }> {
  const password = defaultPassword();
  const { rows, migrated } = await listAccounts();
  if (!migrated) throw waitingForMigration();
  const client = createPrivilegedClient();
  const skipped: string[] = [];
  let created = 0;
  for (const person of rows.filter(row => row.active && !row.hasAccount)) {
    if (!person.email) { skipped.push(`${person.name}: email masih kosong.`); continue; }
    const { data, error } = await client.auth.admin.createUser({ email: person.email.toLowerCase(), password, email_confirm: true, user_metadata: { employee_id: person.employeeId } });
    if (error || !data.user) { skipped.push(`${person.name}: ${/registered|exists/i.test(error?.message ?? "") ? "email sudah dipakai akun lain." : "akun belum dapat dibuat."}`); continue; }
    const { error: linkError } = await client.from("pw_accounts").insert({ employee_id: person.employeeId, auth_user_id: data.user.id });
    if (linkError) { await client.auth.admin.deleteUser(data.user.id); skipped.push(`${person.name}: akun belum dapat disimpan.`); continue; }
    created += 1;
  }
  return { created, skipped };
}
