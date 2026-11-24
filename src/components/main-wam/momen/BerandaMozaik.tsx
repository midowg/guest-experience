import { ChevronRight, Images } from "lucide-react";
import { Words } from "@/components/main-wam/i18n";
import { Card, EyebrowLabel, Pill, PulseDot } from "@/components/main-wam/ui";
import { number, t } from "@/lib/main-wam/i18n";
import { miniMosaic, mosaicPercent, mosaicText, paletteIndex } from "@/lib/main-wam/momen/mosaic";
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
  return <MozaikCard summary={summary} text={mosaicText(context.settings.event.name)}
    title={t(lang, "momen.mos.title", { name: context.settings.event.name })}
    filled={number(lang, summary.filled)}
    rest={[t(lang, "momen.moz.of", { total: number(lang, summary.total) }), summary.mine > 0 ? t(lang, "momen.moz.mine", { n: number(lang, summary.mine) }) : ""].filter(Boolean).join(" · ")} />;
}

/** The card itself (also for previews). `filled` and `rest` are already in the language's number style. */
export function MozaikCard({ summary, title, filled, rest, text }: { summary: MosaicSummary; title: string; filled: string; rest: string; text?: string }) {
  const percent = mosaicPercent(summary.filled, summary.total);
  return <Card href={mainWamPath.mosaic()} className={css.card}>
    <span className={css.head}>
      <Pill icon={<Images />}>{title}</Pill>
      <EyebrowLabel tone="gold" className={css.live}><PulseDot /><Words k="momen.card.live" /></EyebrowLabel>
    </span>
    <MosaicPreview summary={summary} text={text} />
    <span className={css.foot}>
      <span className={css.counts}><b className={css.figure}>{filled}</b><span className={css.rest}>{rest}</span></span>
      <ChevronRight aria-hidden className={css.chevron} />
    </span>
    <span className={css.bar} aria-hidden><i style={{ width: `${percent}%` }} /></span>
  </Card>;
}

/**
 * The mosaic in small (the prototype's mosaic(54, 9)): the event's text on ONE long line of a 54 × 9 grid, the letters' cells each
 * in a colour of the palette (full where a photo already is, pale where not), the cells around them a very faint grid.
 * Its own mapping (miniMosaic), apart from the big grid. Decorative.
 */
export function MosaicPreview({ summary, text }: { summary: Pick<MosaicSummary, "columns" | "rows" | "cells" | "filledCells">; text?: string }) {
  const mini = miniMosaic(summary, text);
  const off: string[] = [];
  const on: string[][] = Array.from({ length: 8 }, () => []);
  const dim: string[][] = Array.from({ length: 8 }, () => []);
  for (let index = 0; index < mini.columns * mini.rows; index++) {
    const square = `M${index % mini.columns} ${Math.floor(index / mini.columns)}h.92v.92h-.92z`;
    if (mini.cells[index] === ".") off.push(square);
    else (mini.lit.has(index) ? on : dim)[paletteIndex(index)].push(square);
  }
  return <svg className={css.preview} viewBox={`0 0 ${mini.columns} ${mini.rows}`} preserveAspectRatio="xMidYMid meet" aria-hidden focusable="false">
    <path className={css.off} d={off.join("")} />
    {dim.map((path, n) => path.length > 0 && <path key={`d${n}`} className={css.dim} style={{ fill: `var(--mw-mosaic-${n + 1})` }} d={path.join("")} />)}
    {on.map((path, n) => path.length > 0 && <path key={`o${n}`} className={css.on} style={{ fill: `var(--mw-mosaic-${n + 1})` }} d={path.join("")} />)}
  </svg>;
}
