import { ChevronRight, Images } from "lucide-react";
import { Words } from "@/components/main-wam/i18n";
import { Card, EyebrowLabel, Pill, PulseDot } from "@/components/main-wam/ui";
import { number, t } from "@/lib/main-wam/i18n";
import { mosaicPercent } from "@/lib/main-wam/momen/mosaic";
import { mainWamPath } from "@/lib/routes";
import type { MainWamContext } from "@/lib/server/main-wam/gate";
import { readLang } from "@/lib/server/main-wam/lang";
import { mosaicSummary, type MosaicSummary } from "@/lib/server/main-wam/momen/mosaic";
import css from "./beranda-mozaik.module.css";

/**
 * P01: the Mozaik WAM 2026 card on Beranda (module Mozaik; the page only calls it while the module
 * is on). SLOT after the Momen card, owner agen B: a preview of the mosaic (the event's letters, the
 * cells that already hold a photo lit), "842 dari 1.200 foto · 8 fotomu", a progress bar; a tap opens
 * the Mozaik page. Theme tokens only (no fixed dark colours). Hidden while the mosaic is not ready.
 */
export async function BerandaMozaik({ context, now }: { context: MainWamContext; now: Date }) {
  const summary = await mosaicSummary(context, now).catch(() => null);
  if (!summary?.migrated) return null;
  const lang = await readLang();
  return <MozaikCard summary={summary}
    title={t(lang, "momen.mos.title", { name: context.settings.event.name })}
    filled={number(lang, summary.filled)}
    rest={[t(lang, "momen.moz.of", { total: number(lang, summary.total) }), summary.mine > 0 ? t(lang, "momen.moz.mine", { n: number(lang, summary.mine) }) : ""].filter(Boolean).join(" · ")} />;
}

/** The card itself (also for previews). `filled` and `rest` are already in the language's number style. */
export function MozaikCard({ summary, title, filled, rest }: { summary: MosaicSummary; title: string; filled: string; rest: string }) {
  const percent = mosaicPercent(summary.filled, summary.total);
  return <Card href={mainWamPath.mosaic()} className={css.card}>
    <span className={css.head}>
      <Pill icon={<Images />}>{title}</Pill>
      <EyebrowLabel tone="gold" className={css.live}><PulseDot /><Words k="momen.card.live" /></EyebrowLabel>
    </span>
    <MosaicPreview summary={summary} />
    <span className={css.foot}>
      <span className={css.counts}><b className={css.figure}>{filled}</b><span className={css.rest}>{rest}</span></span>
      <ChevronRight aria-hidden className={css.chevron} />
    </span>
    <span className={css.bar} aria-hidden><i style={{ width: `${percent}%` }} /></span>
  </Card>;
}

/** The mosaic in small: the letters' cells, lit where a photo already is; cropped to the letters (one cell around). Decorative. */
export function MosaicPreview({ summary }: { summary: Pick<MosaicSummary, "columns" | "rows" | "cells" | "filledCells"> }) {
  const { columns, rows, cells } = summary;
  const lit = new Set(summary.filledCells);
  let left = columns, top = rows, right = -1, bottom = -1;
  const on: string[] = [];
  const off: string[] = [];
  for (let index = 0; index < columns * rows; index++) {
    if ((cells[index] ?? ".") === ".") continue;
    const x = index % columns, y = Math.floor(index / columns);
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    (lit.has(index) ? on : off).push(`M${x} ${y}h.86v.86h-.86z`);
  }
  if (right < 0) { left = 0; top = 0; right = columns - 1; bottom = rows - 1; }
  const box = `${left - 1} ${top - 1} ${right - left + 3} ${bottom - top + 3}`;
  return <svg className={css.preview} viewBox={box} preserveAspectRatio="xMidYMid meet" aria-hidden focusable="false">
    <path className={css.off} d={off.join("")} />
    <path className={css.on} d={on.join("")} />
  </svg>;
}
