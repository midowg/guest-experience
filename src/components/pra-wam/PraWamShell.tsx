import type { ReactNode } from "react";
import { managesSessions, roleSummary, seesAllSessions, type PraWamRole } from "@/lib/pra-wam/roles";
import { unreadCount } from "@/lib/server/pra-wam/announcements";
import { openRequestCount } from "@/lib/server/pra-wam/requests";
import { praWamPath } from "@/lib/routes";
import { SignOutButton } from "./SignOutButton";
import styles from "./pra-wam.module.css";

type Tab = "agenda" | "appraisal" | "dokumen" | "notifikasi" | "sesi" | "permintaan" | "pengumuman" | "akun";
type Who = { roles: readonly PraWamRole[] };
const tabs: { id: Tab; label: string; href: string; show?: (who: Who) => boolean }[] = [
  { id: "agenda", label: "Agenda", href: praWamPath.agenda },
  { id: "appraisal", label: "Appraisal", href: praWamPath.appraisal() },
  { id: "dokumen", label: "Dokumen", href: praWamPath.documents },
  { id: "notifikasi", label: "Notifikasi", href: praWamPath.notifications },
  { id: "sesi", label: "Semua sesi", href: praWamPath.sessions, show: seesAllSessions },
  { id: "permintaan", label: "Permintaan", href: praWamPath.requests, show: managesSessions },
  { id: "pengumuman", label: "Pengumuman", href: praWamPath.announcements, show: managesSessions },
  { id: "akun", label: "Akun", href: praWamPath.account },
];

/** The frame of every signed-in Pra WAM page: the blue bar with who is signed in and the menu. */
export async function PraWamShell({ member, current, children }: { member: { id: string; name: string; nickname: string; department: string; roles: PraWamRole[] }; current?: Tab; children: ReactNode }) {
  const [unread, waiting] = current ? await Promise.all([unreadCount(member.id), managesSessions(member) ? openRequestCount() : 0]) : [0, 0];
  const badge = (tab: Tab) => (tab === "notifikasi" ? unread : tab === "permintaan" ? waiting : 0);
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
        {tabs.filter(tab => !tab.show || tab.show(member)).map(tab => <a key={tab.id} className={styles.tab} href={tab.href} aria-current={tab.id === current ? "page" : undefined}>
          {tab.label}{badge(tab.id) > 0 && <span className={styles.badge} aria-label={tab.id === "notifikasi" ? `${badge(tab.id)} belum dibaca` : `${badge(tab.id)} menunggu`}>{badge(tab.id)}</span>}
        </a>)}
      </nav>}
    </header>
    <main className={styles.main} id="isi">{children}</main>
  </div>;
}
