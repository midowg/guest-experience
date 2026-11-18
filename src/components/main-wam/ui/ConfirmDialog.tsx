"use client";

import { useId, useRef, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { Button } from "./Button";
import { IconBox } from "./Card";
import { cx, type IconProp } from "./Pressable";
import { useModal } from "./useModal";
import css from "./sheet.module.css";

/**
 * Confirmation before a risky action (DS #37): delete, hide, close Silent Meeting, send news to
 * everyone, move the schedule. An alert dialog in the middle of the screen: title as a question,
 * one line on the result, the action named by its result ("Hapus foto", never "Ya"), and Batal as a
 * text button under it. Focus starts on Batal (the safe choice); Esc, Back and the scrim cancel.
 * The icon shows only for destructive actions (`tone="danger"`, PANDUAN §10.2).
 */
export function ConfirmDialog({ open, onCancel, onConfirm, title, body, confirmLabel, cancelLabel, tone = "primary", icon, busy, busyLabel, history = true, className }: {
  open: boolean;
  /** Batal, Esc, Back, the scrim. */
  onCancel: () => void;
  onConfirm: () => void;
  title: ReactNode;
  body?: ReactNode;
  /** Names the result: "Hapus foto", "Kirim kabar". */
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" = red button and the error icon. */
  tone?: "primary" | "danger";
  /** Danger only; Trash2 when left out. */
  icon?: IconProp;
  /** Working: the dialog stays open and the action shows a spinner. */
  busy?: boolean;
  busyLabel?: string;
  /** Owns a history entry so Back cancels it (default). */
  history?: boolean;
  className?: string;
}) {
  const t = useT();
  const cancelRef = useRef<HTMLElement>(null);
  const { dialogRef, titleRef, onKeyDown, onCancel: onDialogCancel, onBackdropClick } = useModal({ open, onClose: onCancel, history, locked: busy, initialFocus: cancelRef });
  const id = useId();
  return <dialog ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={body ? `${id}-body` : undefined}
    className={cx(css.dialog, className)} onKeyDown={onKeyDown} onCancel={onDialogCancel} onClick={onBackdropClick}>
    {open && <div className={css.dialogInner}>
      {tone === "danger" && <IconBox icon={icon ?? Trash2} tone="error" size={48} round />}
      <h2 ref={titleRef} id={`${id}-title`} tabIndex={-1} className={css.dialogTitle}>{title}</h2>
      {body && <p id={`${id}-body`} className={css.dialogBody}>{body}</p>}
      <div className={css.dialogActions}>
        <Button variant={tone === "danger" ? "danger" : "primary"} block loading={busy} loadingLabel={busyLabel} onClick={onConfirm}>{confirmLabel}</Button>
        <Button ref={cancelRef} variant="text" block onClick={onCancel} disabled={busy}>{cancelLabel ?? t("ui.cancel")}</Button>
      </div>
    </div>}
  </dialog>;
}
