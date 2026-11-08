import { BookOpen, ChevronRight, Info, LogOut, Plug } from "lucide-react";
import { Avatar } from "@/components/pra-wam/Avatar";
import { McpCard } from "@/components/pra-wam/McpCard";
import { PasswordPanel } from "@/components/pra-wam/PasswordForm";
import { PushSwitch } from "@/components/pra-wam/PushSwitch";
import { SignOutButton } from "@/components/pra-wam/SignOutButton";
import { ThemeSwitch } from "@/components/pra-wam/ThemeSwitch";
import { mayUseMcp, toolTitle } from "@/lib/pra-wam/mcp";
import { praWamRoles, roleLabels } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
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
 * Pengaturan (revised 8 Nov 2026, laid out as a phone's settings): the person on top (to Profil),
 * then Notifikasi, Tampilan, Keamanan, Asisten AI (BOD and Admin WAM only: Akses MCP), Tentang and
 * Keluar, each a group of rows. The shell's back bar ("‹ Pengaturan") is the only header.
 */
export default async function SettingsPage() {
  const member = await requireMemberPage(praWamPath.settings);
  const theme = await readWamTheme();
  const showMcp = mayUseMcp(member);
  // Akses MCP: only BOD and Admin WAM, and the link only once an admin gave access.
  const mcp = showMcp ? await mcpAccessOf(member.id).catch(() => null) : null;
  const mcpCalls = mcp?.granted ? (await myMcpCalls(member.id).catch(() => [])).map(call => ({ title: toolTitle(call.tool), ok: call.ok, createdAt: call.createdAt })) : [];
  const roles = praWamRoles.filter(role => member.roles.includes(role)).map(role => roleLabels[role]);
  return <>
    <div className={own.settings}>
      <a className={`${own.group} ${own.settingsMe}`} href={praWamPath.account}>
        <Avatar name={member.name} photo={member.photo ?? null} size="md" decorative />
        <span className={own.rowText}>
          <strong>{member.name}</strong>
          <small>{[member.position || member.department, ...roles].filter(Boolean).join(" · ") || "Peserta"}</small>
        </span>
        <ChevronRight className={own.chevron} aria-hidden />
      </a>

      <section aria-labelledby="notifikasi">
        <h2 id="notifikasi" className={own.groupTitle}>Notifikasi</h2>
        <PushSwitch />
      </section>

      <section aria-labelledby="tampilan">
        <h2 id="tampilan" className={own.groupTitle}>Tampilan</h2>
        <ThemeSwitch initial={theme} />
      </section>

      <section aria-labelledby="keamanan">
        <h2 id="keamanan" className={own.groupTitle}>Keamanan</h2>
        <PasswordPanel firstTime={member.mustChangePassword} />
      </section>

      {showMcp && <section aria-labelledby="asisten">
        <h2 id="asisten" className={own.groupTitle}>Asisten AI · khusus BOD dan admin</h2>
        {mcp?.granted
          ? <McpCard hasKey={mcp.hasKey} lastUsedAt={mcp.lastUsedAt} calls={mcpCalls} />
          : <div className={own.group}>
            <div className={own.aboutApp}>
              <span className={styles.tile} aria-hidden><Plug /></span>
              <span className={own.rowText}><strong>Akses MCP</strong><small>Tanya data WAM lewat Claude atau ChatGPT. Belum diberikan; minta ke admin WAM (Admin WAM → Akses MCP).</small></span>
            </div>
          </div>}
      </section>}

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

      <div className={`${own.group} ${own.signOutRow}`}>
        <LogOut aria-hidden />
        <SignOutButton className={own.signOutButton} />
      </div>

      <p className={own.footer}>Journey by Werkudara</p>
    </div>
  </>;
}
