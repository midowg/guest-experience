"use client";

import { useId, useState } from "react";
import { Flag, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, List, ListRow, Sheet, TextField } from "@/components/main-wam/ui";
import { reportSchema } from "@/lib/main-wam/momen/filters";
import { choiceSub, countTotals, filterGroups, type SessionChoice } from "@/lib/main-wam/momen/sessions";
import { UMUM, type SessionCount, type SessionFilter } from "@/lib/main-wam/momen/types";
import { REPORT_REASONS, reportReasonLabels, type ReportReason } from "@/lib/main-wam/types";
import { PickList, RadioCards, type PickGroup } from "./Choices";
import css from "./sheets.module.css";

/** "Saring sesi" (M01__status#pilih-sesi, M05): Semua sesi, sessions with photos by day, Umum. */
export function SessionFilterSheet({ open, onClose, sessions, counts, value, onChange, now }: {
  open: boolean; onClose: () => void; sessions: SessionChoice[]; counts: SessionCount[]; value: SessionFilter; onChange: (value: SessionFilter) => void; now: Date;
}) {
  const totals = countTotals(counts);
  const groups: PickGroup[] = [
    { rows: [{ value: "", title: "Semua sesi", end: `${totals.all} foto` }] },
    ...filterGroups(sessions, counts, now).map(group => ({ head: group.head, rows: group.rows.map(row => ({ value: row.id, title: row.title, sub: choiceSub(row), end: `${row.photos} foto` })) })),
    ...(totals.umum > 0 ? [{ rows: [{ value: UMUM, title: "Umum", sub: "Tanpa sesi", end: `${totals.umum} foto` }] }] : []),
  ];
  return <Sheet open={open} onClose={onClose} title="Saring sesi">
    <PickList label="Sesi" groups={groups} value={value ?? ""} onChange={next => { onChange(next || null); onClose(); }} />
  </Sheet>;
}

/** "…" on a photo (M01__status#aksi-orang, #aksi-sendiri): Laporkan foto, or Hapus foto for one's own. */
export function PhotoOptionsSheet({ open, onClose, owner, mine, onReport, onDelete }: {
  open: boolean; onClose: () => void; owner: string; mine: boolean; onReport: () => void; onDelete: () => void;
}) {
  return <Sheet open={open} onClose={onClose} title={mine ? "Fotomu" : `Foto oleh ${owner}`} flush>
    <List plain inset={68} label="Pilihan foto">
      {mine
        ? <ListRow icon={<Trash2 className={css.danger} />} title={<span className={css.danger}>Hapus foto</span>} chevron={false} onClick={onDelete} />
        : <ListRow icon={<Flag />} title="Laporkan foto" chevron={false} onClick={onReport} />}
    </List>
  </Sheet>;
}

/** A refusal trying again would not change (409: a photo nominated for Awarding stays): the dialog closes. */
export const refusedForGood = (error: unknown) => (error as { status?: unknown } | null)?.status === 409;

/** Hapus foto ini? (M01__status#hapus). */
export function DeletePhotoDialog({ open, busy, mozaik, onCancel, onConfirm }: { open: boolean; busy: boolean; mozaik: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <ConfirmDialog open={open} onCancel={onCancel} onConfirm={onConfirm} tone="danger" icon={<Trash2 />} title="Hapus foto ini?"
    body={mozaik ? "Foto hilang dari Momen dan Mozaik." : "Foto hilang dari Momen."} confirmLabel="Hapus foto" busy={busy} busyLabel="Menghapus…" />;
}

/**
 * M04 Laporkan foto: why (one of four), a note for panitia (required for Lainnya), Kirim laporan.
 * Only panitia see the report; the photo is hidden for the reporter at once.
 */
export function ReportSheet({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (input: { reason: ReportReason; note: string }) => Promise<void> }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ reason?: string; note?: string; form?: string }>({});
  const id = useId();
  const close = () => { if (busy) return; onClose(); setReason(null); setNote(""); setErrors({}); };

  async function submit() {
    const parsed = reportSchema.safeParse({ reason: reason ?? undefined, note });
    if (!parsed.success) {
      const issues = parsed.error.issues;
      setErrors({ reason: issues.find(issue => issue.path[0] === "reason") ? "Pilih satu alasan." : undefined, note: issues.find(issue => issue.path[0] === "note")?.message });
      return;
    }
    setBusy(true);
    try {
      await onSubmit(parsed.data);
      setReason(null); setNote(""); setErrors({});
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : "Laporan belum terkirim. Coba lagi." });
    } finally { setBusy(false); }
  }

  return <Sheet open={open} onClose={close} title="Laporkan foto" locked={busy}
    footer={<div className={css.form}>
      {errors.form && <p role="alert" className={css.error}>{errors.form}</p>}
      <Button block loading={busy} loadingLabel="Mengirim…" onClick={submit}>Kirim laporan</Button>
      <Button block variant="text" onClick={close} disabled={busy}>Batal</Button>
    </div>}>
    <div className={css.form}>
      <p className={css.lead}>Hanya panitia yang melihat laporanmu.</p>
      <RadioCards label="Alasan laporan" value={reason} invalid={!!errors.reason} describedBy={errors.reason ? `${id}-reason` : undefined}
        onChange={value => { setReason(value as ReportReason); setErrors(current => ({ ...current, reason: undefined })); }}
        options={REPORT_REASONS.map(value => ({ value, title: reportReasonLabels[value] }))} />
      {errors.reason && <p id={`${id}-reason`} className={css.error}>{errors.reason}</p>}
      <TextField label="Catatan untuk panitia" optional={reason !== "lainnya"} multiline rows={2} maxLength={300} value={note} error={errors.note}
        placeholder="Mis. tolong hapus, saya belum siap difoto." onChange={event => { setNote(event.target.value); setErrors(current => ({ ...current, note: undefined })); }} />
    </div>
  </Sheet>;
}
