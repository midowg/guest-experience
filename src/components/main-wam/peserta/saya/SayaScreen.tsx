"use client";

import { useState } from "react";
import { Camera, ExternalLink, FileText, KeyRound, LifeBuoy, LogOut, Settings, TrainFront } from "lucide-react";
import { mainWamPath, praWamApi, praWamPath } from "@/lib/routes";
import { ScreenContent, ScreenSection } from "@/components/main-wam/shell";
import { Avatar, ConfirmDialog, List, ListRow } from "@/components/main-wam/ui";
import { useT } from "@/components/main-wam/i18n";
import { failText, mwRequest } from "../request";
import { ProfileSheet } from "./ProfileSheet";
import css from "../peserta.module.css";

export type SayaProps = {
  /** Nama panggilan: the avatar's initial (as everywhere else in the app). */
  name: string;
  /** Full name on the card (Profil is the person's own). */
  fullName: string;
  /** "CoE · Kelompok 4 · Arjuno". */
  line: string;
  photo: string | null;
  /** "Kamar 208" · "3 orang · bersama Sari, Dewi"; null before HR publishes the rooms. */
  room: { title: string; sub: string } | null;
  /** BOD with Akses MCP (Pra WAM's Pengaturan holds McpCard). */
  mcp: boolean;
  /** Previews: a sheet or the dialog open. */
  open?: "foto" | "keluar" | null;
};

/**
 * Saya (P05, P05B for BOD; panitia use P05 too): the profile card (tap: Foto profil sheet) with the
 * room, Info acara (Perjalanan, Panduan), then Pengaturan, Bantuan (a page) and Keluar (a
 * dialog). BOD with access: "Akses MCP" small at the very bottom.
 */
export function SayaScreen({ name, fullName, line, photo, room, mcp, open = null }: SayaProps) {
  const t = useT();
  const [sheet, setSheet] = useState<"foto" | "keluar" | null>(open);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setLeaving(true); setError(null);
    try {
      await mwRequest(praWamApi.logout, { method: "POST" });
      // A full load: nothing of this person stays in the app's memory.
      window.location.assign(mainWamPath.login());
    } catch (problem) { setError(failText(problem)); setLeaving(false); }
  }

  return <ScreenContent>
    <List>
      <ListRow leading={<Avatar name={name} photo={photo} size={48} />} title={fullName} sub={line || undefined}
        trailing={<Camera aria-hidden className={css.trailIcon} />} chevron={false} onClick={() => setSheet("foto")}
        aria-label={t("peserta.me.changePhoto", { name: fullName })} aria-haspopup="dialog" />
      {room
        ? <ListRow icon={<KeyRound />} title={room.title} sub={room.sub} href={mainWamPath.groupRoom} aria-label={t("peserta.me.roomLabel", { title: room.title, sub: room.sub })} />
        : <ListRow icon={<KeyRound />} title={t("screen.groupRoom")} sub={t("peserta.me.roomWaiting")} href={mainWamPath.groupRoom} />}
    </List>
    <ScreenSection>
      <h2 className={css.groupHead}>{t("peserta.me.eventInfo")}</h2>
      <List>
        <ListRow icon={<TrainFront />} title={t("screen.travel")} href={mainWamPath.travel()} />
        <ListRow icon={<FileText />} title={t("screen.guides")} href={mainWamPath.guides} />
      </List>
    </ScreenSection>
    <List>
      <ListRow icon={<Settings />} title={t("screen.settings")} href={mainWamPath.settings} />
      <ListRow icon={<LifeBuoy />} title={t("peserta.me.help")} href={mainWamPath.help} />
      <ListRow icon={<LogOut />} title={<span className={css.danger}>{t("peserta.me.signOut")}</span>} chevron={false} onClick={() => setSheet("keluar")} aria-haspopup="dialog" />
    </List>
    {mcp && <a className={css.footLink} href={`${praWamPath.settings}#mcp`}>{t("peserta.me.mcp")}<ExternalLink aria-hidden /></a>}

    <ProfileSheet open={sheet === "foto"} onClose={() => setSheet(null)} name={name} fullName={fullName} line={line} photo={photo} />
    <ConfirmDialog open={sheet === "keluar"} onCancel={() => { setSheet(null); setError(null); }} onConfirm={signOut} tone="danger" icon={<LogOut />}
      title={t("peserta.me.signOutTitle")} body={error ?? undefined} confirmLabel={t("peserta.me.signOut")} busy={leaving} busyLabel={t("peserta.me.signingOut")} />
  </ScreenContent>;
}
