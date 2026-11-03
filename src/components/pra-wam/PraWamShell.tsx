import type { ReactNode } from "react";
import { roleSummary, seesAllSessions, type PraWamRole } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { SignOutButton } from "./SignOutButton";
import styles from "./pra-wam.module.css";

type Tab = "agenda" | "appraisal" | "dokumen" | "sesi" | "akun";
const tabs: { id: Tab; label: string; href: string; staff?: boolean }[] = [
  { id: "agenda", label: "Agenda", href: praWamPath.agenda },
  { id: "appraisal", label: "Appraisal", href: praWamPath.appraisal() },
  { id: "dokumen", label: "Dokumen", href: praWamPath.documents },
  { id: "sesi", label: "Semua sesi", href: praWamPath.sessions, staff: true },
  { id: "akun", label: "Akun", href: praWamPath.account },
];

/** The frame of every signed-in Pra WAM page: the blue bar with who is signed in and the menu. */
export function PraWamShell({ member, current, children }: { member: { name: string; nickname: string; department: string; roles: PraWamRole[] }; current?: Tab; children: ReactNode }) {
  return <div className={styles.app}>
    <header className={styles.bar}>
      <div className={styles.barInner}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static mark */}
        <a className={styles.brand} href={praWamPath.home}><img src="/werkudara-mark.png" alt="" /><span>Pra <span className={styles.brandAccent}>WAM</span></span></a>
        <span className={styles.barSpace} />
        <span className={styles.who}>{member.nickname || member.name}<small>{roleSummary(member)}</small></span>
        <SignOutButton className={styles.signOut} />
      </div>
      {current && <nav className={styles.tabs} aria-label="Menu Pra WAM">
        {tabs.filter(tab => !tab.staff || seesAllSessions(member)).map(tab => <a key={tab.id} className={styles.tab} href={tab.href} aria-current={tab.id === current ? "page" : undefined}>{tab.label}</a>)}
      </nav>}
    </header>
    <main className={styles.main} id="isi">{children}</main>
  </div>;
}
