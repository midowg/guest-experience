"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera } from "lucide-react";
import { cameraProblem, canUseCamera, qrReader } from "@/lib/qr-detect";
import { PRA_WAM_PATH } from "@/lib/routes";
import styles from "./akun.module.css";

const noSubscribe = () => () => {};

/**
 * Scan QR absen (Penpot "P12"): the back camera in a brass frame. A session QR holds a Pra WAM
 * address; anything else is refused here rather than opened, so a stray QR cannot send the person
 * to another site. Safari on iPhone has no QR reader of its own; jsQR reads the picture there.
 */
export function CheckInScanner() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = useSyncExternalStore(noSubscribe, canUseCamera, () => false);

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const handle = (text: string) => {
      let url: URL;
      try { url = new URL(text, window.location.origin); } catch { setError("QR ini bukan QR absen WAM."); return false; }
      if (url.origin !== window.location.origin || !url.pathname.startsWith(`${PRA_WAM_PATH}/check-in/`)) { setError("QR ini bukan QR absen WAM."); return false; }
      stopped = true;
      router.push(url.pathname);
      return true;
    };
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const read = await qrReader();
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (stopped || !video.current) return;
          if (video.current.readyState >= 2) {
            const text = await read(video.current).catch(() => null);
            if (text && handle(text)) return;
          }
          timer = window.setTimeout(() => void tick(), 300);
        };
        void tick();
      } catch (problem) {
        setError(cameraProblem(problem, "Atau pakai aplikasi Kamera ponsel."));
        setOn(false);
      }
    })();
    return () => { stopped = true; window.clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()); };
  }, [on, router]);

  return <div className={styles.scan}>
    <div className={styles.frame} aria-hidden={!on}>
      {on && <video ref={video} muted playsInline aria-label="Kamera pemindai QR" />}
      <span className={styles.corner} /><span className={styles.corner} /><span className={styles.corner} /><span className={styles.corner} />
      <span className={styles.line} />
    </div>
    <p className={styles.scanTitle}>Arahkan kamera ke QR yang ditempel di ruang</p>
    <p className={styles.scanSub}>Absen tercatat otomatis setelah kode terbaca.</p>
    {supported
      ? !on && <button type="button" className={styles.scanButton} onClick={() => { setError(null); setOn(true); }}><Camera size={18} aria-hidden /> Nyalakan kamera</button>
      : <p className={styles.scanSub}>Browser ini belum bisa memindai langsung. Buka aplikasi <strong>Kamera</strong> ponsel, arahkan ke QR, lalu buka tautannya.</p>}
    {error && <p className={styles.scanError} role="alert">{error}</p>}
    <p className={styles.scanFoot}>Kamera bermasalah? Minta panitia mencatat absen Anda.</p>
  </div>;
}
