import { Bell, BookOpen, ChevronRight, Download, Info, Lock, LogOut, Palette, Plug } from "lucide-react";
import { InstallGuide, InstallSummary } from "@/components/pra-wam/InstallGuide";
import { McpCard } from "@/components/pra-wam/McpCard";
import { PasswordSettings } from "@/components/pra-wam/PasswordForm";
import { PushSwitch } from "@/components/pra-wam/PushSwitch";
import { PushSummary, SettingsItem, ThemeSummary } from "@/components/pra-wam/SettingsItem";
import { SignOutButton } from "@/components/pra-wam/SignOutButton";
import { ThemeSwitch } from "@/components/pra-wam/ThemeSwitch";
import { mayUseMcp, toolTitle } from "@/lib/pra-wam/mcp";
import { praWamPath } from "@/lib/routes";
import { hodStanding } from "@/lib/server/pra-wam/hod";
import { mcpAccessOf, myMcpCalls } from "@/lib/server/pra-wam/mcp";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { readWamTheme } from "@/lib/server/pra-wam/theme";
import own from "@/components/pra-wam/akun.module.css";
import styles from "@/components/pra-wam/pra-wam.module.css";
// A server page: only the version string reaches the browser.
import app from "../../../../../package.json";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pengaturan · WAM", robots: { index: false } };

/**
 * Pengaturan (revised 9 Nov 2026) as a menu: its own title (no back arrow and no profile card;
 * the bottom bar leads to Profil), then short rows in groups: Aplikasi (Pasang WAM, Notifikasi,
 * Tampilan), Akun, Khusus BOD (Akses MCP, a BOD only; Admin WAM manages access), Bantuan, and
 * Keluar. Each row says what is set now and opens its details in a sheet from the bottom on a
 * phone, a panel from the right on a desktop (SettingsItem). The "password awal" reminder lives
 * only inside Ganti password; Meeting HOD notifications show for a HOD only.
 */
export default async function SettingsPage() {
  const member = await requireMemberPage(praWamPath.settings);
  // Akses MCP: only a BOD sees it here (Admin WAM manages access in the admin console).
  const showMcp = mayUseMcp(member);
  const [theme, { isHod: hod }, mcp] = await Promise.all([
    readWamTheme(),
    hodStanding(member).catch(() => ({ isHod: false })),
    showMcp ? mcpAccessOf(member.id).catch(() => null) : Promise.resolve(null),
  ]);
  const mcpCalls = mcp?.granted ? (await myMcpCalls(member.id).catch(() => [])).map(call => ({ title: toolTitle(call.tool), ok: call.ok, createdAt: call.createdAt })) : [];
  return <div className={own.settings}>
    <header className={`${styles.head} ${own.settingsHead}`}><div><h1>Pengaturan</h1></div></header>

    <section aria-labelledby="aplikasi">
      <h2 id="aplikasi" className={own.groupTitle}>Aplikasi</h2>
      <div className={`${own.group} ${own.menu}`}>
        <SettingsItem id="pasang" icon={<Download />} title="Pasang WAM" summary={<InstallSummary />} wide
          sheetTitle="Pasang WAM di perangkatmu" sheetSubtitle="Supaya WAM terbuka seperti aplikasi dan notifikasinya muncul">
          <InstallGuide />
        </SettingsItem>
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

    {showMcp && <section aria-labelledby="khusus">
      <h2 id="khusus" className={own.groupTitle}>Khusus BOD</h2>
      <div className={`${own.group} ${own.menu}`}>
        <SettingsItem id="mcp" icon={<Plug />} title="Akses MCP" wide
          summary={mcp?.granted ? "Tanya data WAM lewat Claude atau ChatGPT" : "Belum diberikan"} sheetSubtitle="Asisten AI, hanya baca">
          {mcp?.granted
            ? <McpCard hasKey={mcp.hasKey} lastUsedAt={mcp.lastUsedAt} calls={mcpCalls} />
            : <p className={own.groupNote}><Info aria-hidden />Akses MCP belum diberikan. Minta ke admin WAM.</p>}
        </SettingsItem>
      </div>
    </section>}

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
