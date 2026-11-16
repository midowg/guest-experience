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

/** A Postgres array literal as the dashboard exports it: {a,b} or ["a","b"]. */
export function parseArray(value) {
  if (!value) return [];
  const text = value.trim();
  if (text.startsWith("[")) { try { return JSON.parse(text).filter(Boolean); } catch { return []; } }
  if (!text.startsWith("{")) return [text];
  return text.slice(1, -1).match(/("([^"\\]|\\.)*"|[^,]+)/g)?.map(item => item.startsWith('"') ? JSON.parse(item) : item).filter(item => item && item !== "NULL") ?? [];
}
