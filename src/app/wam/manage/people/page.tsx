import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { PraWamShell, ScreenHead } from "@/components/pra-wam/PraWamShell";
import { AccountStatus } from "@/components/pra-wam/BodPeople";
import { Notice } from "@/components/ui";
import { initials } from "@/lib/pra-wam/bod";
import { seesAllSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { bodPeople } from "@/lib/server/pra-wam/dashboard";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import base from "@/components/pra-wam/pra-wam.module.css";
import styles from "@/components/pra-wam/bod.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Peserta · WAM", robots: { index: false } };

/** Peserta (BOD tab, and "Semua unit & BU"): everyone by department, one tap to their profile. Read only. */
export default async function PeoplePage() {
  const member = await requireMemberPage(praWamPath.people);
  if (!seesAllSessions(member)) notFound();
  const { groups, total, unitsMigrated } = await bodPeople();
  return <PraWamShell member={member} current="peserta">
    <ScreenHead title="Peserta" lead={`${total} peserta di ${groups.length} departemen · akses baca saja`} />
    {!unitsMigrated && <Notice tone="warning">Unit dan jabatan menunggu migrasi 202611040003_pra_wam_events_units.sql; departemen diambil dari Data karyawan.</Notice>}
    {groups.length === 0 ? <section className={base.card}><p className={styles.empty}>Belum ada peserta. Data karyawan diisi super admin.</p></section>
      : <div className={styles.groups}>{groups.map(group => <section key={group.id} className={base.card} aria-labelledby={`dep-${group.id}`}>
        <div className={styles.groupHead}>
          <h2 id={`dep-${group.id}`}>{group.name}</h2>
          <span>{[`${group.people.length} orang`, group.businessUnits.join(", "), group.leads.length ? `Lead: ${group.leads.join(", ")}` : ""].filter(Boolean).join(" · ")}</span>
        </div>
        <ul className={styles.people}>{group.people.map(person => <li key={person.id}>
          <a className={styles.personRow} href={praWamPath.person(person.id)}>
            <span className={styles.initials} aria-hidden>{initials(person.name)}</span>
            <span><strong>{person.name}</strong>{(person.jobTitle || person.isLead) && <small>{[person.isLead ? "Lead" : "", person.jobTitle].filter(Boolean).join(" · ")}</small>}</span>
            <AccountStatus state={person.account} />
            <ChevronRight size={18} aria-hidden />
          </a>
        </li>)}</ul>
      </section>)}</div>}
  </PraWamShell>;
}
