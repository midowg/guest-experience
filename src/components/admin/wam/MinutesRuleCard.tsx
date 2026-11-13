"use client";

import { useState } from "react";
import { Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { Card, ConsoleButton } from "@/components/console";
import { MINUTES_WINDOW_HOURS, MINUTES_WINDOW_MAX_HOURS, minutesRuleLabels, windowLabel, type MinutesNeedKey, type MinutesRule } from "@/lib/pra-wam/minutes";
import { praWamMinutesRuleApi } from "@/lib/routes";
import css from "./pra-wam-rooms.module.css";

const keys = Object.keys(minutesRuleLabels) as MinutesNeedKey[];
const help: Record<MinutesNeedKey, string> = {
  forum: "Forum yang terbit.",
  rapat: "Rapat yang dibuat panitia, dan meeting dari booking ruang.",
  acara: "Acara (makan bersama, sesi umum).",
  berdua: "Meeting dengan dua orang atau kurang. Mati: tidak wajib, apa pun jenisnya.",
};
/** Quick picks for the window, in hours. */
const PRESETS = [24, 48, 72, 168];

/**
 * Admin WAM → Acara → Notulen (MoM), 12 Nov 2026: which meetings need a MoM once they are over,
 * per session kind and for one-on-ones. A session can still say otherwise in its own form
 * (Wajib / Tidak wajib); this is what "Ikuti aturan" follows.
 *
 * 13 Nov 2026: how long after a meeting its MoM can be written or revised (1 x 24 hours by default),
 * or always open. After it the MoM is read only.
 */
export function MinutesRuleCard({ initial, migrated }: { initial: MinutesRule; migrated: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [rule, setRule] = useState(initial);
  // What is typed in the hours field, kept as text while typing.
  const [hoursText, setHoursText] = useState(String(initial.windowHours ?? MINUTES_WINDOW_HOURS));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const changed = keys.some(key => rule[key] !== saved[key]) || rule.windowHours !== saved.windowHours;
  const typed = Number(hoursText);
  const hoursOk = rule.windowHours === null || (Number.isInteger(typed) && typed >= 1 && typed <= MINUTES_WINDOW_MAX_HOURS);

  const setHours = (text: string) => {
    setHoursText(text); setMessage(null);
    const value = Number(text);
    if (Number.isInteger(value) && value >= 1 && value <= MINUTES_WINDOW_MAX_HOURS) setRule(current => ({ ...current, windowHours: value }));
  };

  async function save() {
    if (!hoursOk) return;
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<MinutesRule>(praWamMinutesRuleApi, { method: "PUT", body: JSON.stringify(rule) });
      if (result.data) { setSaved(result.data); setRule(result.data); setHoursText(String(result.data.windowHours ?? MINUTES_WINDOW_HOURS)); }
      setMessage({ tone: "success", text: result.message });
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(false); }
  }

  const limited = rule.windowHours !== null;
  return <Card title="Notulen (MoM)" id="mom">
    <p className={css.note}>Meeting yang wajib punya MoM setelah selesai. Yang wajib dan belum diisi muncul di Agenda peserta, Jadwal sesi, dan Ringkasan. Tiap sesi bisa dikecualikan di formnya (Wajib atau Tidak wajib).</p>
    {!migrated && <Notice tone="warning">Aturan ini menunggu migrasi 202611120001_pw_minutes_rule.sql. Sampai itu yang berlaku: Forum dan Rapat wajib, Acara dan meeting berdua tidak, batas isi 24 jam.</Notice>}
    <ul className={css.moduleList}>{keys.map(key => <li key={key} className={css.moduleRow}>
      <span className={css.moduleText}><span>{minutesRuleLabels[key]}</span><span>{rule[key] ? "Wajib MoM" : "Tidak wajib"} · {help[key]}</span></span>
      <label className={css.switch}>
        <input type="checkbox" role="switch" checked={rule[key]} disabled={busy || !migrated} aria-label={`${minutesRuleLabels[key]}: wajib MoM`}
          onChange={change => { setRule({ ...rule, [key]: change.target.checked }); setMessage(null); }} />
        <span className={css.switchTrack} aria-hidden="true" />
      </label>
    </li>)}</ul>

    <h3 className={css.windowTitle}>Batas mengisi dan merevisi</h3>
    <ul className={css.moduleList}>
      <li className={css.moduleRow}>
        <span className={css.moduleText}>
          <span>Batasi waktu pengisian</span>
          <span>{limited ? `MoM bisa diisi atau direvisi sampai ${windowLabel(rule.windowHours!)} setelah meeting selesai. Sesudahnya hanya bisa dibaca.` : "Tanpa batas: MoM selalu bisa diisi dan direvisi."}</span>
        </span>
        <label className={css.switch}>
          <input type="checkbox" role="switch" checked={limited} disabled={busy || !migrated} aria-label="Batasi waktu pengisian MoM"
            onChange={change => {
              setMessage(null);
              if (!change.target.checked) { setRule({ ...rule, windowHours: null }); return; }
              const value = Number(hoursText);
              const hours = Number.isInteger(value) && value >= 1 && value <= MINUTES_WINDOW_MAX_HOURS ? value : MINUTES_WINDOW_HOURS;
              setHoursText(String(hours)); setRule({ ...rule, windowHours: hours });
            }} />
          <span className={css.switchTrack} aria-hidden="true" />
        </label>
      </li>
      {limited && <li className={css.windowRow}>
        <label className={css.windowField}>
          <span>Lama pengisian</span>
          <span className={css.windowInput}>
            <input className="input" type="number" inputMode="numeric" min={1} max={MINUTES_WINDOW_MAX_HOURS} step={1} value={hoursText} disabled={busy || !migrated}
              aria-invalid={!hoursOk || undefined} aria-describedby="mom-window-hint" onChange={event => setHours(event.target.value)} />
            <span>jam setelah meeting selesai</span>
          </span>
        </label>
        <div className={css.windowPresets} role="group" aria-label="Pilihan cepat">
          {PRESETS.map(hours => <ConsoleButton key={hours} variant={rule.windowHours === hours ? "primary" : "secondary"} disabled={busy || !migrated}
            onClick={() => setHours(String(hours))}>{windowLabel(hours)}</ConsoleButton>)}
        </div>
        <p id="mom-window-hint" className={hoursOk ? css.note : css.windowError}>{hoursOk ? `1 sampai ${MINUTES_WINDOW_MAX_HOURS} jam (30 hari).` : `Isi angka bulat 1 sampai ${MINUTES_WINDOW_MAX_HOURS}.`}</p>
      </li>}
    </ul>

    <div className={css.actions}>
      <ConsoleButton variant={changed ? "primary" : "secondary"} disabled={busy || !changed || !migrated || !hoursOk} onClick={() => void save()}>{busy ? "Menyimpan…" : "Simpan aturan"}</ConsoleButton>
      {changed && <ConsoleButton disabled={busy} onClick={() => { setRule(saved); setHoursText(String(saved.windowHours ?? MINUTES_WINDOW_HOURS)); }}>Batalkan</ConsoleButton>}
      {!changed && !busy && <span className={css.note}>Belum ada perubahan.</span>}
    </div>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
  </Card>;
}
