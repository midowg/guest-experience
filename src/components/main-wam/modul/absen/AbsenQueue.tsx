"use client";

import { useEffect, useRef } from "react";
import { useKnown, useLang, useT } from "@/components/main-wam/i18n";
import { useToast } from "@/components/main-wam/ui";
import { outcomeText } from "@/lib/main-wam/modul/absen";
import { flushQueue, loadQueue, retryDelay, type FlushResult } from "./queue";

// Several AbsenQueue may be mounted at once (the frame and a screen); they share one flush, and only
// the first tells the person.
const told = new WeakSet<FlushResult>();

/**
 * Sends scans queued offline as soon as there is signal: when this mounts, when the phone comes
 * back online, when the app comes back to the front, and again with a growing pause while the
 * server cannot take them (audit T1). Tells the person in a toast: "Absen tercatat", "Belum
 * terkirim, dicoba lagi", or to sign in again. Renders nothing. Mounted by the Absen screens, Detail
 * sesi's Absen card and the app's frame, so a queued scan goes out wherever the person is.
 */
export function AbsenQueue({ onSent }: { onSent?: (titles: string[]) => void }) {
  const toast = useToast();
  const t = useT();
  const known = useKnown();
  const { lang } = useLang();
  const sent = useRef(onSent);
  useEffect(() => { sent.current = onSent; });
  useEffect(() => {
    let alive = true;
    let attempt = 0;
    let timer = 0;
    const run = async () => {
      window.clearTimeout(timer);
      if (!navigator.onLine || !loadQueue().length) return;
      const result = await flushQueue();
      if (!alive) return;
      if (result.kept && !result.login) {
        // Not taken now (busy, a hotel Wi-Fi's login page): try again later, by itself.
        timer = window.setTimeout(() => void run(), retryDelay(attempt));
        attempt += 1;
      } else attempt = 0;
      if (told.has(result)) return;
      told.add(result);
      const now = new Date();
      const recorded = result.sent.filter(item => item.outcome.kind === "tercatat" || item.outcome.kind === "sudah");
      const refused = [
        ...result.sent.filter(item => !recorded.includes(item)).map(item => outcomeText(item.outcome, now, lang).title),
        ...result.dropped.map(item => known(item.message)),
      ];
      if (recorded.length) {
        toast.show({ text: recorded.length === 1 ? t("absen.toastOne") : t("absen.toastMany", { n: recorded.length }), sub: recorded.map(item => "session" in item.outcome ? item.outcome.session.title : "").filter(Boolean).join(", "), tone: "success" });
      }
      if (refused.length) toast.show({ text: t("absen.toastRefused"), sub: refused[0], tone: "error" });
      if (result.login) {
        toast.show({ text: t("absen.toastLoginTitle"), sub: t("absen.toastLoginSub"), tone: "error", action: { label: t("absen.toastLoginAction"), onAction: () => window.location.reload() } });
      } else if (result.kept && attempt === 1) {
        toast.show({ text: t("absen.toastRetryTitle"), sub: t("absen.toastRetrySub"), tone: "info" });
      }
      if (result.sent.length || result.dropped.length) sent.current?.([...result.sent, ...result.dropped].map(item => item.scan.title));
    };
    void run();
    const onVisible = () => { if (document.visibilityState === "visible") void run(); };
    const onOnline = () => { attempt = 0; void run(); };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; window.clearTimeout(timer); window.removeEventListener("online", onOnline); document.removeEventListener("visibilitychange", onVisible); };
  }, [toast, t, known, lang]);
  return null;
}
