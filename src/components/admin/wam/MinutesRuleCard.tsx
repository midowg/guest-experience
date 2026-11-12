"use client";

import { useState } from "react";
import { Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { Card, ConsoleButton } from "@/components/console";
import { minutesRuleLabels, type MinutesRule } from "@/lib/pra-wam/minutes";
import { praWamMinutesRuleApi } from "@/lib/routes";
import css from "./pra-wam-rooms.module.css";

const keys = Object.keys(minutesRuleLabels) as (keyof MinutesRule)[];
const help: Record<keyof MinutesRule, string> = {
  forum: "Forum yang terbit.",
  rapat: "Rapat yang dibuat panitia, dan meeting dari booking ruang.",
  acara: "Acara (makan bersama, sesi umum).",
  berdua: "Meeting dengan dua orang atau kurang. Mati: tidak wajib, apa pun jenisnya.",
};

/**
 * Admin WAM → Acara → Notulen (MoM), 12 Nov 2026: which meetings need a MoM once they are over,
 * per session kind and for one-on-ones. A session can still say otherwise in its own form
 * (Wajib / Tidak wajib); this is what "Ikuti aturan" follows.
 */
export function MinutesRuleCard({ initial, migrated }: { initial: MinutesRule; migrated: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [rule, setRule] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const changed = keys.some(key => rule[key] !== saved[key]);

  async function save() {
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<MinutesRule>(praWamMinutesRuleApi, { method: "PUT", body: JSON.stringify(rule) });
      if (result.data) { setSaved(result.data); setRule(result.data); }
      setMessage({ tone: "success", text: result.message });
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(false); }
  }

  return <Card title="Notulen (MoM)" id="mom">
    <p className={css.note}>Meeting yang wajib punya MoM setelah selesai. Yang wajib dan belum diisi muncul di Agenda peserta, Jadwal sesi, dan Ringkasan. Tiap sesi bisa dikecualikan di formnya (Wajib atau Tidak wajib).</p>
    {!migrated && <Notice tone="warning">Aturan ini menunggu migrasi 202611120001_pw_minutes_rule.sql. Sampai itu yang berlaku: Forum dan Rapat wajib, Acara dan meeting berdua tidak.</Notice>}
    <ul className={css.moduleList}>{keys.map(key => <li key={key} className={css.moduleRow}>
      <span className={css.moduleText}><span>{minutesRuleLabels[key]}</span><span>{rule[key] ? "Wajib MoM" : "Tidak wajib"} · {help[key]}</span></span>
      <label className={css.switch}>
        <input type="checkbox" role="switch" checked={rule[key]} disabled={busy || !migrated} aria-label={`${minutesRuleLabels[key]}: wajib MoM`}
          onChange={change => { setRule({ ...rule, [key]: change.target.checked }); setMessage(null); }} />
        <span className={css.switchTrack} aria-hidden="true" />
      </label>
    </li>)}</ul>
    <div className={css.actions}>
      <ConsoleButton variant={changed ? "primary" : "secondary"} disabled={busy || !changed || !migrated} onClick={() => void save()}>{busy ? "Menyimpan…" : "Simpan aturan"}</ConsoleButton>
      {changed && <ConsoleButton disabled={busy} onClick={() => setRule(saved)}>Batalkan</ConsoleButton>}
      {!changed && !busy && <span className={css.note}>Belum ada perubahan.</span>}
    </div>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
  </Card>;
}
