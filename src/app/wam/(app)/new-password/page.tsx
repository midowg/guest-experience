import { redirect } from "next/navigation";
import { PasswordForm } from "@/components/pra-wam/PasswordForm";
import { ScreenHead } from "@/components/pra-wam/PraWamShell";
import { safePraWamNext } from "@/lib/pra-wam/session-token";
import { praWamPath } from "@/lib/routes";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buat password baru · WAM", robots: { index: false } };

/** Penpot "A2": after signing in with the shared first password, pick a new one or skip for now. */
export default async function NewPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safePraWamNext((await searchParams).next) ?? praWamPath.home;
  const member = await requireMemberPage(praWamPath.newPassword(next));
  if (!member.mustChangePassword) redirect(next);
  return <>
    <div className={styles.narrow}>
      
      <ScreenHead title="Buat password baru" lead="Anda masuk dengan password awal. Sebaiknya ganti sekarang, atau atur nanti di Pengaturan akun." />
      <PasswordForm firstTime skipHref={next} doneHref={next} />
    </div>
  </>;
}
