import { ChevronRight, Info, Lock, Users } from "lucide-react";
import { PasswordForm } from "@/components/pra-wam/PasswordForm";
import { PraWamShell, ScreenHead } from "@/components/pra-wam/PraWamShell";
import { Notice } from "@/components/ui";
import { roleSummary } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { createPrivilegedClient } from "@/lib/server/supabase/admin";
import { unitsOf } from "@/lib/server/pra-wam/units";
import own from "@/components/pra-wam/akun.module.css";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profil · WAM", robots: { index: false } };

/** A field the person cannot change here, with who owns it ("Master" = Data karyawan). */
function Locked({ label, owner, value }: { label: string; owner: string; value: string }) {
  return <div>
    <div className={styles.fieldHead}>{label}<span className={`${styles.pill} ${styles.pillLine}`}>{owner}</span></div>
    <div className={styles.locked}><span>{value || "—"}</span><Lock aria-hidden /></div>
  </div>;
}

/**
 * Profil dan pengaturan (Penpot "P4"): name, unit and email come from Data karyawan and are
 * changed by the admin; the person changes only their password here.
 */
export default async function AccountPage() {
  const member = await requireMemberPage(praWamPath.account);
  const [units, { data: person }] = await Promise.all([
    unitsOf(member.id),
    createPrivilegedClient().from("employees").select("email").eq("id", member.id).maybeSingle(),
  ]);
  return <PraWamShell member={member} current="akun">
    <div className={styles.narrow}>
      <ScreenHead title="Profil dan pengaturan" lead="Satu akun untuk Pra WAM dan WAM 2027" />
      <Notice tone="info"><span style={{ display: "inline-flex", gap: 8 }}><Info size={16} aria-hidden style={{ flex: "none", marginTop: 2 }} />Nama dan departemen mengikuti data karyawan. Email diatur super admin.</span></Notice>
      <div className={own.fields} style={{ marginTop: 16 }}>
        <Locked label="Nama lengkap" owner="Master" value={member.name} />
        <Locked label="Departemen" owner="Master" value={member.department} />
        <Locked label="Jabatan" owner="Master" value={member.position} />
        <Locked label="Nama panggilan" owner="Master" value={member.nickname} />
        <Locked label="Email masuk" owner="Super admin" value={person?.email ?? ""} />
        <div className={styles.card}>
          <div className={styles.row}>
            <span className={styles.tile}><Users aria-hidden /></span>
            <div>
              <strong>{roleSummary(member)}</strong>
              {units.length > 0 ? units.map(unit => <div key={unit.id} className={styles.meta}>{unit.isLead ? "Lead · " : ""}{unit.name}{unit.kind === "bu" ? " (BU)" : ""}{unit.jobTitle ? `, ${unit.jobTitle}` : ""}</div>)
                : <div className={styles.meta}>Unit belum diatur.</div>}
            </div>
          </div>
        </div>
        <details id="password" open={member.mustChangePassword}>
          <summary className={own.passwordRow}>
            <span className={styles.tile}><Lock aria-hidden /></span>
            <span><strong>Ganti password</strong><small>{member.mustChangePassword ? "Ganti password awal dengan milik Anda" : "Ganti password Anda"}</small></span>
            <ChevronRight size={20} aria-hidden />
          </summary>
          <div className={styles.card} style={{ marginTop: 12 }}>
            {member.mustChangePassword && <Notice tone="warning">Kamu masih memakai password awal. Sebaiknya ganti sekarang.</Notice>}
            <PasswordForm firstTime={member.mustChangePassword} />
          </div>
        </details>
      </div>
    </div>
  </PraWamShell>;
}
