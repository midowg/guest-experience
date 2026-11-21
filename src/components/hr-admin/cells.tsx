import Link from "next/link";
import { cellCodes, cellLabels, cellWords, LEGEND, type Cell, type CellKind } from "@/lib/hr/recap";
import css from "./hr-admin.module.css";

/*
 * Admin HR's coloured cells (21 Nov 2026): one person's day as a letter on its colour (src/lib/hr/
 * recap.ts says which). Its words are its title and what screen readers hear, so the colour is
 * never alone. A link when it opens that day.
 */

const flags = (cell: Cell) => ({ "data-kind": cell.kind, "data-waiting": cell.waiting || undefined, "data-check": cell.check || undefined, "data-incomplete": cell.incomplete || undefined });

/** The small square: a letter, or nothing on Libur and days to come. */
export function DayCell({ cell, who, href }: { cell: Cell; who?: string; href?: string }) {
  const words = `${who ? `${who}, ` : ""}${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${cell.date}T12:00:00Z`))}: ${cellWords(cell)}`;
  const inner = <>{cellCodes[cell.kind]}<span className="sr-only">{words}</span></>;
  return href && cell.kind !== "nanti"
    ? <Link href={href} prefetch={false} className={css.cell} {...flags(cell)} title={words}>{inner}</Link>
    : <span className={css.cell} {...flags(cell)} title={words}>{inner}</span>;
}

/** The wide one in Absen harian: the letter and the word ("T Telat"). */
export function StatusCell({ cell }: { cell: Cell }) {
  if (cell.kind === "nanti") return <span className={css.muted}>—</span>;
  return <span className={`${css.cell} ${css.cellWide}`} {...flags(cell)} title={cellWords(cell)}>
    {cellCodes[cell.kind] && <b aria-hidden>{cellCodes[cell.kind]}</b>}{cellLabels[cell.kind]}{cell.waiting ? " (menunggu)" : ""}
    {(cell.check || cell.incomplete) && <span className="sr-only">, {[cell.incomplete ? (cell.masuk ? "belum absen pulang" : "tanpa absen masuk") : "", cell.check ? "perlu dicek" : ""].filter(Boolean).join(", ")}</span>}
  </span>;
}

/** What the colours and letters mean, and the marks. */
export function CellLegend({ kinds = LEGEND }: { kinds?: CellKind[] }) {
  return <ul className={css.legend} aria-label="Arti warna">
    {kinds.map(kind => <li key={kind}><span className={css.cell} data-kind={kind} aria-hidden>{cellCodes[kind]}</span>{cellLabels[kind]}</li>)}
    <li><span className={css.cell} data-kind="cuti" data-waiting aria-hidden>C</span>Menunggu persetujuan</li>
    <li><span className={css.cell} data-kind="hadir" data-check aria-hidden>H</span>Perlu dicek</li>
    <li><span className={css.cell} data-kind="hadir" data-incomplete aria-hidden>H</span>Masuk atau pulang tidak ada</li>
  </ul>;
}
