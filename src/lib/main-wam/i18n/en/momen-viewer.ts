import type { idMomenViewer } from "../id/momen-viewer";

export const enMomenViewer: Record<keyof typeof idMomenViewer, string> = {
  "momen.view.title": "Photo",
  "momen.view.save": "Save photo",
  "momen.view.failed": "The photo could not load yet.",
  "momen.view.detailFailed": "The photo's details could not load yet.",
  "momen.view.photoAlt": "Large photo",
  "momen.view.cellHint": "{where}, tile {n}. Press Enter to open the photo.",
  "momen.view.cellEmpty": "{where}, tile {n}, no photo yet.",
  "momen.view.canvasHelp": "Arrow keys pick a tile, Enter opens its photo.",
};
