import { describe, expect, it } from "vitest";
import { letterCells, miniMosaic, MINI_COLUMNS, MINI_ROWS } from "./mosaic";

describe("miniMosaic (the Beranda card's one-line mosaic)", () => {
  it("draws the text on one line of 54 x 9 and carries the filled share over to the mini letters, the same every time", () => {
    const cells = letterCells(50, 36, "WAM 2026");
    const letters = [...cells].map((cell, index) => (cell === "." ? -1 : index)).filter(index => index >= 0);
    const big = { columns: 50, rows: 36, cells, filledCells: letters.slice(0, Math.floor(letters.length / 2)) };
    const mini = miniMosaic(big);
    expect([mini.columns, mini.rows, mini.cells.length]).toEqual([MINI_COLUMNS, MINI_ROWS, 54 * 9]);
    // One line: the first and last rows hold no letter pixel (margin), the middle ones do.
    expect([...mini.cells.slice(0, 54)].every(cell => cell === ".")).toBe(true);
    expect([...mini.cells.slice(4 * 54, 5 * 54)].some(cell => cell !== ".")).toBe(true);
    const total = [...mini.cells].filter(cell => cell !== ".").length;
    expect(mini.lit.size).toBe(Math.round(total / 2));
    expect([...mini.lit].every(index => mini.cells[index] !== ".")).toBe(true);
    expect([...miniMosaic(big).lit]).toEqual([...mini.lit]);
    expect(miniMosaic({ ...big, filledCells: [] }).lit.size).toBe(0);
    expect(miniMosaic({ ...big, filledCells: letters }).lit.size).toBe(total);
  });
});
