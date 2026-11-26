"use client";

import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { wibClock, wibDay } from "@/lib/coffee/quota";
import { optionsLabel } from "@/lib/coffee/menu";
import { DETAIL_HEAD, iceCell, rowStatus, temperatureCell } from "@/lib/coffee/recap";
import { KIND_LABEL, type RecapRow } from "@/lib/coffee/types";
import type { CancelTarget } from "./api";
import { STATUS_TONE, canCancel, cancelOfRow } from "./format";
import css from "./coffee-admin.module.css";

const PAGE = 100;
const sheetDate = (iso: string) => wibDay(iso).split("-").reverse().join("/");
const clock = (iso: string) => wibClock(iso).replace(":", ".");

/**
 * Rekap → Detail: one row per drink, the same columns as the files. The table scrolls inside its
 * own box with the name held in place; on a phone it is a list. A hundred rows at a time; the
 * files always hold all of them. A record made by hand offers Batalkan catatan; once cancelled it
 * stays, as "Dibatalkan".
 */
export function DetailTable({ rows, phone, onCancel }: { rows: RecapRow[]; phone: boolean; onCancel?: (target: CancelTarget) => void }) {
  const [newest, setNewest] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  if (!rows.length) return <p className={css.small}>Tidak ada baris untuk filter ini.</p>;
  // The server sends the newest first.
  const ordered = newest ? rows : [...rows].reverse();
  const shown = ordered.slice(0, limit);
  const more = rows.length - shown.length;
  const status = (row: RecapRow) => (
    <span className={css.statusCell}>
      <span className={css.pill} data-tone={STATUS_TONE[row.status]}>{rowStatus(row)}</span>
      {row.manual && <span className={css.pill} data-tone="off">Dicatat manual</span>}
    </span>
  );
  const cancel = (row: RecapRow) => onCancel && canCancel(row) && (
    <button type="button" className={css.textButton} onClick={() => onCancel(cancelOfRow(row))}>
      Batalkan catatan<span className={css.srOnly}> {row.no} {row.name}</span>
    </button>
  );
  const foot = more > 0 && (
    <div className={css.moreRow}>
      <button type="button" className={css.secondary} onClick={() => setLimit(value => value + PAGE)}>Tampilkan {Math.min(PAGE, more)} baris lagi</button>
    </div>
  );

  if (phone) return (
    <>
      <button type="button" className={css.textButton} onClick={() => setNewest(value => !value)}>
        <ArrowUpDown size={16} aria-hidden />{newest ? "Terbaru dulu" : "Terlama dulu"}
      </button>
      <ul className={`${css.cardList} ${css.detailList}`}>
        {shown.map(row => (
          <li key={row.key}>
            <span className={css.cardListMain}>
              <strong>{row.drink}</strong>
              {optionsLabel(row.temperature, row.sugar, row.ice) && <span>{optionsLabel(row.temperature, row.sugar, row.ice)}</span>}
              <span>{row.name} · {KIND_LABEL[row.kind]}{row.claimNo ? ` ke-${row.claimNo}` : ""}{row.guest ? ` · ${row.guest}` : ""}{row.room ? ` · ${row.room}` : ""}</span>
              <span>{sheetDate(row.at)} {clock(row.at)} · {row.no}{row.doneBy ? ` · oleh ${row.doneBy}` : ""}</span>
              {row.reason && <span>Catatan tolak: {row.reason}</span>}
              {cancel(row)}
            </span>
            <span className={css.cardListSide}>{status(row)}</span>
          </li>
        ))}
      </ul>
      {foot}
    </>
  );

  return (
    <>
      <div className={`${css.tableBox} ${css.detailBox}`} tabIndex={0} role="region" aria-label="Tabel detail, bisa digulir ke samping">
        <table className={`${css.table} ${css.detail}`}>
          <thead>
            <tr>
              <th scope="col" aria-sort={newest ? "descending" : "ascending"}>
                <button type="button" className={css.sortButton} onClick={() => setNewest(value => !value)}>
                  Tanggal<ArrowUpDown size={14} aria-hidden /><span className={css.srOnly}>, urutkan {newest ? "terlama dulu" : "terbaru dulu"}</span>
                </button>
              </th>
              {DETAIL_HEAD.slice(1, 22).map(head => <th key={head} scope="col">{head}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map(row => (
              <tr key={row.key}>
                <td className={css.num}>{sheetDate(row.at)}</td>
                <td className={css.num}>{clock(row.at)}</td>
                <td className={css.num}>{row.no}</td>
                <td>{KIND_LABEL[row.kind]}</td>
                <th scope="row" className={css.nameCell}>{row.name}</th>
                <td>{row.group}</td>
                <td>{row.position || "–"}</td>
                <td>{row.bu || "–"}</td>
                <td>{row.pic || "–"}</td>
                <td>{row.guest || "–"}</td>
                <td>{row.guestName || "–"}</td>
                <td className={css.num}>{row.kind === "tamu" && row.guestCount ? row.guestCount : "–"}</td>
                <td>{row.room || "–"}</td>
                <td className={css.nameCell}>{row.drink}</td>
                <td>{temperatureCell(row) || "–"}</td>
                <td>{row.sugar ?? "–"}</td>
                <td>{iceCell(row) || "–"}</td>
                <td><span className={css.statusCell}>{status(row)}{cancel(row)}</span></td>
                <td>{row.reason || "–"}</td>
                <td>{row.doneBy || "–"}</td>
                <td className={css.num}>{row.doneAt ? `${wibDay(row.doneAt) === wibDay(row.at) ? "" : `${sheetDate(row.doneAt)} `}${clock(row.doneAt)}` : "–"}</td>
                <td className={css.num}>{row.claimNo ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {foot}
    </>
  );
}
