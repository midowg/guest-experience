"use client";

import { useId, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { Banner, Button, List, Sheet, SwitchRow, TextField } from "@/components/main-wam/ui";
import { count, parseClock, formatMinutes } from "@/lib/main-wam/panitia/format";
import { planShift, typedTimes, type LiveSession, type ShiftPlan } from "@/lib/main-wam/panitia/rundown";
import { errorText, PanitiaError, type PanitiaApi, type RundownChangeAnswer } from "./api";
import { CheckboxRow, ErrorLine } from "./parts";
import css from "./panitia.module.css";

/**
 * K03 Ubah jam (a sheet over Rundown live): Mulai and Selesai, the sessions after it that move with
 * it (the ones it runs into are ticked; a session that stays and now clashes stops Simpan with its
 * reason), "Kabari peserta" (on by default), Simpan. Saved with the version the panitia saw: when
 * someone changed it meanwhile, the sheet says who and offers "Muat ulang".
 */
export function UbahJamSheet({ session, sameDay, recipients, api, onClose, onSaved }: {
  session: LiveSession;
  sameDay: LiveSession[];
  recipients: number;
  api: PanitiaApi;
  onClose: () => void;
  onSaved: (plan: ShiftPlan, answer: RundownChangeAnswer, notify: boolean) => void;
}) {
  const id = useId();
  const [typed, setTyped] = useState(() => typedTimes(session));
  const [checked, setChecked] = useState<Set<string> | null>(null);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{ text: string; stale: boolean } | null>(null);
  const plan = useMemo(() => planShift(session, sameDay, typed, checked), [session, sameDay, typed, checked]);

  const type = (field: "start" | "end", value: string) => { setTyped(current => ({ ...current, [field]: value })); setChecked(null); setFailure(null); };
  // "1230" becomes "12.30" when the field is left, so what is saved is what is shown.
  const tidy = (field: "start" | "end") => { const minutes = parseClock(typed[field]); if (minutes !== null) setTyped(current => ({ ...current, [field]: formatMinutes(minutes) })); };
  const toggle = (rowId: string) => {
    const now = new Set(checked ?? plan.rows.filter(row => row.checked).map(row => row.id));
    if (now.has(rowId)) now.delete(rowId); else now.add(rowId);
    setChecked(now);
    setFailure(null);
  };

  async function save() {
    if (!plan.changed) { onClose(); return; }
    if (!plan.ok || !plan.startsAt || saving) return;
    setSaving(true);
    setFailure(null);
    try {
      const versions = new Map(sameDay.map(item => [item.id, item.version]));
      const answer = await api.changeSession(session.id, {
        action: "jam", version: session.version, startsAt: plan.startsAt, endsAt: plan.endsAt, notify,
        shift: plan.moved.map(move => ({ id: move.id, version: versions.get(move.id) ?? "" })),
      });
      onSaved(plan, answer, notify);
    } catch (error) {
      setFailure({ text: errorText(error), stale: error instanceof PanitiaError && error.status === 409 });
    } finally { setSaving(false); }
  }

  const disabled = plan.changed && !plan.ok;
  return <Sheet open onClose={onClose} locked={saving} title={`Ubah jam · ${session.title}`}
    footer={<>
      <Button block loading={saving} loadingLabel="Menyimpan…" disabled={disabled} onClick={save}>Simpan</Button>
      <Button block variant="text" onClick={onClose} disabled={saving}>Batal</Button>
    </>}>
    <div className={css.sheetBody}>
      {failure && <Banner tone="error" title={failure.text}
        action={failure.stale ? { label: "Muat ulang", onClick: () => { api.refresh(); onClose(); } } : undefined} />}
      <div className={css.grid2}>
        <TextField label="Mulai" icon={<Clock />} inputMode="decimal" autoComplete="off" value={typed.start} onChange={event => type("start", event.target.value)} onBlur={() => tidy("start")}
          error={plan.errorField === "start" && !plan.error?.startsWith("Bentrok") ? plan.error : undefined} />
        <TextField label="Selesai" icon={<Clock />} inputMode="decimal" autoComplete="off" value={typed.end} placeholder={session.endsAt ? undefined : "Tanpa jam selesai"} onChange={event => type("end", event.target.value)} onBlur={() => tidy("end")}
          error={plan.errorField === "end" ? plan.error : undefined} />
      </div>
      <p className={css.help}>{plan.help}</p>
      {plan.error?.startsWith("Bentrok") && <ErrorLine>{plan.error}</ErrorLine>}
      {plan.shiftLabel && <div className={css.group} role="group" aria-labelledby={`${id}-shift`}>
        <span id={`${id}-shift`} className={css.groupLabel}>{plan.shiftLabel}</span>
        <List inset={16}>
          {plan.rows.map(row => <CheckboxRow key={row.id} id={`${id}-${row.id}`} title={row.title} checked={row.checked} onToggle={() => toggle(row.id)}
            sub={row.checked ? `${row.becomes} · tadinya ${row.was}` : `${row.was} · tetap`} error={row.clash ? "Bentrok. Centang atau ubah jamnya." : null} />)}
        </List>
      </div>}
      <List inset={16}>
        <SwitchRow inList title="Kabari peserta" sub={`Notifikasi ke ${count(recipients)} orang`} checked={notify} onChange={setNotify} />
      </List>
    </div>
  </Sheet>;
}
