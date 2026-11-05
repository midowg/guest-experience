import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/console";
import { ScreenHead } from "@/components/pra-wam/PraWamShell";
import { AccountStatus } from "@/components/pra-wam/BodPeople";
import { PeopleBoard, type PersonItem } from "@/components/pra-wam/manage/PeopleBoard";
import { dayStatus, dayStatusPill, nextSessionLabel } from "@/components/pra-wam/manage/schedule";
import { Notice } from "@/components/ui";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { accountLabels, initials } from "@/lib/pra-wam/bod";
import { managesSessions, seesAllSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { attendance } from "@/lib/server/pra-wam/attendance";
import { bodPeople } from "@/lib/server/pra-wam/dashboard";
import { requireMemberPage, type Member } from "@/lib/server/pra-wam/session";
import { listSessions } from "@/lib/server/pra-wam/sessions";
import base from "@/components/pra-wam/pra-wam.module.css";
import styles from "@/components/pra-wam/bod.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Peserta · WAM", robots: { index: false } };

/**
 * Peserta: everyone, one tap to their profile. Read only. The panitia get cards or a table with
 * today's attendance and their next session (console "K3"); a BOD keeps the list by department.
 */
export default async function PeoplePage() {
  const member = await requireMemberPage(praWamPath.people);
  if (!seesAllSessions(member)) notFound();
  const people = await bodPeople();
  if (managesSessions(member)) return <PanitiaPeople member={member} people={people} />;
  const { groups, total, unitsMigrated } = people;
  return <>
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
  </>;
}

async function PanitiaPeople({ member, people: { groups, total, unitsMigrated } }: { member: Member; people: Awaited<ReturnType<typeof bodPeople>> }) {
  const now = new Date();
  const today = wibDate(now.toISOString());
  const { sessions } = await listSessions(member);
  const todays = sessions.filter(session => session.status === "terbit" && session.startsAt && wibDate(session.startsAt) === today);
  // Who checked in today; null when attendance is not recorded yet (the migration), so nobody shows as absent.
  const lists = await Promise.all(todays.map(session => attendance(session.id, member).then(rows => ({ id: session.id, rows })).catch(() => null)));
  const present = lists.some(list => list === null) ? null
    : new Set(lists.flatMap(list => list!.rows.filter(row => row.checkedInAt).map(row => `${list!.id}:${row.employeeId}`)));

  const items: PersonItem[] = groups.flatMap(group => group.people.map(person => {
    const key = dayStatus(person.id, todays, present);
    return {
      id: person.id, name: person.name, job: person.jobTitle, unit: group.name, isLead: person.isLead, href: praWamPath.person(person.id),
      account: accountLabels[person.account], today: { key, ...dayStatusPill[key] }, next: nextSessionLabel(person.id, sessions, now),
    };
  }));
  // Someone in two departments is one card, under the first.
  const unique = [...new Map(items.map(item => [item.id, item])).values()];
  return <>
    <PageHeader title="Peserta" subtitle={`${total} peserta di ${groups.length} departemen · akses baca saja`} />
    {!unitsMigrated && <Notice tone="warning">Unit dan jabatan menunggu migrasi 202611040003_pra_wam_events_units.sql; departemen diambil dari Data karyawan.</Notice>}
    <PeopleBoard people={unique} attendanceReady={present !== null && todays.length > 0} />
  </>;
}
