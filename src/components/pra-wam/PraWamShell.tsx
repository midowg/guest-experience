import type { ReactNode } from "react";
import { praWamPath } from "@/lib/routes";
import { SignOutButton } from "./SignOutButton";
import styles from "./pra-wam.module.css";

/** The frame of every signed-in Pra WAM page: the blue bar with who is signed in, then the page. */
export function PraWamShell({ member, children }: { member: { name: string; nickname: string; department: string }; children: ReactNode }) {
  return <div className={styles.app}>
    <header className={styles.bar}>
      <div className={styles.barInner}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static mark */}
        <a className={styles.brand} href={praWamPath.home}><img src="/werkudara-mark.png" alt="" /><span>Pra <span className={styles.brandAccent}>WAM</span></span></a>
        <span className={styles.barSpace} />
        <span className={styles.who}>{member.nickname || member.name}<small>{member.department}</small></span>
        <SignOutButton className={styles.signOut} />
      </div>
    </header>
    <main className={styles.main} id="isi">{children}</main>
  </div>;
}
