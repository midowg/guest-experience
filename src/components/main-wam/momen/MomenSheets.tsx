"use client";

import { useId, useState } from "react";
import { Download, Flag, Trash2 } from "lucide-react";
import { useKnown, useLang, useT } from "@/components/main-wam/i18n";
import { Button, ConfirmDialog, List, ListRow, Sheet, TextField } from "@/components/main-wam/ui";
import { reportSchema } from "@/lib/main-wam/momen/filters";
import { choiceSub, countTotals, filterGroups, type SessionChoice } from "@/lib/main-wam/momen/sessions";
import { UMUM, type SessionCount, type SessionFilter } from "@/lib/main-wam/momen/types";
import { REPORT_REASONS, type ReportReason } from "@/lib/main-wam/types";
import { saveFile } from "./saveFile";
import { PickList, RadioCards, type PickGroup } from "./Choices";
import css from "./sheets.module.css";

/** "Saring sesi" (M01__status#pilih-sesi): Semua sesi, sessions with photos by day, Umum. */
export function SessionFilterSheet({ open, onClose, sessions, counts, value, onChange, now }: {
  open: boolean; onClose: () => void; sessions: SessionChoice[]; counts: SessionCount[]; value: SessionFilter; onChange: (value: SessionFilter) => void; now: Date;
}) {
  const t = useT();
  const { lang } = useLang();
  const totals = countTotals(counts);
  const groups: PickGroup[] = [
    { rows: [{ value: "", title: t("momen.allSessions"), end: t("momen.photosN", { n: totals.all }) }] },
    ...filterGroups(sessions, counts, now, lang).map(group => ({ head: group.head, rows: group.rows.map(row => ({ value: row.id, title: row.title, sub: choiceSub(row, lang), end: t("momen.photosN", { n: row.photos ?? 0 }) })) })),
    ...(totals.umum > 0 ? [{ rows: [{ value: UMUM, title: t("momen.general"), sub: t("momen.noSession"), end: t("momen.photosN", { n: totals.umum }) }] }] : []),
  ];
  return <Sheet open={open} onClose={onClose} title={t("momen.filterSessionTitle")}>
    <PickList label={t("momen.session")} groups={groups} value={value ?? ""} onChange={next => { onChange(next || null); onClose(); }} />
  </Sheet>;
}

/** "…" on a photo (M01__status#aksi-orang, #aksi-sendiri): Laporkan foto, or Hapus foto for one's own. */
export function PhotoOptionsSheet({ open, onClose, owner, mine, onReport, onDelete, save }: {
  open: boolean; onClose: () => void; owner: string; mine: boolean; onReport: () => void; onDelete: () => void;
  /** Simpan foto: the large file's download address and name (viewerFile). */
  save?: { href: string; name: string };
}) {
  const t = useT();
  return <Sheet open={open} onClose={onClose} title={mine ? t("momen.altMine") : t("momen.altBy", { name: owner })} flush>
    <List plain inset={68} label={t("momen.photoOptions")}>
      {save && <ListRow icon={<Download />} title={t("momen.view.save")} chevron={false} onClick={() => { saveFile(save.href, save.name); onClose(); }} />}
      {mine
        ? <ListRow icon={<Trash2 className={css.danger} />} title={<span className={css.danger}>{t("momen.deletePhoto")}</span>} chevron={false} onClick={onDelete} />
        : <ListRow icon={<Flag />} title={t("momen.reportPhoto")} chevron={false} onClick={onReport} />}
    </List>
  </Sheet>;
}

/** A refusal trying again would not change (409: a photo nominated for Awarding stays): the dialog closes. */
export const refusedForGood = (error: unknown) => (error as { status?: unknown } | null)?.status === 409;

/** Hapus foto ini? (M01__status#hapus). */
export function DeletePhotoDialog({ open, busy, mozaik, onCancel, onConfirm }: { open: boolean; busy: boolean; mozaik: boolean; onCancel: () => void; onConfirm: () => void }) {
  const t = useT();
  return <ConfirmDialog open={open} onCancel={onCancel} onConfirm={onConfirm} tone="danger" icon={<Trash2 />} title={t("momen.deleteTitle")}
    body={mozaik ? t("momen.deleteBodyMosaic") : t("momen.deleteBody")} confirmLabel={t("momen.deletePhoto")} busy={busy} busyLabel={t("momen.deleting")} />;
}

/**
 * M04 Laporkan foto: why (one of four), a note for panitia (required for Lainnya), Kirim laporan.
 * Only panitia see the report; the photo is hidden for the reporter at once.
 */
export function ReportSheet({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (input: { reason: ReportReason; note: string }) => Promise<void> }) {
  const t = useT();
  const known = useKnown();
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
      setErrors({ reason: issues.find(issue => issue.path[0] === "reason") ? t("momen.pickReason") : undefined, note: known(issues.find(issue => issue.path[0] === "note")?.message ?? "") || undefined });
      return;
    }
    setBusy(true);
    try {
      await onSubmit(parsed.data);
      setReason(null); setNote(""); setErrors({});
    } catch (error) {
      setErrors({ form: error instanceof Error ? known(error.message) : t("momen.reportFailed") });
    } finally { setBusy(false); }
  }

  return <Sheet open={open} onClose={close} title={t("momen.reportPhoto")} locked={busy}
    footer={<div className={css.form}>
      {errors.form && <p role="alert" className={css.error}>{errors.form}</p>}
      <Button block loading={busy} loadingLabel={t("momen.sending")} onClick={submit}>{t("momen.sendReport")}</Button>
      <Button block variant="text" onClick={close} disabled={busy}>{t("ui.cancel")}</Button>
    </div>}>
    <div className={css.form}>
      <p className={css.lead}>{t("momen.onlyCommittee")}</p>
      <RadioCards label={t("momen.reasonLabel")} value={reason} invalid={!!errors.reason} describedBy={errors.reason ? `${id}-reason` : undefined}
        onChange={value => { setReason(value as ReportReason); setErrors(current => ({ ...current, reason: undefined })); }}
        options={REPORT_REASONS.map(value => ({ value, title: t(`momen.reason.${value}`) }))} />
      {errors.reason && <p id={`${id}-reason`} className={css.error}>{errors.reason}</p>}
      <TextField label={t("momen.noteLabel")} optional={reason !== "lainnya"} multiline rows={2} maxLength={300} value={note} error={errors.note}
        placeholder={t("momen.notePlaceholder")} onChange={event => { setNote(event.target.value); setErrors(current => ({ ...current, note: undefined })); }} />
    </div>
  </Sheet>;
}
