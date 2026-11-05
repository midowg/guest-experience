import { notFound } from "next/navigation";
import { BriefcaseBusiness, Lock, Users } from "lucide-react";
import { AccountStatus, ForumStatus } from "@/components/pra-wam/BodPeople";
import { initials } from "@/lib/pra-wam/bod";
import { roleLabels, roleSummary, seesAllSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { bodProfile } from "@/lib/server/pra-wam/dashboard";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import base from "@/components/pra-wam/pra-wam.module.css";
import styles from "@/components/pra-wam/bod.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profil peserta · WAM", robots: { index: false } };

const ATTENDANCE_MIGRATION = "202611040005_pra_wam_attendance.sql";

/**
 * Profil peserta seen by BOD (Penpot "B2"): who they are, their department, BU and position, and
 * which Pra WAM forums they came to. Read only; nothing personal beyond what the event needs.
 */
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireMemberPage(praWamPath.person(id));
  if (!seesAllSessions(member)) notFound();
  const person = await bodProfile(member, id);
  if (!person) notFound();

  const departments = person.units.filter(unit => unit.kind === "departemen").map(unit => unit.name);
  const businessUnits = person.units.filter(unit => unit.kind === "bu").map(unit => unit.name);
  const place = [departments.length ? departments.join(", ") : person.department, businessUnits.join(", ")].filter(Boolean).join(" · ");
  const titles = [...new Set(person.units.map(unit => [unit.isLead ? "Lead" : "", unit.jobTitle].filter(Boolean).join(" · ")).filter(Boolean))];
  const position = titles.length ? titles.join(", ") : person.position;
  const viewerRole = member.roles.includes("bod") ? roleLabels.bod : member.roles.includes("admin") ? roleLabels.admin : roleLabels.panitia.toLowerCase();
  const attended = person.forums.filter(forum => forum.mark === "hadir").length;

  // The panitia stay in Kelola acara (its sidebar on a desktop); a BOD keeps the BOD frame.
  return <>
    <div className={styles.profile}>
      <div className={styles.identity}>
        <span className={styles.avatarLarge} aria-hidden>{initials(person.name)}</span>
        <div>
          <h1>{person.name}</h1>
          <p>{[person.department, roleSummary(person)].filter(Boolean).join(" · ")}</p>
          <AccountStatus state={person.account} />
        </div>
      </div>
      <p className={styles.access}><Lock aria-hidden />Akses {viewerRole} · baca saja</p>

      <section className={base.card} aria-label="Unit dan jabatan">
        <div className={styles.info}>
          <div className={styles.infoRow}><span className={base.tile}><Users aria-hidden /></span><div><small>Departemen · BU</small><strong>{place || "Belum diisi"}</strong></div></div>
          <div className={styles.infoRow}><span className={base.tile}><BriefcaseBusiness aria-hidden /></span><div><small>Jabatan</small><strong>{position || "Belum diisi"}</strong></div></div>
        </div>
      </section>

      <section className={base.card} aria-labelledby="kehadiran">
        <div className={styles.cardHead}>
          <h2 id="kehadiran">Kehadiran forum Pra WAM</h2>
          {person.attendanceReady && person.forums.length > 0 && <span>{attended} dari {person.forums.length}</span>}
        </div>
        {person.forums.length === 0
          ? <p className={styles.empty}>Belum ada forum yang dimulai untuk {person.name.split(" ")[0]}.</p>
          : !person.attendanceReady
            ? <>
              <p className={styles.empty}>Absen belum aktif (menunggu migrasi {ATTENDANCE_MIGRATION}), jadi kehadiran belum tercatat.</p>
              <ul className={styles.plainList}>{person.forums.map(forum => <li key={forum.id}><a href={praWamPath.session(forum.id)}>{forum.title}</a></li>)}</ul>
            </>
            : <ul className={styles.forumChips}>{person.forums.map(forum => <li key={forum.id}>
              <a href={praWamPath.session(forum.id)}><ForumStatus title={forum.title} mark={forum.mark} /></a>
            </li>)}</ul>}
        {person.upcoming > 0 && <p className={styles.note}>{person.upcoming} forum lagi terjadwal.</p>}
      </section>
    </div>
  </>;
}
