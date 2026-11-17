/**
 * CSV for the Wellbeing import (16 Nov 2026): the Supabase dashboard export (RFC 4180: quoted fields
 * may hold commas, quotes and line breaks) into objects keyed by the header row.
 */
import fs from "node:fs";

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map(cells => Object.fromEntries(head.map((name, index) => [name, cells[index] === undefined || cells[index] === "" ? null : cells[index]])));
}

export const readCsv = file => parseCsv(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));

/**
 * Every table at once (17 Nov 2026): the result of ekspor-semua.sql (columns tabel, bagian, jumlah, isi =
 * a JSON array of rows), as a Map of table -> rows shaped like the dashboard's CSV export, so the import
 * reads both the same way: text values, null for empty, "true"/"false", arrays as JSON text, and times as
 * "2026-05-22 10:00:00.12+00".
 */
export function readAllTables(file) {
  const asCsv = value => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return String(value);
    if (typeof value === "object") return JSON.stringify(value);
    const time = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\+00:00$/.exec(value);
    return time ? `${time[1]} ${time[2]}+00` : value;
  };
  const tables = new Map();
  for (const part of readCsv(file)) {
    const rows = JSON.parse(part.isi);
    if (rows.length !== Number(part.jumlah)) throw new Error(`${part.tabel} bagian ${part.bagian}: ${rows.length} baris, seharusnya ${part.jumlah}`);
    const list = tables.get(part.tabel) ?? [];
    for (const row of rows) list.push(Object.fromEntries(Object.entries(row).map(([key, value]) => [key, asCsv(value)])));
    tables.set(part.tabel, list);
  }
  return tables;
}

/** A Postgres array literal as the dashboard exports it: {a,b} or ["a","b"]. */
export function parseArray(value) {
  if (!value) return [];
  const text = value.trim();
  if (text.startsWith("[")) { try { return JSON.parse(text).filter(Boolean); } catch { return []; } }
  if (!text.startsWith("{")) return [text];
  return text.slice(1, -1).match(/("([^"\\]|\\.)*"|[^,]+)/g)?.map(item => item.startsWith('"') ? JSON.parse(item) : item).filter(item => item && item !== "NULL") ?? [];
}
