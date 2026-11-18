"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { cx } from "./Pressable";
import css from "./toast.module.css";

export type ToastTone = "success" | "error" | "info" | "plain";

export type ToastInput = {
  /** One short sentence ("Absen tercatat · 07.55", "Terkirim"). Never cut: keep it short. */
  text: ReactNode;
  /** A second, quieter line. */
  sub?: ReactNode;
  tone?: ToastTone;
  /** One text action ("Batalkan", "Urungkan"). Pressing it runs onAction and closes the toast. */
  action?: { label: string; onAction: () => void };
  /** A second text action, before the first ("Lihat" beside "Batalkan"). Same rules; the two sit on their own row under the text. */
  secondary?: { label: string; onAction: () => void };
  /** Shown time in ms. Default 4000, 6000 with an action (DS §6.6). */
  duration?: number;
  /** Show the shrinking time line (the undo window: "Terkirim · Batalkan", 5 s). */
  timer?: boolean;
  /** A small picture at the start (the photo just sent). */
  thumb?: ReactNode;
  /** The time ran out without the action: commit what the action would have undone. */
  onTimeout?: () => void;
};

type Shown = ToastInput & { id: number };
type Api = { show: (toast: ToastInput) => number; dismiss: (id: number) => void };

const ToastContext = createContext<Api | null>(null);
const MAX_SHOWN = 3;

/**
 * Toasts for the whole app (DS #38). The shell provides it once; screens call useToast().show().
 * Short confirmations only: an error that needs action is a Banner. The time pauses while a finger
 * or the pointer is on the toast or its button has focus (WCAG 2.2.1), so "Batalkan" can be
 * reached; the remaining time then continues. Read out politely; errors interrupt.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [toasts, setToasts] = useState<Shown[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts(list => list.filter(toast => toast.id !== id)), []);
  const show = useCallback((toast: ToastInput) => {
    const id = next.current++;
    setToasts(list => [...list, { ...toast, id }].slice(-MAX_SHOWN));
    return id;
  }, []);
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  return <ToastContext.Provider value={api}>
    {children}
    {/* Always present, so a toast added to it is announced. */}
    <div className={css.viewport} role="region" aria-label={t("ui.notices")}>
      <div role="status" aria-live="polite">{toasts.filter(toast => toast.tone !== "error").map(toast => <ToastItem key={toast.id} toast={toast} onDone={dismiss} />)}</div>
      <div role="alert">{toasts.filter(toast => toast.tone === "error").map(toast => <ToastItem key={toast.id} toast={toast} onDone={dismiss} />)}</div>
    </div>
  </ToastContext.Provider>;
}

const noop: Api = {
  show: () => { if (process.env.NODE_ENV !== "production") console.warn("[Main WAM] useToast di luar ToastProvider"); return 0; },
  dismiss: () => {},
};

/** show(toast) → id; dismiss(id). Outside a ToastProvider it does nothing (and warns in development). */
export function useToast(): Api {
  return useContext(ToastContext) ?? noop;
}

function ToastItem({ toast, onDone }: { toast: Shown; onDone: (id: number) => void }) {
  const duration = toast.duration ?? (toast.action || toast.secondary ? 6000 : 4000);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const paused = hover || focus;
  const remaining = useRef(duration);
  const startedAt = useRef(0);
  const handled = useRef(false);
  const latest = useRef(toast);
  useEffect(() => { latest.current = toast; });

  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    const timer = window.setTimeout(() => {
      if (handled.current) return;
      handled.current = true;
      latest.current.onTimeout?.();
      onDone(latest.current.id);
    }, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused, onDone]);

  const Icon = toast.tone === "success" ? CircleCheck : toast.tone === "error" ? CircleAlert : toast.tone === "info" ? Info : null;
  const style = { "--mw-toast-ms": `${duration}ms`, "--mw-toast-steps": Math.max(1, Math.round(duration / 1000)) } as CSSProperties;

  const run = (action: { onAction: () => void }) => {
    if (handled.current) return;
    handled.current = true;
    action.onAction();
    onDone(toast.id);
  };
  return <div className={cx(css.toast, toast.tone && toast.tone !== "plain" && css[toast.tone], paused && css.paused, toast.secondary && css.two)} style={style}
    onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} onFocus={() => setFocus(true)}
    onBlur={event => {
      // Focus moving between parts of the same toast keeps it paused.
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
      setFocus(false);
    }}>
    {toast.thumb ? <span className={css.thumb} aria-hidden>{toast.thumb}</span> : Icon && <Icon aria-hidden />}
    <span className={css.text}>{toast.text}{toast.sub && <span className={css.sub}>{toast.sub}</span>}</span>
    {(toast.action || toast.secondary) && <span className={css.actions}>
      {toast.secondary && <button type="button" className={css.action} onClick={() => run(toast.secondary!)}>{toast.secondary.label}</button>}
      {toast.action && <button type="button" className={css.action} onClick={() => run(toast.action!)}>{toast.action.label}</button>}
    </span>}
    {toast.timer && <span className={css.timer} aria-hidden />}
  </div>;
}

/** A toast drawn in place, without a provider or timer: for the gallery and static previews. */
export function ToastPreview({ text, sub, tone = "plain", actionLabel, secondaryLabel, thumb, timerLeft }: {
  text: ReactNode; sub?: ReactNode; tone?: ToastTone; actionLabel?: string; secondaryLabel?: string; thumb?: ReactNode;
  /** 0–1: how much of the time line is left. */
  timerLeft?: number;
}) {
  const Icon = tone === "success" ? CircleCheck : tone === "error" ? CircleAlert : tone === "info" ? Info : null;
  return <div className={cx(css.toast, tone !== "plain" && css[tone], secondaryLabel && css.two)}>
    {thumb ? <span className={css.thumb} aria-hidden>{thumb}</span> : Icon && <Icon aria-hidden />}
    <span className={css.text}>{text}{sub && <span className={css.sub}>{sub}</span>}</span>
    {(actionLabel || secondaryLabel) && <span className={css.actions}>
      {secondaryLabel && <button type="button" className={css.action}>{secondaryLabel}</button>}
      {actionLabel && <button type="button" className={css.action}>{actionLabel}</button>}
    </span>}
    {timerLeft !== undefined && <span className={css.timer} style={{ animation: "none", transform: `scaleX(${timerLeft})` }} aria-hidden />}
  </div>;
}
