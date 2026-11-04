import { ResetPasswordForm } from "@/components/pra-wam/ForgotPassword";
import { ThemeToggle } from "@/components/pra-wam/ThemeSwitch";
import { readWamTheme } from "@/lib/server/pra-wam/theme";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const metadata = { title: "Buat password baru · WAM", robots: { index: false }, referrer: "no-referrer" };

/** Opened from the "Lupa password" email. */
export default async function ResetPasswordPage() {
  return <div className={`${styles.app} ${styles.login}`}><ResetPasswordForm /><ThemeToggle initial={await readWamTheme()} /></div>;
}
