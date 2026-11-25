import "server-only";
import { claimNumbers, dayStart, nextDay } from "@/lib/coffee/quota";
import { DETAIL_HEAD, detailCells, expandRows, filterRows, recapTitle, summarize, summarySheet, type RecapSummary } from "@/lib/coffee/recap";
import type { RecapQuery } from "@/lib/coffee/schemas";
import type { RecapRow } from "@/lib/coffee/types";
import { csvCell } from "../responses";
import { writeXlsx } from "../xlsx-write";
import { activePeople } from "./people";
import { readSettings } from "./settings";
import { ORDER_COLUMNS, coffeeError, countingClaims, db, toOrder, type OrderRow } from "./store";

/*
 * Rekap (/admin/coffee/rekap): a span of WIB days as one row per drink, its summary, and the same
 * rows as files. The .csv and the .xlsx's Detail sheet hold exactly the table's cells; every text
 * cell is safe from being read as a formula (csvCell, inline strings).
 */

/** Every drink ordered in the span, newest first, filtered. Read a thousand orders at a time until none are left. */
export async function recapRows(query: RecapQuery): Promise<RecapRow[]> {
  const from = dayStart(query.dari);
  const to = dayStart(nextDay(query.sampai));
  const orders: OrderRow[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db().from("coffee_orders").select(ORDER_COLUMNS).gte("ordered_at", from).lt("ordered_at", to)
      .order("ordered_at", { ascending: false }).order("id").range(start, start + 999);
    if (error) coffeeError(error);
    orders.push(...((data ?? []) as unknown as OrderRow[]));
    if ((data ?? []).length < 1000) break;
  }
  // "Klaim ke-" counts from the first claim of the month, also when the span starts mid-month.
  const numbers = claimNumbers(await countingClaims({ fromMonth: query.dari.slice(0, 7), toMonth: query.sampai.slice(0, 7) }));
  return filterRows(expandRows(orders.map(toOrder), numbers), { jenis: query.jenis, status: query.status, q: query.q });
}

export async function recap(query: RecapQuery): Promise<{ rows: RecapRow[]; summary: RecapSummary; title: string }> {
  const [rows, people, settings] = await Promise.all([recapRows(query), activePeople(), readSettings()]);
  return { rows, summary: summarize(rows, people, settings), title: recapTitle(query.dari, query.sampai) };
}

/** The same rows as files: .csv (Detail) and .xlsx (Detail and Ringkasan). */
export async function recapFiles(query: RecapQuery): Promise<{ csv: string; xlsx: Buffer }> {
  const { rows, summary, title } = await recap(query);
  const detail = [[...DETAIL_HEAD], ...rows.map(detailCells)];
  return {
    csv: `﻿${detail.map(line => line.map(csvCell).join(",")).join("\r\n")}\r\n`,
    xlsx: writeXlsx([
      { name: "Detail", rows: detail, widths: [12, 10, 12, 12, 26, 12, 26, 10, 26, 24, 10, 20, 24, 8, 10, 10, 10, 30, 16, 10, 8, 10] },
      { name: "Ringkasan", rows: summarySheet(summary, title), widths: [34, 16, 14, 14, 10, 12, 10] },
    ]),
  };
}
