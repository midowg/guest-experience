"use client";

import { useState } from "react";
import { Camera, FileText, Images, KeyRound, Leaf, LifeBuoy, LogOut, Settings, Trophy, TrainFront } from "lucide-react";
import { mainWamPath, praWamApi } from "@/lib/routes";
import { ScreenContent, ScreenSection, ShellActions } from "@/components/main-wam/shell";
import { Avatar, ConfirmDialog, EyebrowLabel, IconButton, SrOnly } from "@/components/main-wam/ui";
import { DemoSwitch } from "@/components/main-wam/demo/DemoSwitch";
import type { DemoRole } from "@/lib/main-wam/types";
import { useT } from "@/components/main-wam/i18n";
import { failText, mwRequest } from "../request";
import { ProfileSheet } from "./ProfileSheet";
import { Row, RowGroup } from "./Rows";
import css2 from "./saya.module.css";

export type SayaProps = {
  /** Nama panggilan: the avatar's initial (as everywhere else in the app). */
  name: string;
  /** Full name on the card (Profil is the person's own). */
  fullName: string;
  /** "jabatan - nama departemen" ("Creative Designer - Kreatif"); the department alone when there is no job title. */
  line: string;
  photo: string | null;
  /** "Kamar 208" · "3 orang · bersama Sari, Dewi"; null before HR publishes the rooms. */
  room: { title: string; sub: string } | null;
  /** The tokoh of the person's questionnaire card ("Marie Curie", persona "Pemikir"): its name shows under the name on the profile card; null/absent while there is no card: no line then. */
  figure?: { name: string; persona: string; colors: [string, string] } | null;
  /** Module Misi is on for this person and the points are read: the "Misi dan poin" row with its total. Null/absent: no row. */
  points?: number | null;
  /** Module Mozaik is on: its row ("Mozaik 2026") under Info acara, opening the Mozaik page. */
  mosaic?: boolean;
  /** Module Jejak karbon is on: its row under Info acara. */
  carbon?: boolean;
  /** Mode demo, for a penguji: the role drawn now; shows "Lihat sebagai" (Peserta, Panitia, BOD). Null/absent = no switch. */
  demo?: DemoRole | null;
  /** Previews: a sheet or the dialog open. */
  open?: "foto" | "keluar" | null;
};

/**
 * Saya (P05, P05B for BOD; panitia use P05 too): the profile card (tap: Foto profil sheet) with the
 * room, Info acara (Perjalanan, Panduan, Mozaik 2026 and Jejak karbon while their modules are on), then Bantuan (a page) and
 * Keluar (a dialog). Pengaturan is the gear at the top right of the bar, only there (final prototype). Akses MCP (BOD with
 * access) is at the foot of Pengaturan.
 */
export function SayaScreen({ name, fullName, line, photo, room, carbon = false, mosaic = false, figure = null, points = null, demo = null, open = null }: SayaProps) {
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
    <ShellActions>
      <IconButton variant="tonal" icon={Settings} label={t("screen.settings")} href={mainWamPath.settings} />
    </ShellActions>
    <div className={css2.stack}>
      <button type="button" className={css2.profile} onClick={() => setSheet("foto")} aria-haspopup="dialog">
        <Avatar name={name} photo={photo} size={64} />
        <span className={css2.profileText}>
          <span className={css2.profileName}>{name}</span>
          {figure && <span className={css2.profileFigure}>
            <span className={css2.figureDot} style={{ backgroundImage: `linear-gradient(160deg, ${figure.colors[0]}, ${figure.colors[1]})` }} aria-hidden />
            <SrOnly>{t("peserta.me.figure")}: </SrOnly>{figure.name}
          </span>}
          {line && <span className={css2.profileLine}>{line}</span>}
        </span>
        <Camera aria-hidden className={css2.profileCam} />
        {fullName !== name && <SrOnly>{`, ${fullName}`}</SrOnly>}
        <SrOnly>{`, ${t("peserta.me.changePhoto")}`}</SrOnly>
      </button>
      <RowGroup>
        {room
          ? <Row icon={<KeyRound />} title={room.title} sub={room.sub} href={mainWamPath.room} />
          : <Row icon={<KeyRound />} title={t("screen.room")} sub={t("peserta.me.roomWaiting")} href={mainWamPath.room} />}
        <Row icon={<TrainFront />} title={t("screen.travel")} href={mainWamPath.travel()} />
      </RowGroup>
      <EyebrowLabel as="h2">{t("peserta.me.eventInfo")}</EyebrowLabel>
      <RowGroup label={t("peserta.me.eventInfo")}>
        <Row icon={<FileText />} title={t("screen.guides")} href={mainWamPath.guides} />
        {mosaic && <Row icon={<Images />} title={t("peserta.me.mosaic")} href={mainWamPath.mosaic()} />}
        {points !== null && <Row icon={<Trophy />} title={t("peserta.me.missions")} value={t("peserta.me.points", { n: points })} href={mainWamPath.missions} />}
        {carbon && <Row icon={<Leaf />} title={t("peserta.me.carbon")} href={mainWamPath.carbon("saya")} />}
      </RowGroup>
      <RowGroup>
        <Row icon={<LifeBuoy />} title={t("peserta.me.help")} href={mainWamPath.help} />
        <Row icon={<LogOut />} title={t("peserta.me.signOut")} danger chevron={false} onClick={() => setSheet("keluar")} aria-haspopup="dialog" />
      </RowGroup>
    </div>

    {demo && <ScreenSection><DemoSwitch role={demo} /></ScreenSection>}

    <ProfileSheet open={sheet === "foto"} onClose={() => setSheet(null)} name={name} fullName={fullName} line={line} photo={photo} />
    <ConfirmDialog open={sheet === "keluar"} onCancel={() => { setSheet(null); setError(null); }} onConfirm={signOut} tone="danger" icon={<LogOut />}
      title={t("peserta.me.signOutTitle")} body={error ?? undefined} confirmLabel={t("peserta.me.signOut")} busy={leaving} busyLabel={t("peserta.me.signingOut")} />
  </ScreenContent>;
}
