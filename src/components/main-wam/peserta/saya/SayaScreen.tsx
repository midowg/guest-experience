"use client";

import { useState } from "react";
import { CalendarDays, Camera, ExternalLink, FileText, House, Images, KeyRound, LifeBuoy, LogOut, MessageCircle, Settings, TrainFront } from "lucide-react";
import type { Contact } from "@/lib/main-wam/peserta/contact";
import { mainWamPath, praWamApi, praWamPath } from "@/lib/routes";
import { ScreenContent, ScreenSection } from "@/components/main-wam/shell";
import { Avatar, Button, ConfirmDialog, IconBox, List, ListRow, Sheet } from "@/components/main-wam/ui";
import { ContactSheet } from "../ContactSheet";
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
  /** Bantuan's panitia contact. */
  help: Contact | null;
  /** Previews: a sheet or the dialog open. */
  open?: "foto" | "bantuan" | "keluar" | null;
};

/**
 * Saya (P05, P05B for BOD; panitia use P05 too): the profile card (tap: Foto profil sheet) with the
 * room, Info acara (Perjalanan, Panduan), then Pengaturan, Bantuan (a sheet) and Keluar (a
 * dialog). BOD with access: "Akses MCP" small at the very bottom.
 */
export function SayaScreen({ name, fullName, line, photo, room, mcp, help, open = null }: SayaProps) {
  const [sheet, setSheet] = useState<"foto" | "bantuan" | "keluar" | null>(open);
  // Over Bantuan (it stays open under it, so closing the contact returns there).
  const [calling, setCalling] = useState(false);
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
        aria-label={`${fullName}, ganti foto profil`} aria-haspopup="dialog" />
      {room
        ? <ListRow icon={<KeyRound />} title={room.title} sub={room.sub} href={mainWamPath.groupRoom} aria-label={`${room.title}, ${room.sub}, kelompok dan kamar`} />
        : <ListRow icon={<KeyRound />} title="Kelompok & kamar" sub="Kamar belum diterbitkan" href={mainWamPath.groupRoom} />}
    </List>
    <ScreenSection>
      <h2 className={css.groupHead}>Info acara</h2>
      <List>
        <ListRow icon={<TrainFront />} title="Perjalanan" href={mainWamPath.travel()} />
        <ListRow icon={<FileText />} title="Panduan" href={mainWamPath.guides} />
      </List>
    </ScreenSection>
    <List>
      <ListRow icon={<Settings />} title="Pengaturan" href={mainWamPath.settings} />
      <ListRow icon={<LifeBuoy />} title="Bantuan" onClick={() => setSheet("bantuan")} chevron aria-haspopup="dialog" />
      <ListRow icon={<LogOut />} title={<span className={css.danger}>Keluar</span>} chevron={false} onClick={() => setSheet("keluar")} aria-haspopup="dialog" />
    </List>
    {mcp && <a className={css.footLink} href={`${praWamPath.settings}#mcp`}>Akses MCP<ExternalLink aria-hidden /></a>}

    <ProfileSheet open={sheet === "foto"} onClose={() => setSheet(null)} name={name} fullName={fullName} line={line} photo={photo} />
    <Sheet open={sheet === "bantuan"} onClose={() => setSheet(null)} title="Bantuan">
      <div className={css.sheetStack}>
        <ul className={css.bullets}>
          <li><IconBox icon={<House />} />Beranda: yang perlu dilakukan sekarang</li>
          <li><IconBox icon={<CalendarDays />} />Agenda: jadwal 4 hari</li>
          <li><IconBox icon={<Images />} />Momen: geser foto, ketuk kamera</li>
        </ul>
        {help && <List>
          <ListRow leading={<Avatar name={help.name} photo={help.photo} />} title={help.name} sub={help.role} chevron={false}
            trailing={<Button variant="secondary" size="m" icon={<MessageCircle />} onClick={() => setCalling(true)} aria-label={`Hubungi ${help.name}`}>Hubungi</Button>} />
        </List>}
      </div>
    </Sheet>
    {help && <ContactSheet contact={help} title="Hubungi panitia" open={calling} onClose={() => setCalling(false)} />}
    <ConfirmDialog open={sheet === "keluar"} onCancel={() => { setSheet(null); setError(null); }} onConfirm={signOut} tone="danger" icon={<LogOut />}
      title="Keluar dari WAM?" body={error ?? undefined} confirmLabel="Keluar" busy={leaving} busyLabel="Keluar…" />
  </ScreenContent>;
}
