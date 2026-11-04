import { CheckCircle2, Clock, MinusCircle, XCircle } from "lucide-react";
import { accountLabels, type AccountState, type ForumMark } from "@/lib/pra-wam/bod";
import styles from "./bod.module.css";

// Status pills for the BOD pages (Penpot "DS / Status"): always an icon and words, never colour alone.

const accountLook: Record<AccountState, { className: string; icon: typeof CheckCircle2 }> = {
  aktif: { className: styles.statusSuccess, icon: CheckCircle2 },
  "belum-masuk": { className: styles.statusWarning, icon: Clock },
  "tanpa-akun": { className: styles.statusLine, icon: MinusCircle },
  nonaktif: { className: styles.statusLine, icon: MinusCircle },
};

export function AccountStatus({ state }: { state: AccountState }) {
  const { className, icon: Icon } = accountLook[state];
  return <span className={`${styles.status} ${className}`}><Icon aria-hidden />{accountLabels[state]}</span>;
}

const forumLook: Record<ForumMark, { className: string; icon: typeof CheckCircle2; label: string }> = {
  hadir: { className: styles.statusSuccess, icon: CheckCircle2, label: "hadir" },
  "tidak-hadir": { className: styles.statusDanger, icon: XCircle, label: "tidak hadir" },
  berlangsung: { className: styles.statusLine, icon: Clock, label: "sedang berlangsung, belum absen" },
};

/** One forum in a profile: the forum's name, with its mark spoken for screen readers. */
export function ForumStatus({ title, mark }: { title: string; mark: ForumMark }) {
  const { className, icon: Icon, label } = forumLook[mark];
  return <span className={`${styles.status} ${className}`} title={`${title}: ${label}`}><Icon aria-hidden />{title}<span className="sr-only">, {label}</span></span>;
}
