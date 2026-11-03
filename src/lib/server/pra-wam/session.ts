import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { praWamPath } from "@/lib/routes";
import { praWamRoles, type PraWamRole } from "@/lib/pra-wam/roles";
import { PRA_WAM_COOKIE, PRA_WAM_SESSION_TTL_SECONDS, praWamSecret, signPraWamSession, verifyPraWamSession } from "@/lib/pra-wam/session-token";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient, createPublicClient } from "../supabase/admin";

/*
 * Who is signed in to Pra WAM. The cookie only names a person; every request checks again that
 * the account is still active and the session version still matches, so switching an account off
 * or resetting its password takes effect at once.
 */

export const PRA_WAM_MIGRATION = "202611040001_pra_wam_appraisal.sql";
export const notMigrated = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205", "42883", "PGRST202", "42703", "PGRST204"].includes(error.code ?? "") || /pw_/.test(error.message ?? "");
export const waitingForMigration = () => new ServiceError(503, `Pra WAM menunggu migrasi ${PRA_WAM_MIGRATION}.`);

export type Member = { id: string; name: string; nickname: string; department: string; position: string; mustChangePassword: boolean; roles: PraWamRole[] };

/** A person's roles; none before migration 202611040002, so everyone is simply a peserta then. */
async function rolesOfUncached(employeeId: string): Promise<PraWamRole[]> {
  const { data, error } = await createPrivilegedClient().from("pw_roles").select("role").eq("employee_id", employeeId);
  if (error) { if (notMigrated(error)) return []; databaseError(error); }
  return praWamRoles.filter(role => (data ?? []).some(row => row.role === role));
}
/** Read once per request, however many parts of the page ask. */
export const rolesOf = cache(rolesOfUncached);

const notReady = () => new ServiceError(503, "Login Pra WAM belum disiapkan. Isi WAM_SESSION_SECRET (acak, minimal 32 karakter) pada server.");

async function currentMemberUncached(): Promise<Member | null> {
  const secret = praWamSecret();
  const session = verifyPraWamSession(secret, (await cookies()).get(PRA_WAM_COOKIE)?.value);
  if (!session) return null;
  const { data, error } = await createPrivilegedClient().from("pw_accounts")
    .select("session_version,active,must_change_password,employees(id,full_name,nickname,department,position,active)")
    .eq("employee_id", session.employeeId).maybeSingle();
  if (error) { if (notMigrated(error)) return null; databaseError(error); }
  const person = data?.employees as unknown as { id: string; full_name: string; nickname: string; department: string; position: string; active: boolean } | null;
  if (!data || !person || !data.active || !person.active || data.session_version !== session.version) return null;
  return { id: person.id, name: person.full_name, nickname: person.nickname, department: person.department, position: person.position, mustChangePassword: data.must_change_password, roles: await rolesOf(person.id) };
}
/** Read once per request, however many parts of the page ask. */
export const currentMember = cache(currentMemberUncached);

/** For pages: the signed-in person, or a trip to the sign-in page that comes back here. */
export async function requireMemberPage(here: string): Promise<Member> {
  const member = await currentMember();
  if (!member) redirect(praWamPath.login(here));
  return member;
}

export async function requireApiMember(): Promise<Member> {
  if (!praWamSecret()) throw notReady();
  const member = await currentMember();
  if (!member) throw new ServiceError(401, "Sesi berakhir. Masuk kembali sebelum melanjutkan.");
  return member;
}

/**
 * Checks the email and password with Supabase Auth, then signs the person in on this device.
 * One message for every failure, so the form does not tell which emails have an account.
 */
export async function signIn(email: string, password: string): Promise<{ mustChangePassword: boolean }> {
  const secret = praWamSecret();
  if (!secret) throw notReady();
  const wrong = new ServiceError(401, "Email atau password tidak cocok. Periksa lalu coba lagi.");
  const { data: auth, error: authError } = await createPublicClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (authError || !auth.user) throw wrong;
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_accounts").select("employee_id,session_version,active,must_change_password").eq("auth_user_id", auth.user.id).maybeSingle();
  if (error) { if (notMigrated(error)) throw waitingForMigration(); databaseError(error); }
  if (!data || !data.active) throw wrong;
  await client.from("pw_accounts").update({ last_login_at: new Date().toISOString() }).eq("employee_id", data.employee_id);
  await issueSession(secret, data.employee_id, data.session_version);
  return { mustChangePassword: data.must_change_password };
}

async function issueSession(secret: string, employeeId: string, version: number) {
  (await cookies()).set(PRA_WAM_COOKIE, signPraWamSession(secret, { employeeId, version }), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: PRA_WAM_SESSION_TTL_SECONDS,
  });
}

/**
 * Changes the person's own password after checking the current one. Other devices are signed
 * out (the session version goes up); this one gets a fresh cookie and stays signed in.
 */
export async function changePassword(member: Member, current: string, next: string): Promise<void> {
  const secret = praWamSecret();
  if (!secret) throw notReady();
  if (next === process.env.WAM_DEFAULT_PASSWORD) throw new ServiceError(422, "Password baru harus berbeda dari password awal.", { next: ["Password baru harus berbeda dari password awal."] });
  const client = createPrivilegedClient();
  const { data: account, error } = await client.from("pw_accounts").select("auth_user_id,session_version").eq("employee_id", member.id).maybeSingle();
  if (error) { if (notMigrated(error)) throw waitingForMigration(); databaseError(error); }
  if (!account) throw new ServiceError(401, "Sesi berakhir. Masuk kembali sebelum melanjutkan.");
  const { data: user } = await client.auth.admin.getUserById(account.auth_user_id);
  const email = user?.user?.email;
  const { error: checkError } = email ? await createPublicClient().auth.signInWithPassword({ email, password: current }) : { error: new Error("no email") };
  if (checkError) throw new ServiceError(422, "Password saat ini tidak cocok.", { current: ["Password saat ini tidak cocok."] });
  const { error: updateError } = await client.auth.admin.updateUserById(account.auth_user_id, { password: next });
  if (updateError) throw new ServiceError(503, "Password belum dapat diganti. Coba lagi sebentar.");
  const version = account.session_version + 1;
  const { error: saveError } = await client.from("pw_accounts").update({ must_change_password: false, password_changed_at: new Date().toISOString(), session_version: version }).eq("employee_id", member.id);
  if (saveError) databaseError(saveError);
  await issueSession(secret, member.id, version);
}

/**
 * Sends a link to set a new password to the person's own email (Supabase Auth, with the SMTP set
 * in Supabase). The answer is the same whether or not the email has an account.
 */
export async function requestPasswordReset(email: string, origin: string): Promise<void> {
  const { error } = await createPublicClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${origin.replace(/\/$/, "")}${praWamPath.resetPassword}` });
  if (error && /rate|limit|security purposes/i.test(error.message)) throw new ServiceError(429, "Terlalu sering meminta tautan. Tunggu beberapa menit lalu coba lagi.");
}

/**
 * Finishes "Lupa password": the access token from the emailed link proves the person, the new
 * password is saved, every other device is signed out and this one is signed in.
 */
export async function completePasswordReset(accessToken: string, next: string): Promise<void> {
  const secret = praWamSecret();
  if (!secret) throw notReady();
  const expired = new ServiceError(401, "Tautan sudah tidak berlaku. Minta tautan baru dari halaman Lupa password.");
  if (next === process.env.WAM_DEFAULT_PASSWORD) throw new ServiceError(422, "Password baru harus berbeda dari password awal.", { next: ["Password baru harus berbeda dari password awal."] });
  const client = createPrivilegedClient();
  const { data: user, error: userError } = await client.auth.getUser(accessToken);
  if (userError || !user.user) throw expired;
  const { data: account, error } = await client.from("pw_accounts").select("employee_id,session_version,active").eq("auth_user_id", user.user.id).maybeSingle();
  if (error) { if (notMigrated(error)) throw waitingForMigration(); databaseError(error); }
  if (!account || !account.active) throw expired;
  const { error: updateError } = await client.auth.admin.updateUserById(user.user.id, { password: next });
  if (updateError) throw new ServiceError(503, "Password belum dapat diganti. Coba lagi sebentar.");
  const version = account.session_version + 1;
  const { error: saveError } = await client.from("pw_accounts").update({ must_change_password: false, password_changed_at: new Date().toISOString(), session_version: version }).eq("employee_id", account.employee_id);
  if (saveError) databaseError(saveError);
  await issueSession(secret, account.employee_id, version);
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(PRA_WAM_COOKIE);
}
