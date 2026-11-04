import { Info, KeyRound, Settings } from "lucide-react";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { ProfilePhoto } from "@/components/pra-wam/ProfilePhoto";
import { praWamRoles, roleLabels } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { createPrivilegedClient } from "@/lib/server/supabase/admin";
import { unitsOf } from "@/lib/server/pra-wam/units";
import own from "@/components/pra-wam/akun.module.css";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profil · WAM", robots: { index: false } };

/** One line of Data diri: read only, the label on the left and the value on the right. */
function Item({ label, value, stack }: { label: string; value: string; stack?: boolean }) {
  return <div className={`${own.item} ${stack ? own.itemStack : ""}`}>
    <dt>{label}</dt>
    <dd>{value || <span className={own.unset}>Belum diisi</span>}</dd>
  </div>;
}

/**
 * Profil (Penpot "P4"): who the person is, read only. Name, unit and email come from Data
 * karyawan and are changed by the admin. Password, the look of the app and signing out live in
 * Pengaturan, behind the gear in the header row.
 */
export default async function AccountPage() {
  const member = await requireMemberPage(praWamPath.account);
  const [units, { data: person }] = await Promise.all([
    unitsOf(member.id),
    createPrivilegedClient().from("employees").select("email").eq("id", member.id).maybeSingle(),
  ]);
  const roles = praWamRoles.filter(role => member.roles.includes(role));
  return <PraWamShell member={member} current="akun">
    <div className={own.profile}>
      <header className={`${styles.head} ${own.headRow}`}>
        <div><h1>Profil</h1><p>Satu akun untuk Pra WAM dan WAM 2027</p></div>
        <a className={own.gear} href={praWamPath.settings} aria-label="Pengaturan" title="Pengaturan"><Settings aria-hidden /></a>
      </header>

      {member.mustChangePassword && <section className={own.warnCard} aria-labelledby="password-awal">
        <span className={`${styles.tile} ${styles.tileBrass}`} aria-hidden><KeyRound /></span>
        <div className={own.warnText}>
          <strong id="password-awal">Kamu masih memakai password awal</strong>
          <small>Ganti dengan password milikmu supaya akunmu aman.</small>
        </div>
        <a className={`button button--secondary ${own.warnButton}`} href={`${praWamPath.settings}#password`}>Ganti password</a>
      </section>}

      <div className={own.profileGrid}>
        <section className={own.group} aria-labelledby="profil-nama">
          <div className={own.hero}>
            <div className={own.heroPhoto}><ProfilePhoto name={member.name} photo={member.photo} editable /></div>
            <h2 id="profil-nama" className={own.heroName}>{member.name}</h2>
            <p className={own.heroMeta}>{[member.position, member.department].filter(Boolean).join(" · ") || "Jabatan belum diatur"}</p>
            <ul className={own.heroPills} aria-label="Peran">
              <li className={styles.pill}>Peserta</li>
              {roles.map(role => <li key={role} className={`${styles.pill} ${styles.pillBrass}`}>{roleLabels[role]}</li>)}
            </ul>
          </div>
          {units.length ? <ul className={own.units} aria-label="Unit">
            {units.map(unit => <li key={unit.id} className={own.unit}>
              <span className={own.unitText}>
                <strong>{unit.name}{unit.kind === "bu" ? " (BU)" : ""}</strong>
                {unit.jobTitle && <small>{unit.jobTitle}</small>}
              </span>
              {unit.isLead && <span className={`${styles.pill} ${styles.pillBrass}`}>Lead</span>}
            </li>)}
          </ul> : <p className={own.unitEmpty}>Unit belum diatur.</p>}
        </section>

        <section aria-labelledby="data-diri">
          <h2 id="data-diri" className={own.groupTitle}>Data diri</h2>
          <dl className={`${own.group} ${own.list}`}>
            <Item label="Nama lengkap" value={member.name} />
            <Item label="Nama panggilan" value={member.nickname} />
            <Item label="Departemen" value={member.department} />
            <Item label="Jabatan" value={member.position} />
            <Item label="Email masuk" value={person?.email ?? ""} stack />
          </dl>
          <p className={own.groupNote}><Info aria-hidden />Data ini mengikuti Data karyawan dari HR. Email masuk diatur oleh super admin.</p>
        </section>
      </div>

      <p className={own.footer}>Journey by Werkudara</p>
    </div>
  </PraWamShell>;
}
