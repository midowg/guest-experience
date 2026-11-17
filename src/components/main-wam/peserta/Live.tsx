"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CloudOff, RotateCw } from "lucide-react";
import { untilLabel } from "@/lib/main-wam/peserta/format";
import { REFRESH_JITTER_MS, refreshDelay } from "@/lib/main-wam/peserta/refresh";
import { Banner, Button, EmptyState } from "@/components/main-wam/ui";

/*
 * The small live parts of agen A's screens: the offline banner, the "20 menit lagi" that keeps
 * counting, a refresh when Beranda changes by itself, and "Coba lagi" after a failed read.
 */

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => { window.removeEventListener("online", onChange); window.removeEventListener("offline", onChange); };
};

/** True while the phone says it is offline (navigator.onLine is only trusted when it says false). */
export function useOffline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine === false, () => false);
}

/** "Offline. Data terakhir 07.38." under the head (P01__status, P03__status). `force` for previews. */
export function OfflineBanner({ since, force }: { since: string; force?: boolean }) {
  const offline = useOffline();
  if (!offline && !force) return null;
  return <Banner tone="offline" icon={<CloudOff />}>Offline. Data terakhir {since}.</Banner>;
}

/**
 * "20 menit lagi", counted on: the server's words first (no mismatch on hydration), then every
 * 30 seconds from the server's clock moved on by the time passed here (the phone's own clock may be off).
 */
export function Until({ at, serverNow, initial }: { at: string; serverNow: string; initial: string }) {
  const [text, setText] = useState(initial);
  useEffect(() => {
    const offset = Date.parse(serverNow) - Date.now();
    const tick = () => setText(untilLabel(new Date(Date.now() + offset), at) ?? "");
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, [at, serverNow]);
  return <>{text}</>;
}

/**
 * Refreshes the screen once at `at` (a session starts, absen opens), when that is within 12 hours:
 * by the server's clock (`serverNow`, the phone's own may be off) and 0–20 seconds late at random,
 * so phones do not all ask at once (audit S6). Each refresh brings a new `serverNow`, which sets the
 * timer again even when `at` stays the same.
 */
export function RefreshAt({ at, serverNow }: { at: string | null; serverNow: string }) {
  const router = useRouter();
  useEffect(() => {
    const offset = Date.parse(serverNow) - Date.now();
    const wait = refreshDelay(at, offset, Date.now(), Math.random() * REFRESH_JITTER_MS);
    if (wait === null) return;
    const timer = window.setTimeout(() => router.refresh(), wait);
    return () => window.clearTimeout(timer);
  }, [at, serverNow, router]);
  return null;
}

/** A read that failed: say so, and "Coba lagi" reads again (the screen stays). */
export function RetryBanner({ children }: { children: string }) {
  const router = useRouter();
  return <Banner tone="error" action={{ label: "Coba lagi", onClick: () => router.refresh() }}>{children}</Banner>;
}

/** error.tsx body for agen A's screens: a friendly line and "Coba lagi". */
export function ScreenError({ reset }: { reset: () => void }) {
  const router = useRouter();
  return <EmptyState icon={<CloudOff />} title="Belum dapat dimuat"
    action={<Button variant="tonal" size="m" icon={<RotateCw />} onClick={() => { router.refresh(); reset(); }}>Coba lagi</Button>}>
    Periksa sinyal, lalu coba lagi.
  </EmptyState>;
}
