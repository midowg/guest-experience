import "server-only";
import { redirect } from "next/navigation";
import { createSessionClient } from "./supabase/server";
import { ServiceError } from "./config";

export async function getAdmin(): Promise<{ id: string; email: string } | null> {
  const client = await createSessionClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  const { data: member, error: membershipError } = await client.from("admin_members").select("user_id").eq("user_id", user.id).maybeSingle();
  if (membershipError) throw new ServiceError(503, "Keanggotaan admin belum dapat diperiksa. Periksa migrasi dan koneksi Supabase.");
  return member ? { id: user.id, email: user.email ?? "" } : null;
}

export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function requireApiAdmin() {
  const admin = await getAdmin();
  if (!admin) throw new ServiceError(401, "Masuk menggunakan akun admin yang terdaftar.");
  return admin;
}
