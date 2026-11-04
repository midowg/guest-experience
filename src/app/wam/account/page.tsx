import { Info, LogOut } from "lucide-react";
import { PasswordPanel } from "@/components/pra-wam/PasswordForm";
import { PraWamShell, ScreenHead } from "@/components/pra-wam/PraWamShell";
import { SignOutButton } from "@/components/pra-wam/SignOutButton";
import { ThemeSwitch } from "@/components/pra-wam/ThemeSwitch";
import { praWamRoles, roleLabels } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { createPrivilegedClient } from "@/lib/server/supabase/admin";
import { readWamTheme } from "@/lib/server/pra-wam/theme";
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
 * Profil dan pengaturan (Penpot "P4"), as a native settings screen. Name, unit and email come from
 * Data karyawan and are changed by the admin; the person changes their password, the look of the
 * app, and signs out here.
 */
export default async function AccountPage() {
  const member = await requireMemberPage(praWamPath.account);
  const [units, { data: person }, theme] = await Promise.all([
    unitsOf(member.id),
    createPrivilegedClient().from("employees").select("email").eq("id", member.id).maybeSingle(),
    readWamTheme(),
  ]);
  const initials = member.name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join("");
  const roles = praWamRoles.filter(role => member.roles.includes(role));
  return <PraWamShell member={member} current="akun">
    <div className={own.profile}>
      <ScreenHead title="Profil dan pengaturan" lead="Satu akun untuk Pra WAM dan WAM 2027" />
      <div className={own.profileGrid}>
        <div className={own.profileCol}>
          <section className={own.group} aria-labelledby="profil-nama">
            <div className={own.hero}>
              <span className={own.avatar} aria-hidden>{initials || "?"}</span>
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

        <div className={own.profileCol}>
          <section aria-labelledby="keamanan">
            <h2 id="keamanan" className={own.groupTitle}>Keamanan</h2>
            <PasswordPanel firstTime={member.mustChangePassword} />
          </section>

          <section aria-labelledby="tampilan">
            <h2 id="tampilan" className={own.groupTitle}>Tampilan</h2>
            <ThemeSwitch initial={theme} />
          </section>

          <section aria-labelledby="akun">
            <h2 id="akun" className={own.groupTitle}>Akun</h2>
            <div className={`${own.group} ${own.signOutRow}`}>
              <LogOut aria-hidden />
              <SignOutButton className={own.signOutButton} />
            </div>
          </section>

          <p className={own.footer}>Journey by Werkudara</p>
        </div>
      </div>
    </div>
  </PraWamShell>;
}
