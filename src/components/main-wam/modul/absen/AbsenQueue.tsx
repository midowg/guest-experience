"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/main-wam/ui";
import { flushQueue, loadQueue } from "./queue";

/**
 * Sends scans queued offline as soon as there is signal: when this mounts, when the phone comes
 * back online, and when the app comes back to the front. Tells the person in a toast. Renders
 * nothing. Mounted by the Absen screens and Detail sesi's Absen card; the app's frame may mount it
 * too, so a queued scan goes out wherever the person is.
 */
export function AbsenQueue({ onSent }: { onSent?: (titles: string[]) => void }) {
  const toast = useToast();
  const sent = useRef(onSent);
  useEffect(() => { sent.current = onSent; });
  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!navigator.onLine || !loadQueue().length) return;
      const done = await flushQueue();
      const recorded = done.filter(item => item.outcome.kind === "tercatat" || item.outcome.kind === "sudah");
      if (!alive || !done.length) return;
      if (recorded.length) toast.show({ text: recorded.length === 1 ? "Absen terkirim" : `${recorded.length} absen terkirim`, sub: recorded.map(item => "session" in item.outcome ? item.outcome.session.title : "").filter(Boolean).join(", "), tone: "success" });
      else toast.show({ text: "Absen belum tercatat", sub: "Buka Absen untuk melihat alasannya.", tone: "error" });
      sent.current?.(done.map(item => item.scan.title));
    };
    void run();
    const onVisible = () => { if (document.visibilityState === "visible") void run(); };
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; window.removeEventListener("online", run); document.removeEventListener("visibilitychange", onVisible); };
  }, [toast]);
  return null;
}
