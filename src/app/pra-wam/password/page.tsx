import { redirect } from "next/navigation";
import { PasswordForm } from "@/components/pra-wam/PasswordForm";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { safePraWamNext } from "@/lib/pra-wam/session-token";
import { praWamPath } from "@/lib/routes";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buat password baru · Pra WAM", robots: { index: false } };

/** After signing in with the shared first password: pick a new one, or skip and do it later in Akun. */
export default async function NewPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safePraWamNext((await searchParams).next) ?? praWamPath.home;
  const member = await requireMemberPage(praWamPath.newPassword(next));
  if (!member.mustChangePassword) redirect(next);
  return <PraWamShell member={member}>
    <div className={`${styles.card} ${styles.narrow}`}>
      <p className={styles.kicker}>Selamat datang, {member.nickname || member.name}</p>
      <h1>Buat password baru</h1>
      <p className={styles.hint}>Kamu masuk dengan password awal yang sama untuk semua orang. Ganti sekarang supaya hanya kamu yang bisa masuk, atau lewati dan atur nanti di menu Akun.</p>
      <PasswordForm firstTime skipHref={next} doneHref={next} />
    </div>
  </PraWamShell>;
}
