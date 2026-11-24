import { mainWamApi } from "@/lib/routes";
import { samplePhotos, sampleSessions } from "../sample";
import type { MosaicTile, PhotoDetail } from "./types";

/*
 * The photo viewer (Mozaik and Momen's photo options): which file it shows and downloads, and the sample
 * photos of Mode demo and the previews. Pure. A photo of the sample is a local picture (public/wam/demo/foto-01..24.svg,
 * made-up scenes, no person and no outside address); a real one comes through the file route, which checks access every time.
 */

export const DEMO_PICTURES = 24;
export const DEMO_FOLDER = "/wam/demo/";

/** The sample picture for a position (24 of them, then round again). */
export const demoPicture = (index: number) => `${DEMO_FOLDER}foto-${String((((Math.trunc(index) % DEMO_PICTURES) + DEMO_PICTURES) % DEMO_PICTURES) + 1).padStart(2, "0")}.svg`;
export const isDemoFile = (src: string | null | undefined): src is string => !!src && src.startsWith(DEMO_FOLDER);

export type ViewerFile = { /** Shown big. */ view: string; /** The "Simpan foto" address. */ download: string; /** The file's name on the phone. */ name: string };

/** Where a photo's large copy is shown and saved: the sample's local file, or the file route (with ?unduh=1 for saving). */
export function viewerFile(id: string, demoFile?: string | null): ViewerFile {
  const short = id.replace(/[^0-9a-z]/gi, "").slice(0, 8).toLowerCase() || "foto";
  if (isDemoFile(demoFile)) return { view: demoFile, download: demoFile, name: `wam-2026-${short}.svg` };
  return { view: mainWamApi.photoFile(id, "besar"), download: mainWamApi.photoDownload(id), name: `wam-2026-${short}.jpg` };
}

/** The detail of a sample tile (Mode demo, previews): made-up name, session and time, from the sample photos in turn. */
export function demoTileDetail(tile: Pick<MosaicTile, "id" | "cell" | "mine">, viewerName: string): PhotoDetail {
  const sample = samplePhotos[Math.abs(tile.cell) % samplePhotos.length];
  const session = sample.sessionId ? sampleSessions.find(item => item.id === sample.sessionId) : null;
  return { id: tile.id, owner: { name: tile.mine ? viewerName : sample.owner.name }, mine: tile.mine, sessionTitle: session?.title ?? null, takenAt: sample.takenAt };
}
