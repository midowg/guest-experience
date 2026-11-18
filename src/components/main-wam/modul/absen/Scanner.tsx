"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CameraOff, Flashlight, QrCode, RefreshCw, X } from "lucide-react";
import { useT, useLang } from "@/components/main-wam/i18n";
import { ScreenContent, ShellChrome } from "@/components/main-wam/shell";
import { ActionBar, Banner, Button, IconButton, ToastPreview } from "@/components/main-wam/ui";
import { tokenFromScan } from "@/lib/main-wam/modul/absen";
import type { PanitiaContact } from "@/lib/main-wam/modul/contact";
import { canUseCamera, qrReader } from "@/lib/qr-detect";
import { mainWamPath } from "@/lib/routes";
import { ContactSheet } from "../ContactSheet";
import { Result } from "../Result";
import { useOnline } from "../useOnline";
import { AbsenQueue } from "./AbsenQueue";
import { OfflineSaved } from "./CheckIn";
import { enqueueScan } from "./queue";
import css from "../modul.module.css";

const noSubscribe = () => () => {};

/** The session whose absen is open now, for the card under the frame ("Pemaparan departemen · Aula Utama · sampai 12.30"). */
export type ScanContext = { title: string; place: string; until: string } | null;
type Phase = "kamera" | "ditolak" | "tanpa-kamera" | "tersimpan";

/**
 * A01 Scan QR (+ A05 Kamera ditolak, and A02 "Absen tersimpan" when there is no signal): the back
 * camera fills the screen inside its own dark bar. A QR of this site's check-in address goes to the
 * result (A02–A04); any other QR is refused here, so a stray QR never opens another site. Offline,
 * the scan is kept on the phone with its time and sent when there is signal. The camera starts
 * because the person just tapped Absen (the system asks once); it stops when the screen closes.
 * `preview` draws a phase without a camera (dev-preview).
 */
export function Scanner({ current, contact, preview }: { current: ScanContext; contact: PanitiaContact | null; preview?: Phase | "bukan-wam" | "offline" }) {
  const router = useRouter();
  const t = useT();
  const { lang } = useLang();
  void lang;
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const online = useOnline() && preview !== "offline";
  const supported = useSyncExternalStore(noSubscribe, canUseCamera, () => true);
  const [phase, setPhase] = useState<Phase>(preview && preview !== "bukan-wam" && preview !== "offline" ? preview : "kamera");
  const [attempt, setAttempt] = useState(0);
  const [found, setFound] = useState(false);
  const [refused, setRefused] = useState(preview === "bukan-wam");
  const [torch, setTorch] = useState<boolean | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const close = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push(mainWamPath.home);
  }, [router]);

  useEffect(() => {
    if (preview || phase !== "kamera" || !supported) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    let lastRefused = "";
    let hide = 0;
    const handle = (text: string): boolean => {
      const token = tokenFromScan(text, window.location.origin);
      if (!token) {
        if (text !== lastRefused) { lastRefused = text; setRefused(true); window.clearTimeout(hide); hide = window.setTimeout(() => setRefused(false), 3000); }
        return false;
      }
      stopped = true;
      setFound(true);
      navigator.vibrate?.(30);
      if (!navigator.onLine) {
        const at = new Date().toISOString();
        enqueueScan({ token, scannedAt: at, title: current?.title ?? "" });
        setSavedAt(at);
        window.setTimeout(() => setPhase("tersimpan"), 300);
      } else {
        window.setTimeout(() => router.push(mainWamPath.checkIn(token)), 300);
      }
      return true;
    };
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) { stream.getTracks().forEach(item => item.stop()); return; }
        track.current = stream.getVideoTracks()[0] ?? null;
        const capabilities = (track.current?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch(capabilities.torch ? false : null);
        const read = await qrReader();
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play().catch(() => undefined);
        const tick = async () => {
          if (stopped || !video.current) return;
          if (video.current.readyState >= 2) {
            const text = await read(video.current).catch(() => null);
            if (text && handle(text)) return;
          }
          timer = window.setTimeout(() => void tick(), 250);
        };
        void tick();
      } catch (problem) {
        const name = problem instanceof DOMException ? problem.name : "";
        setPhase(name === "NotAllowedError" || name === "SecurityError" ? "ditolak" : "tanpa-kamera");
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearTimeout(hide);
      stream?.getTracks().forEach(item => item.stop());
      track.current = null;
    };
  }, [phase, attempt, supported, preview, router, current?.title]);

  async function toggleTorch() {
    if (!track.current || torch === null) return;
    try {
      await track.current.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch { setTorch(null); }
  }

  const sheet = <ContactSheet open={contactOpen} onClose={() => setContactOpen(false)} contact={contact} />;

  if (phase === "tersimpan") return <OfflineSaved title={current?.title ?? ""} scannedAt={savedAt ?? new Date().toISOString()} />;

  if (phase === "ditolak" || phase === "tanpa-kamera" || !supported) {
    const denied = phase === "ditolak";
    return <>
      <ScreenContent>
        <Result icon={denied ? <CameraOff /> : <QrCode />} headline title={denied ? t("absen.deniedTitle") : t("absen.noCameraTitle")}
          body={denied ? t("absen.deniedBody") : t("absen.noCameraBody")} />
      </ScreenContent>
      <ActionBar>
        <div className={css.stackActions}>
          {denied && <Button block icon={<RefreshCw />} onClick={() => { setPhase("kamera"); setAttempt(value => value + 1); }}>{t("shell.retry")}</Button>}
          <Button block variant={denied ? "text" : "primary"} onClick={() => setContactOpen(true)}>{t("absen.contactTitle")}</Button>
        </div>
      </ActionBar>
      {sheet}
    </>;
  }

  return <>
    <ShellChrome hideTopBar hideNav />
    <AbsenQueue />
    <section className={css.scan} aria-label={t("absen.scanRegion")}>
      <div className={css.scanBar}>
        <IconButton icon={<X />} label={t("ui.close")} variant="tonal" onClick={close} />
        <h1 className={css.scanTitle}>{t("absen.title")}</h1>
        {torch !== null
          ? <IconButton icon={<Flashlight />} label={torch ? t("absen.torchOff") : t("absen.torchOn")} variant="tonal" pressed={torch} onClick={() => void toggleTorch()} />
          : <span />}
      </div>
      {!online && <Banner tone="offline" className={css.scanBanner}>{t("absen.offlineBanner")}</Banner>}
      <div className={css.scanBody}>
        <div className={css.viewfinder}>
          {!preview && <video ref={video} className={css.scanVideo} muted playsInline aria-hidden />}
          <div className={`${css.frame} ${found ? css.frameOk : ""}`} aria-hidden>
            <span className={css.corner} /><span className={css.corner} /><span className={css.corner} /><span className={css.corner} />
            {!found && <span className={css.scanLine} />}
          </div>
        </div>
        <p className={css.scanHint}>{t("absen.hint")}</p>
      </div>
      <div className={css.scanFoot}>
        <div role="alert" className={css.scanToast}>{refused && <ToastPreview tone="error" text={t("absen.notWamQr")} />}</div>
        <button type="button" className={css.scanLink} onClick={() => setContactOpen(true)}>{t("absen.unreadable")}</button>
        {current && <div className={css.scanCard}>
          <p className={css.scanCardTitle}>{current.title}</p>
          <p className={css.scanCardSub}>{[current.place, t("absen.until", { time: current.until })].filter(Boolean).join(" · ")}</p>
        </div>}
      </div>
    </section>
    {sheet}
  </>;
}
