"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, CircleCheck, Image as ImageIcon, LayoutGrid, Maximize, Tv } from "lucide-react";
import { ScreenContent, ShellActions } from "@/components/main-wam/shell";
import { Button, EmptyState, IconButton, List, Pill, PhotoFill, ProgressBar, SwitchRow, TextLink } from "@/components/main-wam/ui";
import { cellLabel, mosaicPercent } from "@/lib/main-wam/momen/mosaic";
import type { MosaicManifest } from "@/lib/main-wam/momen/types";
import { wibTime } from "@/lib/main-wam/rundown";
import { mainWamApi, mainWamPath } from "@/lib/routes";
import { MosaicCanvas } from "./MosaicCanvas";
import { MomenQueueRunner } from "./upload/QueueRunner";
import css from "./mosaic.module.css";

/** How often the Mozaik asks for news (RISET §9: 30–60 s; an unchanged one costs a 304). */
export const MOSAIC_POLL_MS = 45_000;

const number = (value: number) => new Intl.NumberFormat("id-ID").format(value);

/**
 * M06 Mozaik WAM 2026: the photos for everyone fill the letters of the event (or the KV's picture),
 * with progress, "Tandai fotoku" (own photos numbered, the rest dimmed, a strip to pick one and open
 * it), Ambil foto. Refreshed every 45 seconds while the screen is in front, from the same manifest
 * the venue TV will use.
 */
export function Mosaic({ initial, mark: markAtStart, title, demo }: { initial: MosaicManifest; mark: boolean; title: string; demo?: boolean }) {
  // The newest of what the page brought and what polling fetched since.
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
  const spoken = `${title}, ${number(manifest.filled)} dari ${number(manifest.total)} foto${mark && mine.length ? `. ${mine.length} fotomu ditandai nomor 1 sampai ${mine.length}.` : ""}`;

  if (!manifest.migrated) return <ScreenContent><EmptyState icon={LayoutGrid} title="Menunggu pembaruan sistem">Mozaik bisa dibuka setelah sistem diperbarui.</EmptyState></ScreenContent>;

  return <ScreenContent>
    {!demo && <MomenQueueRunner />}
    {fullscreen && <ShellActions><IconButton icon={Maximize} label="Layar penuh" onClick={goFullscreen} /></ShellActions>}
    <div ref={holder}>
      <MosaicCanvas manifest={manifest} mark={mark} zoom={zoom} onZoom={setZoom} focus={mark && chosen ? selected?.cell ?? null : null} label={spoken} />
    </div>

    <List inset={16} label="Tandai fotoku">
      <SwitchRow inList title="Tandai fotoku" sub={mine.length ? `${mine.length} fotomu ada di mozaik` : "Belum ada fotomu di mozaik"} checked={mark} onChange={toggle} />
    </List>

    {mark && (mine.length ? <div>
      <ul className={css.mine} aria-label="Fotomu di mozaik">
        {mine.map((tile, index) => {
          const pressed = tile.id === selected?.id;
          const where = `${index + 1} · ${cellLabel(manifest.cells[tile.cell])}`;
          return <li key={tile.id} className={css.mineItem}>
            <button type="button" className={css.mineThumb} aria-pressed={pressed} aria-label={`Foto ${index + 1}, ${cellLabel(manifest.cells[tile.cell])}`} onClick={() => setChosen(tile.id)}>
              <PhotoFill tone={((index % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6} className={css.fill} />
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived storage address */}
              {tile.src && <img className={css.mineImg} src={tile.src} alt="" loading="lazy" />}
              {pressed && <CircleCheck aria-hidden className={css.check} />}
            </button>
            <span className={css.mineLabel}>{where}</span>
          </li>;
        })}
      </ul>
      {selected && <TextLink icon={ImageIcon} href={mainWamPath.moments({ foto: selected.id })}>Lihat foto</TextLink>}
    </div> : <EmptyState size="s" icon={LayoutGrid} title="Fotomu belum ada di mozaik" headingLevel={3}
      action={<Button variant="tonal" size="m" icon={Camera} href={mainWamPath.camera()}>Ambil foto</Button>}>Kirim foto untuk Semua peserta.</EmptyState>)}

    {manifest.complete
      ? <div className={css.complete}>
        <Pill tone="success" icon={<CircleCheck />}>Mozaik lengkap · {number(manifest.total)} foto</Pill>
        <p className={css.caption}>Foto baru tetap tampil di Momen.</p>
      </div>
      : <div className={css.progress}>
        <ProgressBar labelSize="subtitle" label={`${number(manifest.filled)} dari ${number(manifest.total)} foto`} valueText={`${percent}%`} value={manifest.filled} max={manifest.total} />
        <p className={css.caption}>{number(manifest.people)} orang ikut menyusun · diperbarui {wibTime(manifest.updatedAt).replace(":", ".")}</p>
      </div>}

    <p className={css.meta}><Tv aria-hidden />Mozaik ini juga tayang di TV venue. Hanya foto untuk Semua peserta yang masuk.</p>
    <Button variant="secondary" block icon={Camera} href={mainWamPath.camera()}>Ambil foto</Button>
  </ScreenContent>;
}
