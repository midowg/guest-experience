import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { LoginForm } from "@/components/admin/AuthControls";
import { Notice } from "@/components/ui";
import styles from "@/components/admin/admin.module.css";
import { adminAuthConfig, MIN_PASSWORD_LENGTH, MIN_SECRET_LENGTH, safeNext } from "@/lib/admin-token";
import { hasAdminSession } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk admin" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const configured = adminAuthConfig() !== null;
  if (configured && await hasAdminSession()) redirect(next);
  return <AdminShell bare>
    <section className={styles.loginCard} aria-labelledby="login-title">
      <span className={styles.loginIcon} aria-hidden="true"><KeyRound size={22} /></span>
      <h1 id="login-title" className={styles.loginTitle}>Masuk ke admin</h1>
      {configured ? <>
        {params.berakhir === "1" && <Notice tone="warning">Sesi Anda berakhir. Masuk kembali untuk melanjutkan.</Notice>}
        <p className={styles.loginLead}>Masukkan password admin untuk mengelola acara.</p>
        <LoginForm next={next} />
        <p className={styles.loginNote}>Aktivitas login dicatat: waktu, IP, perkiraan lokasi, dan perangkat. Sesi berlaku 12 jam.</p>
      </> : <>
        <Notice tone="warning">Login admin belum disiapkan, jadi panel ini terkunci.</Notice>
        <ol className={styles.loginSteps}>
          <li>Isi <code>ADMIN_PASSWORD</code> (minimal {MIN_PASSWORD_LENGTH} karakter) dan <code>ADMIN_SESSION_SECRET</code> (acak, minimal {MIN_SECRET_LENGTH} karakter) di environment server.</li>
          <li>Mulai ulang aplikasi, lalu buka halaman ini lagi.</li>
        </ol>
      </>}
    </section>
  </AdminShell>;
}
