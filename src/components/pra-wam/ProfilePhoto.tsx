"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Camera, Images, Trash2 } from "lucide-react";
import { acceptPhotos, encodeWithinLimit, PHOTO_SIDE, sourceProblem, squareCrop, type PhotoMime } from "@/lib/pra-wam/photo";
import { praWamApi } from "@/lib/routes";
import { errorText, praWamRequest, PraWamApiError } from "./api";
import { Avatar } from "./Avatar";
import { useConfirm } from "./ConfirmDialog";
import css from "./avatar.module.css";

/*
 * The large profile photo on Profil. With `editable`, the camera button opens a small dialog in
 * the middle, like a phone's own photo chooser: "Ambil foto" (the camera; touch screens only),
 * "Pilih dari galeri", "Hapus foto" when there is one, and "Batal". A modal <dialog> sits in the
 * top layer, so no card's `overflow: hidden` can clip it.
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
  const chooser = useRef<HTMLDialogElement>(null);
  const firstAction = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const busy = step.kind === "busy";
  const localUrl = local?.url;
  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);

  // Open and close the dialog with the state; the first visible choice takes the focus.
  useEffect(() => {
    const dialog = chooser.current;
    if (!dialog) return;
    if (menuOpen && !dialog.open) {
      dialog.showModal();
      const first = [...dialog.querySelectorAll<HTMLButtonElement>("button")].find(button => button.offsetParent !== null) ?? firstAction.current;
      first?.focus();
    }
    if (!menuOpen && dialog.open) { dialog.close(); trigger.current?.focus(); }
  }, [menuOpen]);

  const shown = local && local.base === photo ? local.url : photo;

  /**
   * Closes the dialog now, not after the next render: while it is open the rest of the page is
   * inert, so the file input could not be clicked and the confirm would open over it.
   */
  function closeNow() { flushSync(() => setMenuOpen(false)); }

  /**
   * The camera button. When the dialog would hold only "Pilih dari galeri" (a computer, where
   * "Ambil foto" is hidden, and no photo to remove), skip it and open the device's picker at once.
   */
  function choose() {
    const noCamera = typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (noCamera && !shown) { input.current?.click(); return; }
    setMenuOpen(true);
  }

  function pick(from: "kamera" | "galeri") {
    closeNow();
    (from === "kamera" ? camera : input).current?.click();
  }

  async function upload(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (camera.current) camera.current.value = "";
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
        disabled={busy} onClick={choose}>
        <Camera aria-hidden />
      </button>}
    </div>
    {editable && <dialog ref={chooser} className={css.chooser} aria-labelledby="ganti-foto-judul"
      onCancel={event => { event.preventDefault(); setMenuOpen(false); }}
      onClick={event => { if (event.target === chooser.current) setMenuOpen(false); }}>
      <h2 id="ganti-foto-judul">Ganti foto profil</h2>
      <p>Foto dipotong persegi dan diperkecil otomatis.</p>
      <div className={css.actions}>
        <button type="button" className={`${css.action} ${css.actionCamera}`} onClick={() => pick("kamera")}><Camera aria-hidden />Ambil foto</button>
        <button ref={firstAction} type="button" className={css.action} onClick={() => pick("galeri")}><Images aria-hidden />Pilih dari galeri</button>
        {shown && <button type="button" className={`${css.action} ${css.actionDanger}`} onClick={remove}><Trash2 aria-hidden />Hapus foto</button>}
        <button type="button" className={`${css.action} ${css.actionCancel}`} onClick={() => setMenuOpen(false)}>Batal</button>
      </div>
    </dialog>}
    {editable && <input ref={input} type="file" accept={acceptPhotos} className={css.file} tabIndex={-1} aria-hidden onChange={event => upload(event.target.files?.[0])} />}
    {editable && <input ref={camera} type="file" accept="image/*" capture="user" className={css.file} tabIndex={-1} aria-hidden onChange={event => upload(event.target.files?.[0])} />}
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
