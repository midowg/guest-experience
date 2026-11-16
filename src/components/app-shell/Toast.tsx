"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import css from "./app-shell.module.css";

/*
 * One short message at the bottom (16 Nov 2026): what just happened, with "Urungkan" when the action
 * can be taken back. Reversible actions run at once and offer Urungkan instead of asking "yakin?".
 */

export type ToastTone = "ok" | "bad" | "info";
export type ToastInput = { message: string; tone?: ToastTone; action?: { label: string; run: () => void } };
type Shown = ToastInput & { id: number; leaving?: boolean };

const ToastContext = createContext<(toast: ToastInput) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Shown | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const next = useRef(1);
  const hide = useCallback(() => {
    setToast(current => current && { ...current, leaving: true });
    timer.current = setTimeout(() => setToast(null), 200);
  }, []);
  const show = useCallback((input: ToastInput) => {
    clearTimeout(timer.current);
    setToast({ ...input, id: next.current++ });
    timer.current = setTimeout(hide, input.action ? 6000 : 3500);
  }, [hide]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const Icon = toast?.tone === "bad" ? AlertTriangle : toast?.tone === "ok" ? CheckCircle2 : Info;
  return <ToastContext.Provider value={show}>
    {children}
    <div className={css.toastHost} role="status" aria-live="polite">
      {toast && <div key={toast.id} className={`${css.toast} ${toast.leaving ? css.toastLeaving : ""}`} data-tone={toast.tone ?? "info"}>
        <Icon size={20} aria-hidden="true" />
        <span className={css.toastText}>{toast.message}</span>
        {toast.action && <button type="button" className={css.toastAction} onClick={() => { const run = toast.action!.run; hide(); run(); }}>{toast.action.label}</button>}
      </div>}
    </div>
  </ToastContext.Provider>;
}
