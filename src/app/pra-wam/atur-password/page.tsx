import { ResetPasswordForm } from "@/components/pra-wam/ForgotPassword";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const metadata = { title: "Buat password baru · Pra WAM", robots: { index: false }, referrer: "no-referrer" };

/** Opened from the "Lupa password" email. */
export default function ResetPasswordPage() {
  return <div className={`${styles.app} ${styles.login}`}><ResetPasswordForm /></div>;
}
