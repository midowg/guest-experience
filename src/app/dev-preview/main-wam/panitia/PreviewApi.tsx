"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useToast, type ToastInput } from "@/components/main-wam/ui";
import { PanitiaApiContext, type PanitiaApi } from "@/components/main-wam/panitia/api";
import type { AttendeeRow } from "@/lib/main-wam/panitia/attendance";

/*
 * Dev-preview only: a stand-in for the panitia API, so every button can be pressed without a
 * server (answers after a short wait, like a phone on hotel Wi-Fi). `toast` shows one toast on load,
 * for a status that is a toast in the prototype.
 */
const wait = () => new Promise(resolve => setTimeout(resolve, 350));

export function PreviewApi({ rows = [], toast, children }: { rows?: AttendeeRow[]; toast?: ToastInput; children: ReactNode }) {
  const store = useRef(rows);
  const toasts = useToast();
  const api = useMemo<PanitiaApi>(() => ({
    changeSession: async (_id, input) => { await wait(); return { changed: 1, notified: input.notify, recipients: input.notify ? 122 : 0, versions: {} }; },
    silent: async () => { await wait(); },
    attendance: async () => ({ rows: store.current }),
    setPresent: async (_sessionId, input) => {
      await wait();
      store.current = store.current.map(row => row.id !== input.employeeId ? row : input.present ? { ...row, checkedInAt: new Date().toISOString(), method: "manual" } : { ...row, checkedInAt: null, method: null });
      return { rows: store.current };
    },
    announce: async () => { await wait(); return { count: 122 }; },
    unpin: async () => { await wait(); },
    removeAnnouncement: async () => { await wait(); },
    moderate: async () => { await wait(); },
    refresh: () => undefined,
    navigate: () => undefined,
  }), []);
  const shown = useRef(false);
  useEffect(() => {
    if (toast && !shown.current) { shown.current = true; toasts.show({ duration: 600_000, ...toast }); }
  }, [toast, toasts]);
  return <PanitiaApiContext.Provider value={api}>{children}</PanitiaApiContext.Provider>;
}
