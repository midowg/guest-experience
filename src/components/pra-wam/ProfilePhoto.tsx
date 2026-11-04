"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Camera, ImagePlus, Trash2, X } from "lucide-react";
import { acceptPhotos, encodeWithinLimit, PHOTO_SIDE, sourceProblem, squareCrop, type PhotoMime } from "@/lib/pra-wam/photo";
import { praWamApi } from "@/lib/routes";
import { errorText, praWamRequest, PraWamApiError } from "./api";
import { Avatar } from "./Avatar";
import { useConfirm } from "./ConfirmDialog";
import { Sheet } from "./Sheet";
import css from "./avatar.module.css";

/*
 * The large profile photo on Profil. With `editable`, the camera button opens an action sheet:
 * "Pilih foto", "Hapus foto" when there is one, and "Batal". It is the shared Sheet (a modal
 * <dialog> in the top layer), so no card's `overflow: hidden` can clip it, on a phone or a desktop.
 * A picked photo is cropped to a square and made small
 * here in the browser (320 × 320 WebP, at most 200 KB), shown at once, then uploaded with its
 * progress. The page refreshes when it is saved.
 */

type Step = { kind: "idle" } | { kind: "busy"; text: string; progress?: number } | { kind: "done"; text: string } | { kind: "error"; text: string };

/** The picture, upright as the camera meant it (EXIF), ready to draw. */
async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    // Older browsers without createImageBitmap options: an <img> also follows EXIF orientation.
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try { await image.decode(); } catch {
      URL.revokeObjectURL(url);
      throw new PraWamApiError("Foto ini tidak dapat dibuka di browser ini. Pilih foto JPG atau PNG.");
    }
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  }
}

/** The middle square at 320 × 320, as small as it needs to be. */
async function shrink(file: File): Promise<{ blob: Blob; mime: PhotoMime }> {
  const picture = await decode(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = PHOTO_SIDE;
    const context = canvas.getContext("2d");
    if (!context) throw new PraWamApiError("Browser ini belum dapat memperkecil foto. Coba browser lain.");
    const { sx, sy, side } = squareCrop(picture.width, picture.height);
    context.fillStyle = "#fff"; // JPEG has no transparency
    context.fillRect(0, 0, PHOTO_SIDE, PHOTO_SIDE);
    context.imageSmoothingQuality = "high";
    context.drawImage(picture.source, sx, sy, side, side, 0, 0, PHOTO_SIDE, PHOTO_SIDE);
    try {
      return await encodeWithinLimit((mime, quality) => new Promise(resolve => canvas.toBlob(resolve, mime, quality)));
    } catch (error) {
      throw new PraWamApiError(error instanceof Error ? error.message : "Foto belum dapat diperkecil. Coba foto lain.");
    }
  } finally {
    picture.close();
  }
}

/** PUT to storage with progress; 0 when no answer came at all. */
function put(url: string, blob: Blob, mime: string, onProgress: (share: number) => void): Promise<number> {
  return new Promise(resolve => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", mime);
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    request.onload = () => resolve(request.status);
    request.onerror = () => resolve(0);
    request.send(blob);
  });
}

export function ProfilePhoto({ name, photo, editable }: { name: string; photo: string | null; editable?: boolean }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  // What to show until the refresh brings the saved photo: the new picture, or none after "Hapus".
  // It holds only while `photo` is still the one it replaced.
  const [local, setLocal] = useState<{ base: string | null; url: string | null } | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const trigger = useRef<HTMLButtonElement>(null);
  const firstAction = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const busy = step.kind === "busy";
  const localUrl = local?.url;
  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);

  // The sheet (a child) opens its dialog first; then the first action takes the focus, not the X.
  useEffect(() => { if (menuOpen) firstAction.current?.focus(); }, [menuOpen]);

  const shown = local && local.base === photo ? local.url : photo;

  /**
   * Closes the sheet now, not after the next render: while its modal dialog is open the rest of
   * the page is inert, so the file input could not be clicked and the confirm would open over it.
   * The sheet gives the focus back to the camera button.
   */
  function closeNow() { flushSync(() => setMenuOpen(false)); }

  function pick() {
    closeNow();
    input.current?.click();
  }

  async function upload(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    const problem = sourceProblem(file);
    if (problem) { setStep({ kind: "error", text: problem }); return; }
    setStep({ kind: "busy", text: "Memperkecil foto…" });
    try {
      const { blob, mime } = await shrink(file);
      setLocal({ base: photo, url: URL.createObjectURL(blob) });
      setStep({ kind: "busy", text: "Mengunggah foto…", progress: 0 });
      const agreed = { mime, size: blob.size };
      const start = await praWamRequest<{ key: string; uploadUrl: string; token: string }>(praWamApi.photoStart, { method: "POST", json: agreed });
      const status = await put(start.data.uploadUrl, blob, mime, share => setStep({ kind: "busy", text: "Mengunggah foto…", progress: share }));
      // No answer at all while online is the storage refusing this site (its CORS rule), not the network.
      if (status === 0) throw new PraWamApiError(navigator.onLine
        ? "Penyimpanan foto menolak unggahan dari aplikasi ini. Ini pengaturan server, bukan jaringanmu. Hubungi admin WAM."
        : "Kamu sedang offline. Sambungkan internet lalu coba lagi.");
      if (status < 200 || status >= 300) throw new PraWamApiError(`Penyimpanan menolak foto ini (kode ${status}). Coba lagi, atau hubungi admin WAM bila terus terjadi.`);
      setStep({ kind: "busy", text: "Menyimpan foto…", progress: 1 });
      await praWamRequest(praWamApi.photoConfirm, { method: "POST", json: { ...agreed, key: start.data.key, token: start.data.token } });
      setStep({ kind: "done", text: "Foto profil diganti." });
      router.refresh();
    } catch (error) {
      setLocal(null);
      setStep({ kind: "error", text: errorText(error) });
    }
  }

  async function remove() {
    closeNow();
    const ok = await confirm({ title: "Hapus foto profil?", body: "Foto dihapus dari akunmu. Inisial namamu tampil sebagai gantinya.", confirmLabel: "Hapus foto", danger: true });
    if (!ok) { trigger.current?.focus(); return; }
    setStep({ kind: "busy", text: "Menghapus foto…" });
    try {
      await praWamRequest(praWamApi.photo, { method: "DELETE" });
      setLocal({ base: photo, url: null });
      setStep({ kind: "done", text: "Foto profil dihapus." });
      router.refresh();
    } catch (error) {
      setStep({ kind: "error", text: errorText(error) });
    }
  }

  return <div className={css.profile}>
    <div className={css.frame} aria-busy={busy || undefined}>
      <Avatar name={name} photo={shown} size="xl" />
      {busy && <span className={css.veil} aria-hidden />}
      {editable && <button ref={trigger} type="button" className={css.camera} aria-label="Ganti foto profil" aria-haspopup="dialog" aria-expanded={menuOpen}
        disabled={busy} onClick={() => setMenuOpen(true)}>
        <Camera aria-hidden />
      </button>}
    </div>
    {editable && <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Foto profil">
      <div className={css.actions}>
        <button ref={firstAction} type="button" className={css.action} onClick={pick}><ImagePlus aria-hidden />Pilih foto</button>
        {shown && <button type="button" className={`${css.action} ${css.actionDanger}`} onClick={remove}><Trash2 aria-hidden />Hapus foto</button>}
        <button type="button" className={`${css.action} ${css.actionCancel}`} onClick={() => setMenuOpen(false)}><X aria-hidden />Batal</button>
      </div>
    </Sheet>}
    {editable && <input ref={input} type="file" accept={acceptPhotos} className={css.file} tabIndex={-1} aria-hidden onChange={event => upload(event.target.files?.[0])} />}
    {editable && <div className={css.status} role={step.kind === "error" ? "alert" : "status"} aria-live="polite">
      {step.kind === "busy" && <>
        <span>{step.text}{step.progress !== undefined && step.progress < 1 ? ` ${Math.round(step.progress * 100)}%` : ""}</span>
        {step.progress !== undefined && <span className={css.bar} role="progressbar" aria-label="Unggahan foto" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(step.progress * 100)}>
          <span style={{ width: `${Math.round(step.progress * 100)}%` }} />
        </span>}
      </>}
      {step.kind === "done" && <span className={css.done}>{step.text}</span>}
      {step.kind === "error" && <span className={css.error}>{step.text}</span>}
    </div>}
    {confirmDialog}
  </div>;
}
