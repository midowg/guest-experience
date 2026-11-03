import { ForgotPasswordForm } from "@/components/pra-wam/ForgotPassword";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const metadata = { title: "Lupa password · WAM", robots: { index: false } };

export default function ForgotPasswordPage() {
  return <div className={`${styles.app} ${styles.login}`}><ForgotPasswordForm /></div>;
}
