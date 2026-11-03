import { PasswordForm } from "@/components/pra-wam/PasswordForm";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { Notice } from "@/components/ui";
import { roleSummary } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Akun · Pra WAM", robots: { index: false } };

/** Who the person is in Pra WAM, and their password. Name, unit and position come from Data karyawan. */
export default async function AccountPage() {
  const member = await requireMemberPage(praWamPath.account);
  return <PraWamShell member={member} current="akun">
    <div className={styles.head}><div><p className={styles.kicker}>Profil dan pengaturan</p><h1>Akun</h1></div></div>
    <section className={styles.card} aria-labelledby="profil">
      <h2 id="profil">Profil</h2>
      <dl className={styles.profile}>
        <dt>Nama</dt><dd>{member.name}</dd>
        <dt>Panggilan</dt><dd>{member.nickname || "—"}</dd>
        <dt>Departemen</dt><dd>{member.department || "—"}</dd>
        <dt>Jabatan</dt><dd>{member.position || "—"}</dd>
        <dt>Peran</dt><dd>{roleSummary(member)}</dd>
      </dl>
      <p className={styles.hint}>Ada yang keliru? Hubungi admin Pra WAM untuk memperbaikinya di Data karyawan.</p>
    </section>
    <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="password">
      <h2 id="password">Password</h2>
      {member.mustChangePassword && <Notice tone="warning">Kamu masih memakai password awal. Sebaiknya ganti sekarang.</Notice>}
      <PasswordForm firstTime={member.mustChangePassword} />
    </section>
  </PraWamShell>;
}
