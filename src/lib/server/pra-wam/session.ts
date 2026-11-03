import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { praWamPath } from "@/lib/routes";
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

export type Member = { id: string; name: string; nickname: string; department: string; position: string; mustChangePassword: boolean };

const notReady = () => new ServiceError(503, "Login Pra WAM belum disiapkan. Isi WAM_SESSION_SECRET (acak, minimal 32 karakter) pada server.");

export async function currentMember(): Promise<Member | null> {
  const secret = praWamSecret();
  const session = verifyPraWamSession(secret, (await cookies()).get(PRA_WAM_COOKIE)?.value);
  if (!session) return null;
  const { data, error } = await createPrivilegedClient().from("pw_accounts")
    .select("session_version,active,must_change_password,employees(id,full_name,nickname,department,position,active)")
    .eq("employee_id", session.employeeId).maybeSingle();
  if (error) { if (notMigrated(error)) return null; databaseError(error); }
  const person = data?.employees as unknown as { id: string; full_name: string; nickname: string; department: string; position: string; active: boolean } | null;
  if (!data || !person || !data.active || !person.active || data.session_version !== session.version) return null;
  return { id: person.id, name: person.full_name, nickname: person.nickname, department: person.department, position: person.position, mustChangePassword: data.must_change_password };
}

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
export async function signIn(email: string, password: string): Promise<void> {
  const secret = praWamSecret();
  if (!secret) throw notReady();
  const wrong = new ServiceError(401, "Email atau password tidak cocok. Periksa lalu coba lagi.");
  const { data: auth, error: authError } = await createPublicClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (authError || !auth.user) throw wrong;
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_accounts").select("employee_id,session_version,active").eq("auth_user_id", auth.user.id).maybeSingle();
  if (error) { if (notMigrated(error)) throw waitingForMigration(); databaseError(error); }
  if (!data || !data.active) throw wrong;
  await client.from("pw_accounts").update({ last_login_at: new Date().toISOString() }).eq("employee_id", data.employee_id);
  (await cookies()).set(PRA_WAM_COOKIE, signPraWamSession(secret, { employeeId: data.employee_id, version: data.session_version }), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: PRA_WAM_SESSION_TTL_SECONDS,
  });
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(PRA_WAM_COOKIE);
}
