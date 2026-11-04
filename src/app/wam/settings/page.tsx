import { BookOpen, ChevronLeft, ChevronRight, Info, LogOut } from "lucide-react";
import { PasswordPanel } from "@/components/pra-wam/PasswordForm";
import { PraWamShell, ScreenHead } from "@/components/pra-wam/PraWamShell";
import { SignOutButton } from "@/components/pra-wam/SignOutButton";
import { ThemeSwitch } from "@/components/pra-wam/ThemeSwitch";
import { praWamPath } from "@/lib/routes";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { readWamTheme } from "@/lib/server/pra-wam/theme";
import own from "@/components/pra-wam/akun.module.css";
import styles from "@/components/pra-wam/pra-wam.module.css";
// A server page: only the version string reaches the browser.
import app from "../../../../package.json";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pengaturan · WAM", robots: { index: false } };

/**
 * Pengaturan, pushed from the gear on Profil: grouped lists as in a phone's settings (Keamanan,
 * Tampilan, Tentang, Akun). Phone: the shell's back bar, no bottom bar. Desktop: the app's top bar
 * with Profil marked, and a back link above the title.
 */
export default async function SettingsPage() {
  const member = await requireMemberPage(praWamPath.settings);
  const theme = await readWamTheme();
  return <PraWamShell member={member} current="akun" back={{ href: praWamPath.account, title: "Pengaturan" }}>
    <div className={own.settings}>
      <div className={own.deskOnly}>
        <a className={own.backLink} href={praWamPath.account}><ChevronLeft aria-hidden />Profil</a>
        <ScreenHead title="Pengaturan" lead="Password, tampilan, dan akunmu" />
      </div>

      <section aria-labelledby="keamanan">
        <h2 id="keamanan" className={own.groupTitle}>Keamanan</h2>
        <PasswordPanel firstTime={member.mustChangePassword} />
      </section>

      <section aria-labelledby="tampilan">
        <h2 id="tampilan" className={own.groupTitle}>Tampilan</h2>
        <ThemeSwitch initial={theme} />
      </section>

      <section aria-labelledby="tentang">
        <h2 id="tentang" className={own.groupTitle}>Tentang</h2>
        <div className={own.group}>
          <a className={`${own.rowButton} ${own.rowLink}`} href={praWamPath.aboutFromSettings}>
            <span className={styles.tile} aria-hidden><BookOpen /></span>
            <span className={own.rowText}><strong>Apa itu WAM?</strong><small>Penjelasan singkat tentang WAM</small></span>
            <ChevronRight className={own.chevron} aria-hidden />
          </a>
          <div className={own.aboutApp}>
            <span className={`${styles.tile} ${styles.tileBrass}`} aria-hidden><Info /></span>
            <span className={own.rowText}>
              <strong>Tentang aplikasi</strong>
              <small>WAM, bagian dari Journey by Werkudara</small>
            </span>
            {app.version && <span className={own.version}>Versi {app.version}</span>}
          </div>
        </div>
        <p className={own.groupNote}><Info aria-hidden />Butuh bantuan? Hubungi admin WAM.</p>
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
  </PraWamShell>;
}
