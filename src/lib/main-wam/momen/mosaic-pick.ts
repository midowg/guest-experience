/*
 * Choosing a Mozaik cell: from a tap (a point on the canvas) and from the keyboard ring (arrow keys). Pure.
 */

export type CellGrid = { left: number; top: number; cell: number; gap: number };

/**
 * The cell with a photo a tap at `point` (px inside the canvas) means, or null. A tap on a cell with a photo is that cell; with a finger
 * (`touch`) a tap that lands in a gap or on an empty cell next to a photo takes the nearest photo within one and a half cells (the cells
 * are only a few px wide when the whole mosaic is on the phone), a mouse needs the cell itself.
 */
export function tapCell(point: { x: number; y: number }, grid: CellGrid, columns: number, rows: number, withPhoto: readonly number[], touch: boolean): number | null {
  const pitch = grid.cell + grid.gap;
  if (pitch <= 0) return null;
  const photos = new Set(withPhoto);
  const column = Math.floor((point.x - grid.left) / pitch), row = Math.floor((point.y - grid.top) / pitch);
  const inside = (c: number, r: number) => c >= 0 && r >= 0 && c < columns && r < rows;
  const onCell = inside(column, row) && point.x - grid.left - column * pitch <= grid.cell && point.y - grid.top - row * pitch <= grid.cell;
  if (onCell && photos.has(row * columns + column)) return row * columns + column;
  if (!touch) return null;
  let best: { cell: number; distance: number } | null = null;
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = column - 1; c <= column + 1; c++) {
      if (!inside(c, r) || !photos.has(r * columns + c)) continue;
      const distance = Math.hypot(point.x - (grid.left + c * pitch + grid.cell / 2), point.y - (grid.top + r * pitch + grid.cell / 2));
      if (distance <= pitch * 1.5 && (!best || distance < best.distance)) best = { cell: r * columns + c, distance };
    }
  }
  return best?.cell ?? null;
}

/** The cell with a photo nearest to `from` in a direction ([1,0] right, [0,1] down …), or null when there is none that way. */
export function moveCell(from: number, direction: readonly [number, number], columns: number, withPhoto: readonly number[]): number | null {
  const [dx, dy] = direction;
  const fromColumn = from % columns, fromRow = Math.floor(from / columns);
  let best: { cell: number; score: number } | null = null;
  for (const cell of withPhoto) {
    if (cell === from) continue;
    const column = cell % columns, row = Math.floor(cell / columns);
    const ahead = dx ? (column - fromColumn) * dx : (row - fromRow) * dy;
    if (ahead <= 0) continue;
    const score = ahead + 2 * (dx ? Math.abs(row - fromRow) : Math.abs(column - fromColumn));
    if (!best || score < best.score || (score === best.score && cell < best.cell)) best = { cell, score };
  }
  return best?.cell ?? null;
}
