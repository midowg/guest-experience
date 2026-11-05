"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Building2, Camera, CheckCircle2, ChevronLeft, Images, Video } from "lucide-react";
import type { CheckInStatus } from "@/lib/pra-wam/agenda";
import type { ProofMime, SelfCheckInAnswer } from "@/lib/pra-wam/attendance";
import { acceptPhotos, sourceProblem } from "@/lib/pra-wam/photo";
import { errorText } from "./api";
import { CheckInBlock } from "./CheckInStatus";
import { checkInOffline, checkInOnline, shrinkProof } from "./proofUpload";
import css from "./avatar.module.css";
import own from "./self-check-in.module.css";

/*
 * "Saya hadir" (migration 202611050003) under the check-in block of Detail sesi, for a participant
 * of a published session. While the window is open it opens a small dialog in the middle, like the
 * profile photo chooser: "Kamu hadir di mana?" with "Di kantor (offline)", which records it at
 * once, and "Online lewat Zoom", which asks for a screenshot of the meeting first. Before the
 * window opens and after it closes the button is there but disabled, and the block says why.
 * Once recorded the block says "Hadir 09.42 · di kantor" at once, and the page refreshes so the
 * agenda's pill follows. The printed QR keeps working beside it.
 */

type Props = {
  sessionId: string;
  status: CheckInStatus;
  /** The time the page was drawn, so the server and the browser say the same. */
  now: string;
  /** "Saya hadir" can be stored (the migration is there). */
  selfReady: boolean;
};

type Step = "pilih" | "online";
type Busy = { text: string; progress?: number } | null;
type Picked = { blob: Blob; mime: ProofMime; url: string };

export function SelfCheckIn({ sessionId, status, now, selfReady }: Props) {
  const router = useRouter();
  const [recorded, setRecorded] = useState<SelfCheckInAnswer | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("pilih");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const describe = useId();
  const title = useId();
  const pickedUrl = picked?.url;
  useEffect(() => () => { if (pickedUrl) URL.revokeObjectURL(pickedUrl); }, [pickedUrl]);

  // Open and close the dialog with the state; the first choice of each step takes the focus.
  useEffect(() => {
    const box = dialog.current;
    if (!box) return;
    if (open && !box.open) box.showModal();
    if (open) box.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    if (!open && box.open) { box.close(); trigger.current?.focus(); }
  }, [open, step]);

  const shown: CheckInStatus = status.kind !== "hadir" && recorded ? { kind: "hadir", at: recorded.checkedInAt, method: recorded.method } : status;
  const at = new Date(now);
  if (!selfReady || shown.kind === "hadir" || shown.kind === "tidak-tersedia") {
    return <>
      <CheckInBlock status={shown} now={at} self={selfReady} />
      {said && <p className={css.status} role="status"><span className={css.done}>{said}</span></p>}
    </>;
  }

  const canTap = shown.kind === "buka";
  function begin() { setStep("pilih"); setError(null); setPicked(null); setOpen(true); }
  function close() { if (!busy) setOpen(false); }

  function done(result: { answer: SelfCheckInAnswer; message: string }) {
    flushSync(() => { setRecorded(result.answer); setOpen(false); setPicked(null); });
    setSaid(result.message);
    router.refresh();
  }

  async function offline() {
    setError(null);
    setBusy({ text: "Mencatat kehadiran…" });
    try { done(await checkInOffline(sessionId)); }
    catch (problem) { setError(errorText(problem)); }
    finally { setBusy(null); }
  }

  async function pick(file: File | undefined) {
    if (gallery.current) gallery.current.value = "";
    if (camera.current) camera.current.value = "";
    if (!file) return;
    const problem = sourceProblem(file);
    if (problem) { setError(problem); return; }
    setError(null);
    setBusy({ text: "Memperkecil gambar…" });
    try {
      const { blob, mime } = await shrinkProof(file);
      setPicked({ blob, mime, url: URL.createObjectURL(blob) });
    } catch (problem) { setError(errorText(problem)); }
    finally { setBusy(null); }
  }

  async function send() {
    if (!picked) { setError("Pilih tangkapan layar Zoom dulu."); return; }
    setError(null);
    setBusy({ text: "Mengunggah bukti…", progress: 0 });
    try {
      done(await checkInOnline(sessionId, picked.blob, picked.mime, share => setBusy(share < 1 ? { text: "Mengunggah bukti…", progress: share } : { text: "Memeriksa bukti…", progress: 1 })));
    } catch (problem) { setError(errorText(problem)); }
    finally { setBusy(null); }
  }

  const progress = busy?.progress !== undefined ? Math.round(busy.progress * 100) : null;
  const statusLine = <div className={`${css.status} ${own.dialogStatus}`} role={error ? "alert" : "status"} aria-live="polite">
    {busy && <>
      <span>{busy.text}{progress !== null && progress < 100 ? ` ${progress}%` : ""}</span>
      {progress !== null && <span className={css.bar} role="progressbar" aria-label="Unggahan bukti" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <span style={{ width: `${progress}%` }} />
      </span>}
    </>}
    {!busy && error && <span className={css.error}>{error}</span>}
  </div>;

  return <div className={own.block}>
    <CheckInBlock status={shown} now={at} self id={describe} />
    <button ref={trigger} type="button" className={`button button--primary ${own.hadir}`} disabled={!canTap}
      aria-describedby={canTap ? undefined : describe} aria-haspopup="dialog" aria-expanded={open} onClick={begin}>
      <CheckCircle2 size={20} aria-hidden /> Saya hadir
    </button>
    <dialog ref={dialog} className={`${css.chooser} ${step === "online" ? own.wide : ""}`} aria-labelledby={title} aria-busy={busy ? true : undefined}
      onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => { if (event.target === dialog.current) close(); }}>
      {step === "pilih" ? <>
        <h2 id={title}>Kamu hadir di mana?</h2>
        <p>Pilih sesuai tempatmu mengikuti sesi ini.</p>
        {statusLine}
        <div className={css.actions}>
          <button type="button" className={`${css.action} ${own.choice}`} disabled={!!busy} onClick={offline}>
            <Building2 aria-hidden /><span className={own.choiceText}>Di kantor (offline)<small>Langsung tercatat hadir</small></span>
          </button>
          <button type="button" className={`${css.action} ${own.choice}`} disabled={!!busy} onClick={() => { setError(null); setStep("online"); }}>
            <Video aria-hidden /><span className={own.choiceText}>Online lewat Zoom<small>Unggah tangkapan layar meeting</small></span>
          </button>
          <button type="button" className={`${css.action} ${css.actionCancel}`} disabled={!!busy} onClick={close}>Batal</button>
        </div>
      </> : <>
        <h2 id={title}>Hadir online lewat Zoom</h2>
        <p>Unggah tangkapan layar Zoom yang menunjukkan kamu di meeting ini.</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL made in this browser */}
        {picked && <img className={own.preview} src={picked.url} alt="Pratinjau tangkapan layar Zoom" />}
        {statusLine}
        <div className={css.actions}>
          <button type="button" className={css.action} disabled={!!busy} onClick={() => gallery.current?.click()}><Images aria-hidden />{picked ? "Pilih gambar lain" : "Pilih dari galeri"}</button>
          <button type="button" className={`${css.action} ${css.actionCamera}`} disabled={!!busy} onClick={() => camera.current?.click()}><Camera aria-hidden />Foto layar dengan kamera</button>
        </div>
        <div className={own.send}>
          <button type="button" className="button button--primary" disabled={!picked || !!busy} onClick={send}>Kirim dan tandai hadir</button>
          <button type="button" className="button button--quiet" disabled={!!busy} onClick={() => { setError(null); setStep("pilih"); }}><ChevronLeft size={18} aria-hidden /> Kembali</button>
        </div>
        <input ref={gallery} type="file" accept={acceptPhotos} className={css.file} tabIndex={-1} aria-hidden onChange={event => pick(event.target.files?.[0])} />
        <input ref={camera} type="file" accept="image/*" capture="environment" className={css.file} tabIndex={-1} aria-hidden onChange={event => pick(event.target.files?.[0])} />
      </>}
    </dialog>
  </div>;
}
