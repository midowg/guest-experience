import "server-only";
import { praWamRoles, type PraWamRole } from "@/lib/pra-wam/roles";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { notMigrated, waitingForMigration } from "./session";

/*
 * Pra WAM accounts, set up by the super admin. Each active person in Data karyawan with an email
 * gets a Supabase Auth user with the shared first password (WAM_DEFAULT_PASSWORD, a server
 * secret that is never written in the repository) and a row in pw_accounts.
 */

export type AccountRow = {
  employeeId: string; name: string; department: string; email: string; active: boolean;
  hasAccount: boolean; lastLoginAt: string | null; mustChangePassword: boolean; roles: PraWamRole[];
};

function defaultPassword(): string {
  const password = process.env.WAM_DEFAULT_PASSWORD ?? "";
  if (password.length < 8) throw new ServiceError(503, "Password awal Pra WAM belum disiapkan. Isi WAM_DEFAULT_PASSWORD (minimal 8 karakter) pada server.");
  return password;
}

export async function listAccounts(): Promise<{ rows: AccountRow[]; migrated: boolean }> {
  const client = createPrivilegedClient();
  const [{ data: people, error: peopleError }, { data: accounts, error }, { data: roles, error: rolesError }] = await Promise.all([
    client.from("employees").select("id,full_name,department,email,active").order("department").order("full_name").limit(2000),
    client.from("pw_accounts").select("employee_id,last_login_at,active,must_change_password"),
    client.from("pw_roles").select("employee_id,role"),
  ]);
  // Roles arrive with migration 202611040002; before it everyone is a peserta.
  if (rolesError && !notMigrated(rolesError)) databaseError(rolesError);
  if (peopleError) { if (notMigrated(peopleError)) return { rows: [], migrated: false }; databaseError(peopleError); }
  if (error) { if (notMigrated(error)) return { rows: [], migrated: false }; databaseError(error); }
  const byPerson = new Map((accounts ?? []).map(account => [account.employee_id, account]));
  return {
    migrated: true,
    rows: (people ?? []).map(person => ({
      employeeId: person.id, name: person.full_name, department: person.department, email: person.email, active: person.active,
      hasAccount: byPerson.has(person.id), lastLoginAt: byPerson.get(person.id)?.last_login_at ?? null,
      mustChangePassword: byPerson.get(person.id)?.must_change_password ?? true,
      roles: praWamRoles.filter(role => (roles ?? []).some(row => row.employee_id === person.id && row.role === role)),
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

/** Sets a person's roles to exactly these; peserta needs no row. */
export async function setRoles(employeeId: string, roles: PraWamRole[]): Promise<void> {
  const client = createPrivilegedClient();
  const { error } = await client.from("pw_roles").delete().eq("employee_id", employeeId).not("role", "in", `(${roles.length ? roles.join(",") : "none"})`);
  if (error) { if (notMigrated(error)) throw new ServiceError(503, "Peran menunggu migrasi 202611040002_pra_wam_roles.sql."); databaseError(error); }
  if (!roles.length) return;
  const { error: addError } = await client.from("pw_roles").upsert(roles.map(role => ({ employee_id: employeeId, role })), { onConflict: "employee_id,role", ignoreDuplicates: true });
  if (addError) databaseError(addError);
}

/**
 * Back to the shared first password, for someone who forgot theirs. They are signed out
 * everywhere and offered a new password at the next sign-in.
 */
export async function resetPassword(employeeId: string): Promise<void> {
  const password = defaultPassword();
  const client = createPrivilegedClient();
  const { data: account, error } = await client.from("pw_accounts").select("auth_user_id,session_version").eq("employee_id", employeeId).maybeSingle();
  if (error) { if (notMigrated(error)) throw waitingForMigration(); databaseError(error); }
  if (!account) throw new ServiceError(404, "Orang ini belum punya akun Pra WAM.");
  const { error: authError } = await client.auth.admin.updateUserById(account.auth_user_id, { password });
  if (authError) throw new ServiceError(503, "Password belum dapat diatur ulang. Coba lagi sebentar.");
  const { error: saveError } = await client.from("pw_accounts").update({ must_change_password: true, session_version: account.session_version + 1 }).eq("employee_id", employeeId);
  if (saveError) databaseError(saveError);
}

/** A room's capacity (empty = not known) and whether appraisal may book it. */
export async function updateRoom(roomId: string, patch: { capacity: number | null; bookable: boolean }): Promise<void> {
  const { data, error } = await createPrivilegedClient().from("pw_rooms").update(patch).eq("id", roomId).select("id").maybeSingle();
  if (error) { if (notMigrated(error)) throw waitingForMigration(); databaseError(error); }
  if (!data) throw new ServiceError(404, "Ruang tidak ditemukan.");
}
