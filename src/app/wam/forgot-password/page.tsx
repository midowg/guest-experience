import { ForgotPasswordForm } from "@/components/pra-wam/ForgotPassword";
import { ThemeSwitch } from "@/components/pra-wam/ThemeSwitch";
import { readWamTheme } from "@/lib/server/pra-wam/theme";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const metadata = { title: "Lupa password · WAM", robots: { index: false } };

export default async function ForgotPasswordPage() {
  return <div className={`${styles.app} ${styles.login}`}><ForgotPasswordForm /><ThemeSwitch initial={await readWamTheme()} compact /></div>;
}
