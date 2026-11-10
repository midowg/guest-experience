import "server-only";
import { checkRoleChange, normalizeRoles, praWamRoles, type PraWamRole } from "@/lib/pra-wam/roles";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { notMigrated, waitingForMigration } from "./session";
import { hasPost } from "@/lib/pra-wam/leads";
import { listLeads, leadsOf } from "./leads";

/*
 * Pra WAM accounts, set up in Admin WAM or per person from Data karyawan (super admin). Each
 * active person in Data karyawan with an email gets a Supabase Auth user with the shared first
 * password (WAM_DEFAULT_PASSWORD, a server secret that is never written in the repository) and a
 * row in pw_accounts.
 */

export type AccountRow = {
  employeeId: string; name: string; department: string; email: string; active: boolean;
  hasAccount: boolean; lastLoginAt: string | null; mustChangePassword: boolean; roles: PraWamRole[];
  /** Departments this person heads (HOD): set by hand, or from the unit import. */
  leads: string[];
  /** A Lead in their department (under the HOD, with their own people; 9 Nov 2026, was "lead BU"). */
  lead: boolean;
  /** Their business unit by code (WNS until set); "" before migration 202611060002. */
  businessUnit: string;
};

/** Whether the shared first password is set on the server, so accounts can be made and reset. */
export const defaultPasswordReady = (): boolean => (process.env.WAM_DEFAULT_PASSWORD ?? "").length >= 8;

function defaultPassword(): string {
  const password = process.env.WAM_DEFAULT_PASSWORD ?? "";
  if (password.length < 8) throw new ServiceError(503, "Password awal Pra WAM belum disiapkan. Isi WAM_DEFAULT_PASSWORD (minimal 8 karakter) pada server.");
  return password;
}

/** Everyone in Data karyawan with their BU; without it before migration 202611060002. */
async function readPeople() {
  const client = createPrivilegedClient();
  const read = (fields: string) => client.from("employees").select(fields).order("full_name").limit(2000);
  let result = await read("id,full_name,department,email,active,business_unit");
  if (result.error && ["42703", "PGRST204"].includes(result.error.code ?? "")) result = await read("id,full_name,department,email,active");
  return { data: result.data as unknown as { id: string; full_name: string; department: string; email: string; active: boolean; business_unit?: string }[] | null, error: result.error };
}

export async function listAccounts(): Promise<{ rows: AccountRow[]; migrated: boolean }> {
  const client = createPrivilegedClient();
  const [{ data: people, error: peopleError }, { data: accounts, error }, { data: roles, error: rolesError }, leads] = await Promise.all([
    readPeople(),
    client.from("pw_accounts").select("employee_id,last_login_at,active,must_change_password"),
    client.from("pw_roles").select("employee_id,role"),
    listLeads().then(result => result.byPerson),
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
      leads: leads.get(person.id)?.departments ?? [],
      lead: leads.get(person.id)?.lead ?? false,
      businessUnit: person.business_unit ?? "",
    })),
  };
}

type CreateResult = { created: number; skipped: string[] };

/**
 * Makes the sign-in and the pw_accounts row for each of these people, or says why not. A person
 * without an email, or whose email is already used by another sign-in, is reported and skipped.
 */
async function createFor(people: AccountRow[], password: string): Promise<CreateResult> {
  const client = createPrivilegedClient();
  const skipped: string[] = [];
  let created = 0;
  for (const person of people) {
    if (!person.email) { skipped.push(`${person.name}: email masih kosong.`); continue; }
    const { data, error } = await client.auth.admin.createUser({ email: person.email.toLowerCase(), password, email_confirm: true, user_metadata: { employee_id: person.employeeId } });
    if (error || !data.user) { skipped.push(`${person.name}: ${/registered|exists/i.test(error?.message ?? "") ? "email sudah dipakai akun lain." : "akun belum dapat dibuat."}`); continue; }
    const { error: linkError } = await client.from("pw_accounts").insert({ employee_id: person.employeeId, auth_user_id: data.user.id });
    if (linkError) { await client.auth.admin.deleteUser(data.user.id); skipped.push(`${person.name}: akun belum dapat disimpan.`); continue; }
    created += 1;
  }
  return { created, skipped };
}

/** Creates the missing accounts of everyone active; running it again picks up whoever was added since. */
export async function createMissingAccounts(): Promise<CreateResult> {
  const password = defaultPassword();
  const { rows, migrated } = await listAccounts();
  if (!migrated) throw waitingForMigration();
  return createFor(rows.filter(row => row.active && !row.hasAccount), password);
}

/**
 * Creates one person's account, from their row in Data karyawan. Someone inactive or who already
 * has an account is reported as skipped, not created twice.
 */
export async function createAccount(employeeId: string): Promise<CreateResult> {
  const password = defaultPassword();
  const { rows, migrated } = await listAccounts();
  if (!migrated) throw waitingForMigration();
  const person = rows.find(row => row.employeeId === employeeId);
  if (!person) throw new ServiceError(404, "Karyawan tidak ditemukan.");
  if (person.hasAccount) return { created: 0, skipped: [`${person.name}: sudah punya akun.`] };
  if (!person.active) return { created: 0, skipped: [`${person.name}: nonaktif.`] };
  return createFor([person], password);
}

/**
 * Sets a person's roles to exactly these; peserta needs no row. A combination the rule refuses
 * (BOD with Panitia, Admin WAM or a department lead) is a 422 and nothing changes. Nobody is
 * signed out: roles are read again on every request.
 */
export async function setRoles(employeeId: string, wanted: PraWamRole[]): Promise<void> {
  const roles = normalizeRoles(wanted);
  const client = createPrivilegedClient();
  const [{ data: current, error: currentError }, leads] = await Promise.all([
    client.from("pw_roles").select("role").eq("employee_id", employeeId),
    leadsOf(employeeId),
  ]);
  if (currentError) { if (notMigrated(currentError)) throw new ServiceError(503, "Peran menunggu migrasi 202611040002_pra_wam_roles.sql."); databaseError(currentError); }
  const problem = checkRoleChange(normalizeRoles((current ?? []).map(row => row.role)), roles, { isLead: hasPost(leads) });
  if (problem) throw new ServiceError(422, problem, { roles: [problem] });
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
  const { error: saveError } = await client.from("pw_accounts").update({ must_change_password: true, session_version: account.session_version + 1, password_changed_at: new Date().toISOString() }).eq("employee_id", employeeId);
  if (saveError) databaseError(saveError);
}

/**
 * A person's email, from Admin WAM → Akun or from Data karyawan (Ubah karyawan): in Data karyawan
 * and, when they have an account, as their sign-in too, so they sign in (and receive "Lupa
 * password") with the new address. Any domain is fine. Nothing changes if another person already
 * uses it. Saving the same address again also mends a sign-in left on an older address (before
 * 10 Nov 2026 Data karyawan changed only its own column). An account's email cannot be emptied.
 */
export async function updateEmail(employeeId: string, email: string): Promise<void> {
  const address = email.trim().toLowerCase();
  const client = createPrivilegedClient();
  const { data: people, error } = await client.from("employees").select("id,email").limit(2000);
  if (error) databaseError(error);
  const same = (value: string | null | undefined) => (value ?? "").trim().toLowerCase() === address;
  if (!people?.some(person => person.id === employeeId)) throw new ServiceError(404, "Karyawan tidak ditemukan.");
  if (address && people.some(person => person.id !== employeeId && same(person.email))) {
    throw new ServiceError(409, "Email ini sudah dipakai karyawan lain.", { email: ["Email ini sudah dipakai karyawan lain."] });
  }
  const before = people.find(person => person.id === employeeId)!.email ?? "";
  const { data: account, error: accountError } = await client.from("pw_accounts").select("auth_user_id").eq("employee_id", employeeId).maybeSingle();
  if (accountError && !notMigrated(accountError)) databaseError(accountError);
  let signInBefore: string | null = null;
  if (account) {
    if (!address) throw new ServiceError(422, "Orang ini punya akun WAM, jadi emailnya tidak bisa dikosongkan.", { email: ["Isi email untuk masuk WAM."] });
    const { data: user } = await client.auth.admin.getUserById(account.auth_user_id);
    const current = user?.user?.email ?? null;
    if (!same(current)) {
      const { error: authError } = await client.auth.admin.updateUserById(account.auth_user_id, { email: address, email_confirm: true });
      if (authError) throw new ServiceError(/registered|exists|already/i.test(authError.message) ? 409 : 503, /registered|exists|already/i.test(authError.message) ? "Email ini sudah dipakai akun login lain." : "Email login belum dapat diubah. Coba lagi sebentar.", { email: ["Email belum tersimpan."] });
      signInBefore = current;
    }
  }
  if (before === address) return;
  const { error: saveError } = await client.from("employees").update({ email: address, updated_at: new Date().toISOString() }).eq("id", employeeId);
  if (saveError) {
    // Keep the sign-in and Data karyawan the same if the second write fails.
    if (account && signInBefore) await client.auth.admin.updateUserById(account.auth_user_id, { email: signInBefore, email_confirm: true });
    databaseError(saveError);
  }
}
