import type { CSSProperties, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import css from "./console.module.css";
import { SegmentedControl } from "./SectionToolbar";
import type { ConsoleTone } from "./types";

/** Hours as decimals: 9.5 is 09.30. */
export type TimelineBlock = { key: string; title: string; sub?: string; start: number; end: number; tone?: ConsoleTone; href?: string };
export type TimelineRow = { key: string; label: string; sub?: string; blocks: readonly TimelineBlock[] };
export type TimelineRange = "hari" | "minggu";

/** 9.5 → "09.30". */
export function hourLabel(hours: number): string {
  let whole = Math.floor(hours);
  let minutes = Math.round((hours - whole) * 60);
  if (minutes === 60) { whole += 1; minutes = 0; }
  return `${String(whole).padStart(2, "0")}.${String(minutes).padStart(2, "0")}`;
}

/** A block shorter than this many hours shows its title only. */
const NARROW = 1;

/**
 * A day as rows (rooms or activities) against hour columns from `from` to `to`. Each block is placed
 * by its hours and is readable text, its times written out for screen readers. On a narrow screen
 * the grid scrolls sideways inside the card. `now` (decimal hours) draws a red line.
 */
export function DayTimeline({ title, titleHref, date, rows, from = 9, to = 18, now, range, headingLevel = 2, empty = "Belum ada jadwal." }: {
  title: ReactNode;
  titleHref?: string;
  /** A line beside the title, e.g. "Kamis, 5 November". */
  date?: ReactNode;
  rows: readonly TimelineRow[];
  from?: number;
  to?: number;
  now?: number;
  /** Hari or Minggu: links (`hrefs`) or a callback. */
  range?: { value: TimelineRange; onChange?: (value: TimelineRange) => void; hrefs?: Record<TimelineRange, string> };
  headingLevel?: 2 | 3;
  empty?: ReactNode;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const span = Math.max(1, to - from);
  const hours = Array.from({ length: span + 1 }, (_, index) => from + index);
  const percent = (value: number) => `${((Math.min(Math.max(value, from), to) - from) / span) * 100}%`;
  const showNow = now != null && now >= from && now <= to;
  const gridStyle = { "--hours": span } as CSSProperties;

  return <section className={css.card}>
    <div className={css.timelineHead}>
      <div className={css.timelineHeadText}>
        <Heading className={css.cardTitle}>{titleHref ? <a href={titleHref}>{title}<ChevronRight size={18} aria-hidden="true" /></a> : title}</Heading>
        {date && <span className={css.timelineDate}>{date}</span>}
      </div>
      {range && <SegmentedControl label="Rentang" value={range.value} onChange={range.onChange} options={[
        { value: "hari", label: "Hari", href: range.hrefs?.hari },
        { value: "minggu", label: "Minggu", href: range.hrefs?.minggu },
      ]} />}
    </div>
    {rows.length === 0 ? <p className={css.timelineEmpty}>{empty}</p> : <div className={css.timelineScroll}>
      <div className={css.timelineGrid} style={gridStyle}>
        {showNow && <>
          <span className={css.nowLine} aria-hidden="true" style={{ left: `calc(var(--label) + (100% - var(--label)) * ${(now - from) / span})` }} />
          <p className="sr-only">Sekarang pukul {hourLabel(now)}</p>
        </>}
        <ul className={css.timelineRows}>{rows.map(row => {
          const blocks = row.blocks.filter(block => block.end > from && block.start < to && block.end > block.start);
          return <li key={row.key} className={css.timelineRow}>
            <span className={css.timelineLabel}><span>{row.label}</span>{row.sub && <span>{row.sub}</span>}</span>
            <ul className={css.timelineTrack} aria-label={blocks.length ? row.label : `${row.label}: kosong`}>
              {blocks.map(block => {
                const style = { left: percent(block.start), width: `calc(${percent(block.end)} - ${percent(block.start)})` } as CSSProperties;
                const content = <>
                  <span className={css.blockTitle}>{block.title}</span>
                  <span className="sr-only">, {hourLabel(block.start)}–{hourLabel(block.end)}</span>
                  {block.sub && <span className={css.blockSub}>{block.sub}</span>}
                </>;
                const props = { className: `${css.block} ${css.toned}`, "data-tone": block.tone ?? "blue", "data-narrow": block.end - block.start < NARROW ? "true" : undefined, style, title: `${block.title} · ${hourLabel(block.start)}–${hourLabel(block.end)}` };
                return <li key={block.key}>{block.href ? <a href={block.href} {...props}>{content}</a> : <span {...props}>{content}</span>}</li>;
              })}
            </ul>
          </li>;
        })}</ul>
        <div className={css.timelineHours} aria-hidden="true">
          {hours.map(hour => <span key={hour} className={css.hour} style={{ left: percent(hour) }}>{hourLabel(hour)}</span>)}
        </div>
      </div>
    </div>}
  </section>;
}
