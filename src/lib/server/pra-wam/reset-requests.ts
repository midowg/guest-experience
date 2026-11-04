import "server-only";
import { escapeLike, matchEmployee, normalizeEmail, resetRequestAnswer, shouldRecord, type ResetRequestInput, type ResetRequestStatus } from "@/lib/pra-wam/reset-requests";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { resetPassword } from "./accounts";

/*
 * "Lupa password" requests (pw_reset_requests, migration 202611040010). The asker leaves an email
 * and a short note; an admin resets the account to the shared first password or declines.
 */

const MIGRATION = "202611040010_pra_wam_photos_reset_requests.sql";
const missing = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205"].includes(error.code ?? "") || /pw_reset_requests/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Permintaan reset password menunggu migrasi ${MIGRATION}.`);

export type ResetRequestRow = {
  id: string; employeeId: string | null; name: string | null; department: string | null; email: string; note: string;
  status: ResetRequestStatus; handledBy: string | null; handledAt: string | null; createdAt: string;
  /** False when the email is known but the person has no Pra WAM account yet: there is nothing to reset. */
  hasAccount: boolean;
};
export type ResetRequestList = { migrated: boolean; open: ResetRequestRow[]; history: ResetRequestRow[] };

/** Records a request; the answer does not depend on whether the email has an account. */
export async function submitResetRequest(input: ResetRequestInput): Promise<{ sent: boolean; message: string }> {
  const email = normalizeEmail(input.email);
  const client = createPrivilegedClient();
  const [{ data: people, error: peopleError }, { data: open, error: openError }] = await Promise.all([
    // A contains match, then the exact comparison in code, so stray spaces in Data karyawan still match.
    client.from("employees").select("id,email,active").ilike("email", `%${escapeLike(email)}%`).limit(20),
    client.from("pw_reset_requests").select("employee_id,email,created_at").eq("status", "menunggu").order("created_at", { ascending: false }).limit(500),
  ]);
  if (openError) { if (missing(openError)) return resetRequestAnswer({ migrated: false }); databaseError(openError); }
  if (peopleError) databaseError(peopleError);
  const person = matchEmployee(people ?? [], email);
  const employeeId = person?.id ?? null;
  const rows = (open ?? []).map(row => ({ employeeId: row.employee_id as string | null, email: row.email as string, createdAt: row.created_at as string }));
  if (shouldRecord({ employeeId, email }, rows)) {
    const { error } = await client.from("pw_reset_requests").insert({ employee_id: employeeId, email, note: input.note });
    if (error) {
      if (missing(error)) return resetRequestAnswer({ migrated: false });
      // Another open request for this account arrived at the same moment: the same answer.
      if (error.code !== "23505") databaseError(error);
    }
  }
  return resetRequestAnswer({ migrated: true });
}

type Raw = {
  id: string; employee_id: string | null; email: string; note: string; status: ResetRequestStatus;
  handled_by: string | null; handled_at: string | null; created_at: string;
  employees: { full_name: string; department: string } | null;
};
const COLUMNS = "id,employee_id,email,note,status,handled_by,handled_at,created_at,employees(full_name,department)";

export async function listResetRequests(): Promise<ResetRequestList> {
  const client = createPrivilegedClient();
  const [{ data: open, error }, { data: history, error: historyError }] = await Promise.all([
    client.from("pw_reset_requests").select(COLUMNS).eq("status", "menunggu").order("created_at", { ascending: false }).limit(200),
    client.from("pw_reset_requests").select(COLUMNS).neq("status", "menunggu").order("handled_at", { ascending: false, nullsFirst: false }).limit(10),
  ]);
  if (error) { if (missing(error)) return { migrated: false, open: [], history: [] }; databaseError(error); }
  if (historyError) databaseError(historyError);
  const ids = [...new Set((open ?? []).map(row => row.employee_id).filter((id): id is string => !!id))];
  const { data: accounts, error: accountError } = ids.length
    ? await client.from("pw_accounts").select("employee_id").in("employee_id", ids)
    : { data: [], error: null };
  if (accountError) databaseError(accountError);
  const withAccount = new Set((accounts ?? []).map(row => row.employee_id as string));
  const shape = (row: Raw): ResetRequestRow => ({
    id: row.id, employeeId: row.employee_id, name: row.employees?.full_name ?? null, department: row.employees?.department ?? null,
    email: row.email, note: row.note, status: row.status, handledBy: row.handled_by, handledAt: row.handled_at, createdAt: row.created_at,
    hasAccount: !!row.employee_id && withAccount.has(row.employee_id),
  });
  return { migrated: true, open: ((open ?? []) as unknown as Raw[]).map(shape), history: ((history ?? []) as unknown as Raw[]).map(shape) };
}

/** How many requests wait, for a badge; null before the migration or when it cannot be read. */
export async function openResetRequestCount(): Promise<number | null> {
  const { count, error } = await createPrivilegedClient().from("pw_reset_requests").select("id", { count: "exact", head: true }).eq("status", "menunggu");
  return error ? null : count ?? 0;
}

/**
 * An admin answers one open request: "reset" puts the account back to the shared first password
 * (signed out everywhere, a new password offered at the next sign-in); "tolak" declines.
 * `handledBy` is the admin role that answered, shown in the history.
 */
export async function handleResetRequest(id: string, action: "reset" | "tolak", handledBy: string): Promise<string> {
  const client = createPrivilegedClient();
  const { data: request, error } = await client.from("pw_reset_requests").select("id,employee_id,status").eq("id", id).maybeSingle();
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }
  if (!request) throw new ServiceError(404, "Permintaan tidak ditemukan. Muat ulang daftar.");
  if (request.status !== "menunggu") throw new ServiceError(409, "Permintaan ini sudah ditangani. Muat ulang daftar.");
  if (action === "reset") {
    if (!request.employee_id) throw new ServiceError(422, "Email ini tidak terdaftar di Data karyawan, jadi tidak ada akun untuk diatur ulang. Tolak permintaan ini.");
    await resetPassword(request.employee_id);
  }
  const { error: saveError } = await client.from("pw_reset_requests")
    .update({ status: action === "reset" ? "selesai" : "ditolak", handled_by: handledBy, handled_at: new Date().toISOString() })
    .eq("id", id).eq("status", "menunggu");
  if (saveError) databaseError(saveError);
  return action === "reset" ? "Password kembali ke password awal. Orang ini perlu masuk ulang lalu membuat password baru." : "Permintaan ditolak.";
}
