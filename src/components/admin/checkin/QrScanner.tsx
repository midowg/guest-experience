"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, CameraOff } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import styles from "@/components/admin/admin.module.css";
import { cameraProblem, canUseCamera, qrReader } from "@/lib/qr-detect";

const noSubscribe = () => () => {};

/** Whether this browser can scan with its camera (every browser with a camera: see qr-detect). */
export const canScanHere = canUseCamera;

/**
 * The back camera, read a few times a second. Each new value is reported once, then the scanner
 * rests briefly so one QR held in front of the camera is not sent twice.
 */
export function QrScanner({ onScan, paused }: { onScan: (text: string) => void; paused: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [error, setError] = useState("");
  const last = useRef({ text: "", at: 0 });
  // Known only in the browser; the server render assumes no scanner, so both renders agree.
  const supported = useSyncExternalStore(noSubscribe, canScanHere, () => false);
  // The loop reads the latest props without restarting the camera.
  const pausedRef = useRef(paused);
  const onScanRef = useRef(onScan);
  useEffect(() => { pausedRef.current = paused; onScanRef.current = onScan; }, [paused, onScan]);

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const read = await qrReader();
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (stopped || !video.current) return;
          if (!pausedRef.current && video.current.readyState >= 2) {
            const text = await read(video.current).catch(() => null);
            const now = Date.now();
            if (text && (text !== last.current.text || now - last.current.at > 4000)) {
              last.current = { text, at: now };
              onScanRef.current(text);
            }
          }
          timer = window.setTimeout(() => void tick(), 300);
        };
        void tick();
      } catch (problem) {
        setError(cameraProblem(problem, "Atau gunakan pencarian nama di bawah."));
        setOn(false);
      }
    })();
    return () => { stopped = true; window.clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()); };
  }, [on]);

  if (!supported) return <Notice>Browser ini belum bisa memindai langsung. Buka aplikasi <strong>Kamera</strong> ponsel dan arahkan ke QR tamu: tautannya membuka halaman konfirmasi check-in. Atau cari nama tamu di bawah.</Notice>;
  return <div className={styles.scanner}>
    {on && <video ref={video} className={styles.scannerVideo} muted playsInline aria-label="Kamera pemindai QR" />}
    <Button type="button" variant={on ? "secondary" : "primary"} onClick={() => { setError(""); setOn(!on); }}>
      {on ? <><CameraOff size={16} aria-hidden="true" /> Matikan kamera</> : <><Camera size={16} aria-hidden="true" /> Pindai QR tiket</>}
    </Button>
    {error && <Notice tone="error" role="alert">{error}</Notice>}
  </div>;
}
