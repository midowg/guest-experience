"use client";

import { Users } from "lucide-react";
import { Card, ConsoleButtonLink } from "@/components/console";
import { Notice } from "@/components/ui";
import { wamAdminPath } from "@/lib/routes";
import css from "./main-wam-settings.module.css";

/**
 * Admin WAM → Main WAM → Pengaturan: Mode demo (every screen with sample data, to try the app in a phone
 * before the event) and the note on who is panitia. Mode demo is a flag in the settings row
 * (module_config.demo): it changes only what the app draws, never what is saved (docs/main-wam/KONTRAK.md §12).
 */
export function DemoCard({ id, enabled, locked, busy, onSave }: { id: string; enabled: boolean; locked: boolean; busy: boolean; onSave: (next: boolean) => void }) {
  return <Card title="Mode demo" id={id}>
    <ul className={css.rows}>
      <li className={css.row}>
        <span className={css.rowText}>
          <span id={`${id}-label`}>Mode demo (data contoh)</span>
          <span id={`${id}-hint`}>Menampilkan semua layar dengan data contoh untuk dicoba. Data nyata tidak diubah. Matikan sebelum acara.</span>
        </span>
        <label className={css.switch}>
          <input type="checkbox" role="switch" checked={enabled} disabled={locked || busy} aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} onChange={change => onSave(change.target.checked)} />
          <span className={css.track} aria-hidden />
        </label>
      </li>
    </ul>
    <p className={css.note}>
      Saat menyala: semua modul tampil menyala (pilihan di kartu Modul tidak berubah), dan data contoh mengisi layar yang datanya masih kosong.
      Penguji (admin, panitia, daftar penguji) mendapat pilihan Lihat sebagai di Saya: Peserta, Panitia, atau BOD. Aksi saat melihat sebagai peran lain, atau selama rundown masih kosong, tidak disimpan.
    </p>
    {enabled && <Notice tone="warning">Mode demo menyala. Peserta dan penguji melihat banner Mode demo, dan layar yang datanya kosong memakai data contoh. Matikan sebelum acara.</Notice>}
  </Card>;
}

export function CommitteeCard({ id }: { id: string }) {
  return <Card title="Siapa panitia?" id={id}>
    <p className={css.note}>Atur di Admin WAM → Akun (centang Panitia). Penguji tambahan dipilih di sini.</p>
    <div className={css.actions}>
      <ConsoleButtonLink href={wamAdminPath.accounts} icon={<Users size={16} aria-hidden />}>Buka Akun</ConsoleButtonLink>
    </div>
  </Card>;
}
