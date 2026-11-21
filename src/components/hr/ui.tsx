"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { FACE_MATCH, matchPercent } from "@/lib/hr/face-match";
import { dayLinePercent } from "@/lib/hr/history";
import { useCopy } from "./lang";
import styles from "./app.module.css";
import flow from "./absen.module.css";

/*
 * WG People's building blocks (21 Nov 2026): the large title of a tab root, the bar of a detail
 * screen, sheets and the small question from the bottom (both modal: the app behind is inert, focus
 * moves in and comes back, Escape closes), grouped rows, choices, the segmented control, the status
 * word, the empty state and the face-match meter. Apple HIG shapes; styles in app.module.css.
 */

/** Where sheets and questions are drawn: HrFrame's layer beside the page and the menu (inline when there is none, as in tests). */
const noSubscribe = () => () => undefined;
function useLayer(): HTMLElement | null {
  return useSyncExternalStore(noSubscribe, () => document.getElementById("wg-layer"), () => null);
}
function Layer({ children }: { children: ReactNode }) {
  const host = useLayer();
  return host ? createPortal(children, host) : <>{children}</>;
}

/**
 * While a sheet or a question is open: the page and the bottom menu are inert (Tab and screen readers
 * stay inside), Escape closes, and focus goes back to what opened it.
 */
function useModal(onEscape: (() => void) | null) {
  const escape = useRef(onEscape);
  useEffect(() => { escape.current = onEscape; });
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const behind = ["wg-main", "wg-nav"].map(id => document.getElementById(id)).filter((element): element is HTMLElement => Boolean(element));
    behind.forEach(element => element.setAttribute("inert", ""));
    const root = document.documentElement, overflow = root.style.overflow;
    root.style.overflow = "hidden";
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && escape.current) { event.preventDefault(); escape.current(); } };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      behind.forEach(element => element.removeAttribute("inert"));
      root.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
}

/** A tab root's own title in the page (no bar): a line above, the title, a line below, one action on the right. */
export function LargeHead({ title, eyebrow, lead, action }: { title: ReactNode; eyebrow?: ReactNode; lead?: ReactNode; action?: ReactNode }) {
  return <header className={styles.head}>
    <div className={styles.headText}>
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <h1 className={styles.largeTitle}>{title}</h1>
      {lead && <p className={styles.lead}>{lead}</p>}
    </div>
    {action}
  </header>;
}

type Lead = { kind: "back"; onClick(): void } | { kind: "close"; onClick(): void } | { kind: "cancel"; onClick(): void };
function BarLead({ lead }: { lead: Lead | null }) {
  const { t } = useCopy();
  if (!lead) return <span className={styles.barLead} />;
  return <span className={styles.barLead}>{lead.kind === "back"
    ? <button type="button" className={styles.barIcon} aria-label={t.common.back} onClick={lead.onClick}><ChevronLeft size={26} aria-hidden /></button>
    : lead.kind === "close"
      ? <button type="button" className={styles.barIcon} aria-label={t.common.close} onClick={lead.onClick}><X size={22} aria-hidden /></button>
      : <button type="button" className={styles.barText} onClick={lead.onClick}>{t.common.cancel}</button>}</span>;
}

/** A detail screen: its bar (back, title, one action) and what is in it. The bottom menu stays; focus starts at the title. */
export function Detail({ title, onBack, action, children }: { title: string; onBack(): void; action?: ReactNode; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  return <div className={styles.detail}>
    <div className={styles.bar}>
      <BarLead lead={{ kind: "back", onClick: onBack }} />
      <h1 ref={heading} tabIndex={-1} className={styles.barTitle}>{title}</h1>
      <span className={styles.barTrail}>{action}</span>
    </div>
    {children}
  </div>;
}

/**
 * A sheet for a task (a form, the camera): its bar with Batal on the left (none while something is
 * being sent) and at most one action on the right, over the dimmed app. A new step (`step`) brings
 * focus back to the top of the sheet.
 */
export function Sheet({ title, lead, action, step, children }: { title: string; lead: Lead | null; action?: ReactNode; step?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModal(lead?.onClick ?? null);
  useEffect(() => { box.current?.focus({ preventScroll: true }); }, [step]);
  return <Layer>
    <div className={styles.scrimSheet} aria-hidden />
    <div ref={box} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <div className={styles.sheetBar}>
        <BarLead lead={lead} />
        <h2 id={titleId} className={styles.barTitle}>{title}</h2>
        <span className={styles.barTrail}>{action}</span>
      </div>
      <div className={styles.sheetBody}><div className={styles.sheetInner}>{children}</div></div>
    </div>
  </Layer>;
}

/** A small question from the bottom, like an action sheet: what will happen, the one action, Batal (focused first). */
export function Ask({ title, message, action, danger = false, onAction, onCancel }: { title: string; message?: string; action: string; danger?: boolean; onAction(): void; onCancel(): void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  const messageId = useId();
  const { t } = useCopy();
  useModal(onCancel);
  useEffect(() => { cancel.current?.focus({ preventScroll: true }); }, []);
  return <Layer>
    <div className={styles.scrim} onClick={event => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className={styles.ask} role="alertdialog" aria-modal="true" aria-label={title} aria-describedby={message ? messageId : undefined}>
        <div className={styles.askCard}>
          <p className={styles.askText}><strong>{title}</strong>{message && <span id={messageId}>{message}</span>}</p>
          <button type="button" className={danger ? `${styles.askButton} ${styles.askDanger}` : styles.askButton} onClick={onAction}>{action}</button>
        </div>
        <button ref={cancel} type="button" className={`${styles.askButton} ${styles.askCancel}`} onClick={onCancel}>{t.common.cancel}</button>
      </div>
    </div>
  </Layer>;
}

/** A choice from the bottom, like an action sheet: a title, a few rows (each with a line under it), Batal. */
export function Pick<T extends string>({ title, options, onPick, onCancel }: { title: string; options: { value: T; label: string; sub?: string }[]; onPick(value: T): void; onCancel(): void }) {
  const first = useRef<HTMLButtonElement>(null);
  const { t } = useCopy();
  useModal(onCancel);
  useEffect(() => { first.current?.focus({ preventScroll: true }); }, []);
  return <Layer>
    <div className={styles.scrim} onClick={event => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className={styles.ask} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.askCard}>
          <p className={styles.askText}><strong>{title}</strong></p>
          {options.map((option, index) => <button key={option.value} ref={index === 0 ? first : undefined} type="button" className={`${styles.askButton} ${styles.pickButton}`} onClick={() => onPick(option.value)}>
            <span>{option.label}</span>{option.sub && <small>{option.sub}</small>}
          </button>)}
        </div>
        <button type="button" className={`${styles.askButton} ${styles.askCancel}`} onClick={onCancel}>{t.common.cancel}</button>
      </div>
    </div>
  </Layer>;
}

/** Things said to screen readers (a sent request, a result) and the short message shown above the menu; a problem stays until closed. */
export function Notices({ spoken, toast, onClose }: { spoken: string; toast: { text: string; problem: boolean } | null; onClose(): void }) {
  const { t } = useCopy();
  return <Layer>
    <p className={styles.srOnly} role="status" aria-live="polite">{spoken}</p>
    {toast && <div className={styles.toast}>
      <span aria-hidden>{toast.text}</span>
      {toast.problem && <button type="button" className={styles.toastClose} aria-label={t.common.closeMessage} onClick={onClose}><X size={18} aria-hidden /></button>}
    </div>}
  </Layer>;
}

/** A labelled group of rows, like a settings list. */
export function Group({ label, note, icons = false, children }: { label?: string; note?: ReactNode; icons?: boolean; children: ReactNode }) {
  const labelId = useId();
  return <section className={styles.group} aria-labelledby={label ? labelId : undefined}>
    {label && <h2 id={labelId} className={styles.groupLabel}>{label}</h2>}
    <ul className={icons ? `${styles.list} ${styles.iconList}` : styles.list}>{children}</ul>
    {note && <p className={styles.groupNote}>{note}</p>}
  </section>;
}

type RowParts = { icon?: ReactNode; title: ReactNode; sub?: ReactNode; value?: ReactNode; trailing?: ReactNode; lead?: ReactNode };
function RowInside({ icon, lead, title, sub, value, trailing }: RowParts) {
  return <>
    {icon && <span className={styles.rowIcon} aria-hidden>{icon}</span>}
    {lead}
    <span className={styles.rowText}><span className={styles.rowTitle}>{title}</span>{sub && <span className={styles.rowSub}>{sub}</span>}</span>
    {value != null && <span className={styles.rowValue}>{value}</span>}
    {trailing}
  </>;
}
/** One row that opens something (a chevron at the end) or does something (no chevron). `mark` finds it again when coming back. */
export function RowButton({ onClick, chevron = true, danger = false, mark, ...parts }: RowParts & { onClick(): void; chevron?: boolean; danger?: boolean; mark?: string }) {
  return <li><button type="button" className={danger ? `${styles.row} ${styles.destructive}` : styles.row} onClick={onClick} data-mark={mark}>
    <RowInside {...parts} />
    {chevron && <ChevronRight size={18} className={styles.chevron} aria-hidden />}
  </button></li>;
}
/** One row that only tells: a quiet name and its value. */
export function RowInfo(parts: RowParts) {
  return <li><div className={`${styles.row} ${styles.info}`}><RowInside {...parts} /></div></li>;
}

/** One choice among a few, as rows with a check (the iOS form way); a real radio underneath. */
export function Choices<T extends string>({ label, name, options, value, onChange }: { label: string; name: string; options: { value: T; label: ReactNode; sub?: ReactNode }[]; value: T | null; onChange(value: T): void }) {
  const labelId = useId();
  return <section className={styles.group} role="radiogroup" aria-labelledby={labelId}>
    <h3 id={labelId} className={styles.groupLabel}>{label}</h3>
    <ul className={styles.list}>{options.map(option => <li key={option.value}>
      <label className={`${styles.row} ${styles.choice}`}>
        <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
        <span className={styles.rowText}><span className={styles.rowTitle}>{option.label}</span>{option.sub && <span className={styles.rowSub}>{option.sub}</span>}</span>
        {value === option.value && <Check size={20} className={styles.check} aria-hidden />}
      </label>
    </li>)}</ul>
  </section>;
}

/**
 * A segmented control: two or three views of the same list. A count sits in a small badge after its
 * label (21 Nov 2026, the owner's ask); `alert` marks a count that needs the person (Needs review).
 */
export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string; count?: number; unit?: string; alert?: boolean }[]; value: T; onChange(value: T): void }) {
  return <div className={styles.segmented} role="group" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" className={styles.segment} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
      {option.label}{option.count != null && <><span className={styles.segmentCount} data-alert={(option.alert && option.count > 0) || undefined} data-zero={option.count === 0 || undefined}>{option.count}</span>{option.unit && <span className={styles.srOnly}> {option.unit}</span>}</>}
    </button>)}
  </div>;
}

/** "Nothing here": a quiet icon, a title, one line. */
export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return <div className={styles.empty}>{icon}<strong>{title}</strong>{children && <span>{children}</span>}</div>;
}

/** Words for screen readers only. */
export const SrOnly = ({ children }: { children: ReactNode }) => <span className={styles.srOnly}>{children}</span>;

/** A status as a word with its mark; `badge` sets it in a small tinted pill (under a row's text). */
export function StatusWord({ tone, badge = false, children }: { tone: string; badge?: boolean; children: ReactNode }) {
  return <span className={`${styles.status} ${styles[`status_${tone}`] ?? ""} ${badge ? styles.statusBadge : ""}`}>{children}</span>;
}

/** How close the face was to the reference, against where "cocok" starts (about 76%). */
export function MatchMeter({ score }: { score: number }) {
  const { t } = useCopy();
  const percent = matchPercent(score), at = matchPercent(FACE_MATCH.cocok);
  return <div className={flow.meter}>
    <p className={flow.meterTop}><span>{t.meter.label}</span><strong>{percent}%</strong></p>
    <div className={flow.meterBar} role="img" aria-label={t.meter.aria(percent, at)}>
      <div className={percent >= at ? flow.meterFill : `${flow.meterFill} ${flow.meterFillLow}`} style={{ width: `${percent}%` }} />
      <span className={flow.meterMark} style={{ left: `${at}%` }} />
    </div>
    <p className={flow.meterNote}>{t.meter.note(at)}</p>
  </div>;
}

/** "Dita Contoh" → "DC", for the round mark with the name. */
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "?";

/**
 * The time card, WG People's signature (21 Nov 2026): a blue stub on top, a perforation with a notch
 * on each side, and a white part below, like a stamped kartu absen. Beranda's today and the receipt.
 */
export function Ticket({ label, stub, children }: { label: string; stub: ReactNode; children: ReactNode }) {
  return <section className={styles.ticket} aria-label={label}>
    <div className={styles.ticketStub}>{stub}</div>
    <div className={styles.ticketCut} aria-hidden />
    <div className={styles.ticketPart}>{children}</div>
  </section>;
}

/**
 * The day line (06.00–22.00, in minutes of the day): when the work ran (masuk to pulang, or to now)
 * as a bar, and the sun at the time it is now. Only a picture: what it shows is said in words beside it.
 */
export function DayLine({ start = null, end = null, now = null, tone = "plain", labels = false, thin = false }: {
  start?: number | null; end?: number | null; now?: number | null; tone?: "brand" | "plain"; labels?: boolean; thin?: boolean;
}) {
  const { t } = useCopy();
  const at = (minute: number) => dayLinePercent(minute);
  // Past midnight (a late shift) the end is on the next day: it runs to the end of the line.
  const from = start == null ? null : at(start), to = end == null || start == null ? null : at(end < start ? end + 24 * 60 : end);
  return <span className={styles.dayLine} data-tone={tone} data-thin={thin || undefined} aria-hidden>
    <span className={styles.dayTrack}>
      {from != null && to != null && <span className={styles.daySpan} style={{ left: `min(${from}%, calc(100% - 6px))`, width: `max(6px, ${Math.max(0, to - from)}%)` }} />}
      {from != null && to == null && <span className={styles.dayPin} style={{ left: `${from}%` }} />}
      {now != null && <span className={styles.daySun} style={{ left: `${at(now)}%` }} />}
    </span>
    {labels && <span className={styles.dayLabels}>{t.dayLabels.map(label => <span key={label}>{label}</span>)}</span>}
  </span>;
}
