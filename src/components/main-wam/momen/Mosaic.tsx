"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, CircleCheck, Image as ImageIcon, LayoutGrid, Maximize, ScanLine } from "lucide-react";
import { useLang, useT } from "@/components/main-wam/i18n";
import { ScreenContent, ShellActions } from "@/components/main-wam/shell";
import { Button, EmptyState, IconButton, Pill, PhotoFill, TextLink } from "@/components/main-wam/ui";
import { number as formatNumber } from "@/lib/main-wam/i18n";
import { cellLabel, mosaicPercent } from "@/lib/main-wam/momen/mosaic";
import type { MosaicManifest } from "@/lib/main-wam/momen/types";
import { mainWamApi, mainWamPath } from "@/lib/routes";
import { MosaicCanvas } from "./MosaicCanvas";
import { MomenQueueRunner } from "./upload/QueueRunner";
import css from "./mosaic.module.css";

/** How often the Mozaik asks for news (RISET §9: 30–60 s; an unchanged one costs a 304). */
export const MOSAIC_POLL_MS = 45_000;

/**
 * M06 Mozaik WAM 2026: the photos for everyone fill the letters of the event (or the KV's picture),
 * with progress, "Tandai fotoku" (own photos numbered, the rest dimmed, a strip to pick one and open
 * it), Ambil foto. Refreshed every 45 seconds while the screen is in front, from the same manifest
 * the venue TV will use.
 */
export function Mosaic({ initial, mark: markAtStart, title, demo }: { initial: MosaicManifest; mark: boolean; title: string; demo?: boolean }) {
  // The newest of what the page brought and what polling fetched since.
  const t = useT();
  const { lang } = useLang();
  const number = (value: number) => formatNumber(lang, value);
  const [polled, setPolled] = useState<MosaicManifest | null>(null);
  const manifest = polled && Date.parse(polled.updatedAt) > Date.parse(initial.updatedAt) ? polled : initial;
  const [mark, setMark] = useState(markAtStart);
  const [zoom, setZoom] = useState(1);
  const [chosen, setChosen] = useState<string | null>(null);
  const fullscreen = useSyncExternalStore(() => () => undefined, () => !!document.fullscreenEnabled, () => false);
  const holder = useRef<HTMLDivElement>(null);


  // Polling: only while the screen is in front; the browser revalidates with the ETag.
  useEffect(() => {
    if (demo) return;
    let stopped = false;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(mainWamApi.mosaic, { credentials: "same-origin", cache: "no-cache" });
        if (!response.ok) return;
        const body = await response.json() as { ok: boolean; data: MosaicManifest };
        if (!stopped && body.ok) setPolled(current => (current?.version === body.data.version ? current : body.data));
      } catch { /* offline: keep the last one */ }
    };
    const timer = window.setInterval(refresh, MOSAIC_POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [demo]);

  const toggle = useCallback((on: boolean) => {
    setMark(on);
    setChosen(null);
    if (!on) setZoom(1);
    // Keep it in the address (Back, a shared link), without a navigation.
    window.history.replaceState(window.history.state, "", mainWamPath.mosaic(on));
  }, []);

  function goFullscreen() {
    const element = holder.current;
    if (!element?.requestFullscreen) return;
    element.requestFullscreen().then(() => {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (kind: string) => Promise<void> };
      orientation.lock?.("landscape").catch(() => undefined);
    }).catch(() => undefined);
  }

  const mine = manifest.tiles.filter(tile => tile.mine).sort((a, b) => a.cell - b.cell);
  const selected = mine.find(tile => tile.id === chosen) ?? mine[0] ?? null;
  const percent = mosaicPercent(manifest.filled, manifest.total);
  const spoken = `${t("momen.mos.spoken", { title, filled: number(manifest.filled), total: number(manifest.total) })}${mark && mine.length ? t("momen.mos.spokenMine", { n: mine.length }) : ""}`;

  if (!manifest.migrated) return <ScreenContent><EmptyState icon={LayoutGrid} title={t("peserta.waiting.title")}>{t("momen.mos.waitingBody")}</EmptyState></ScreenContent>;

  return <ScreenContent>
    {!demo && <MomenQueueRunner />}
    {fullscreen && <ShellActions><IconButton icon={Maximize} label={t("momen.mos.fullscreen")} onClick={goFullscreen} /></ShellActions>}
    <p className={css.intro}>{t("momen.mos.intro")}</p>
    <div ref={holder} className={css.panel}>
      <MosaicCanvas manifest={manifest} mark={mark} zoom={zoom} onZoom={setZoom} focus={mark && chosen ? selected?.cell ?? null : null} label={spoken} />
    </div>

    <dl className={css.stats}>
      <div><dt>{t("momen.mos.statFilled")}</dt><dd>{number(manifest.filled)}</dd></div>
      <div><dt>{t("momen.mos.statMine")}</dt><dd>{number(mine.length)}</dd></div>
      <div><dt>{t("momen.mos.statPeople")}</dt><dd>{number(manifest.people)}</dd></div>
    </dl>
    <span role="progressbar" className={css.bar} aria-label={t("momen.mos.progress", { filled: number(manifest.filled), total: number(manifest.total) })} aria-valuemin={0} aria-valuemax={manifest.total} aria-valuenow={manifest.filled} aria-valuetext={`${percent}%`}>
      <span style={{ width: `${percent}%` }} />
    </span>

    <button type="button" role="switch" aria-checked={mark} className={mark ? `${css.markBtn} ${css.markOn}` : css.markBtn} onClick={() => toggle(!mark)}>
      <ScanLine aria-hidden />{mark ? t("momen.mos.marked") : t("momen.mos.markMine")}
    </button>
    <p className={css.caption} aria-live="polite">{mine.length ? t("momen.mos.mineIn", { n: mine.length }) : t("momen.mos.noneIn")}</p>

    {mark && mine.length > 0 && <div className={css.mineBox}>
      <ul className={css.mine} aria-label={t("momen.mos.mineList")}>
        {mine.map((tile, index) => {
          const pressed = tile.id === selected?.id;
          const where = `${index + 1} · ${cellLabel(manifest.cells[tile.cell], lang)}`;
          return <li key={tile.id} className={css.mineItem}>
            <button type="button" className={css.mineThumb} aria-pressed={pressed} aria-label={t("momen.mos.thumb", { n: index + 1, where: cellLabel(manifest.cells[tile.cell], lang) })} onClick={() => setChosen(tile.id)}>
              <PhotoFill tone={((index % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6} className={css.fill} />
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived storage address */}
              {tile.src && <img className={css.mineImg} src={tile.src} alt="" loading="lazy" />}
              {pressed && <CircleCheck aria-hidden className={css.check} />}
            </button>
            <span className={css.mineLabel}>{where}</span>
          </li>;
        })}
      </ul>
      {selected && <TextLink icon={ImageIcon} href={mainWamPath.moments({ foto: selected.id })}>{t("momen.mos.seePhoto")}</TextLink>}
    </div>}

    {manifest.complete && <div className={css.complete}>
      <Pill tone="success" icon={<CircleCheck />}>{t("momen.mos.complete", { total: number(manifest.total) })}</Pill>
    </div>}

    <Button variant="tonal" block icon={Camera} href={mainWamPath.camera()}>{t("momen.takePhoto")}</Button>
  </ScreenContent>;
}
