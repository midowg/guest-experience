"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, Image as ImageIcon, Trash2 } from "lucide-react";
import { shrink } from "@/components/pra-wam/ProfilePhoto";
import { uploadProfilePhoto } from "@/components/pra-wam/photoUpload";
import { acceptPhotos, sourceProblem } from "@/lib/pra-wam/photo";
import { praWamApi } from "@/lib/routes";
import { Avatar, ConfirmDialog, List, ListRow, Sheet } from "@/components/main-wam/ui";
import { useT } from "@/components/main-wam/i18n";
import { failText, mwRequest } from "../request";
import css from "../peserta.module.css";

type Step = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "done"; text: string } | { kind: "error"; text: string };

/**
 * "Foto profil" (P05__status#ganti-foto): the sheet the profile card opens, with Ambil foto (the
 * front camera), Pilih dari galeri, and Hapus foto when there is one. The same profile photo as WAM
 * (Pra WAM's square crop and size, its upload and delete API), so it shows everywhere at once.
 */
export function ProfileSheet({ open, onClose, name, fullName, line, photo }: { open: boolean; onClose: () => void; name: string; fullName: string; line: string; photo: string | null }) {
  const router = useRouter();
  const t = useT();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [shown, setShown] = useState<{ base: string | null; url: string | null } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const busy = step.kind === "busy";
  const current = shown && shown.base === photo ? shown.url : photo;

  async function upload(file: File | undefined) {
    if (gallery.current) gallery.current.value = "";
    if (camera.current) camera.current.value = "";
    if (!file) return;
    const problem = sourceProblem(file);
    if (problem) { setStep({ kind: "error", text: problem }); return; }
    setStep({ kind: "busy", text: t("peserta.profile.shrinking") });
    try {
      const { blob, mime } = await shrink(file);
      setShown({ base: photo, url: URL.createObjectURL(blob) });
      setStep({ kind: "busy", text: t("peserta.profile.uploading") });
      await uploadProfilePhoto(blob, mime, share => setStep({ kind: "busy", text: share < 1 ? t("peserta.profile.uploadingPct", { pct: Math.round(share * 100) }) : t("peserta.profile.saving") }));
      setStep({ kind: "done", text: t("peserta.profile.changed") });
      router.refresh();
    } catch (error) {
      setShown(null);
      setStep({ kind: "error", text: error instanceof Error && error.message ? error.message : failText(error) });
    }
  }

  async function remove() {
    setStep({ kind: "busy", text: t("peserta.profile.deleting") });
    try {
      await mwRequest(praWamApi.photo, { method: "DELETE" });
      setShown({ base: photo, url: null });
      setConfirming(false);
      setStep({ kind: "done", text: t("peserta.profile.deleted") });
      router.refresh();
    } catch (error) {
      setConfirming(false);
      setStep({ kind: "error", text: failText(error) });
    }
  }

  /** The phone's picker; the inputs sit inside the sheet, so the open dialog does not make them inert. */
  function pick(input: HTMLInputElement | null) { setStep({ kind: "idle" }); input?.click(); }

  return <>
    <Sheet open={open} onClose={onClose} title={t("peserta.profile.title")} locked={busy}>
      <div className={css.sheetStack}>
        <div className={css.sheetPerson}>
          <Avatar name={name} photo={current} size={64} />
          <span className={css.personText}><span className={css.personName}>{fullName}</span><span className={css.personRole}>{line}</span></span>
        </div>
        <List plain bleed>
          <ListRow icon={<Camera />} title={t("peserta.profile.take")} chevron={false} onClick={() => pick(camera.current)} disabled={busy} />
          <ListRow icon={<ImageIcon />} title={t("peserta.profile.pick")} chevron={false} onClick={() => pick(gallery.current)} disabled={busy} />
          {current && <ListRow icon={<Trash2 />} title={<span className={css.danger}>{t("peserta.profile.delete")}</span>} chevron={false} onClick={() => setConfirming(true)} disabled={busy} />}
        </List>
        <p className={`${css.status} ${step.kind === "error" ? css.statusError : ""}`} role={step.kind === "error" ? "alert" : "status"} aria-live="polite">
          {step.kind === "idle" ? "" : step.text}
        </p>
        <input ref={gallery} type="file" accept={acceptPhotos} className={css.fileInput} tabIndex={-1} aria-hidden onChange={event => upload(event.target.files?.[0])} />
        <input ref={camera} type="file" accept="image/*" capture="user" className={css.fileInput} tabIndex={-1} aria-hidden onChange={event => upload(event.target.files?.[0])} />
      </div>
    </Sheet>
    <ConfirmDialog open={confirming} onCancel={() => setConfirming(false)} onConfirm={remove} tone="danger" icon={<Trash2 />}
      title={t("peserta.profile.deleteTitle")} body={t("peserta.profile.deleteBody")} confirmLabel={t("peserta.profile.delete")} busy={busy} busyLabel={t("peserta.profile.deletingShort")} />
  </>;
}
