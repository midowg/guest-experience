import { Bell, BookOpen, ChevronRight, Info, Lock, LogOut, Palette } from "lucide-react";
import { PasswordSettings } from "@/components/pra-wam/PasswordForm";
import { PushSwitch } from "@/components/pra-wam/PushSwitch";
import { PushSummary, SettingsItem, ThemeSummary } from "@/components/pra-wam/SettingsItem";
import { SignOutButton } from "@/components/pra-wam/SignOutButton";
import { ThemeSwitch } from "@/components/pra-wam/ThemeSwitch";
import { praWamPath } from "@/lib/routes";
import { hodStanding } from "@/lib/server/pra-wam/hod";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { readWamTheme } from "@/lib/server/pra-wam/theme";
import own from "@/components/pra-wam/akun.module.css";
import styles from "@/components/pra-wam/pra-wam.module.css";
// A server page: only the version string reaches the browser.
import app from "../../../../../package.json";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pengaturan · WAM", robots: { index: false } };

/**
 * Pengaturan (revised 9 Nov 2026) as a menu: short rows in groups (Aplikasi, Akun, Bantuan) and
 * Keluar; no profile card (Back already leads to Profil) and no Akses MCP (taken out of the
 * peserta app). Each row says what is set now and opens its details in a sheet from the bottom on
 * a phone, a panel from the right on a desktop (SettingsItem). The "password awal" reminder lives
 * only inside Ganti password; Meeting HOD notifications show for a HOD only.
 */
export default async function SettingsPage() {
  const member = await requireMemberPage(praWamPath.settings);
  const [theme, { isHod: hod }] = await Promise.all([readWamTheme(), hodStanding(member).catch(() => ({ isHod: false }))]);
  return <div className={own.settings}>
    <section aria-labelledby="aplikasi">
      <h2 id="aplikasi" className={own.groupTitle}>Aplikasi</h2>
      <div className={`${own.group} ${own.menu}`}>
        <SettingsItem id="notifikasi" icon={<Bell />} title="Notifikasi" summary={<PushSummary />} sheetSubtitle="Pilih kabar yang muncul di HP">
          <PushSwitch hod={hod} />
        </SettingsItem>
        <SettingsItem id="tampilan" icon={<Palette />} title="Tampilan" summary={<ThemeSummary initial={theme} />} sheetSubtitle="Tema WAM di perangkat ini">
          <ThemeSwitch initial={theme} />
        </SettingsItem>
      </div>
    </section>

    <section aria-labelledby="akun">
      <h2 id="akun" className={own.groupTitle}>Akun</h2>
      <div className={`${own.group} ${own.menu}`}>
        <SettingsItem id="password" icon={<Lock />} title="Ganti password" summary="Ganti password akunmu">
          <PasswordSettings firstTime={member.mustChangePassword} />
        </SettingsItem>
      </div>
    </section>

    <section aria-labelledby="bantuan">
      <h2 id="bantuan" className={own.groupTitle}>Bantuan</h2>
      <div className={`${own.group} ${own.menu}`}>
        <a className={`${own.rowButton} ${own.rowLink}`} href={praWamPath.aboutFromSettings}>
          <span className={styles.tile} aria-hidden><BookOpen /></span>
          <span className={own.rowText}><strong>Apa itu WAM?</strong><small>Penjelasan singkat tentang WAM</small></span>
          <ChevronRight className={own.chevron} aria-hidden />
        </a>
        <SettingsItem id="tentang" icon={<Info />} title="Tentang aplikasi" summary={app.version ? `Versi ${app.version}` : "WAM"}>
          <dl className={`${own.group} ${own.list}`}>
            <div className={own.item}><dt>Aplikasi</dt><dd>WAM</dd></div>
            <div className={own.item}><dt>Bagian dari</dt><dd>Journey by Werkudara</dd></div>
            {app.version && <div className={own.item}><dt>Versi</dt><dd>{app.version}</dd></div>}
          </dl>
          <p className={own.groupNote}><Info aria-hidden />Butuh bantuan? Hubungi admin WAM.</p>
        </SettingsItem>
      </div>
    </section>

    <div className={`${own.group} ${own.signOutRow}`}>
      <LogOut aria-hidden />
      <SignOutButton className={own.signOutButton} />
    </div>

    <p className={own.footer}>Journey by Werkudara</p>
  </div>;
}
