import "server-only";
import { createHash } from "node:crypto";
import type { FeedbackRecord, PageResult, RsvpRecord } from "@/lib/types";
import { createPrivilegedClient } from "./supabase/admin";
import { databaseError } from "./http";
import { ServiceError } from "./config";

export const PAGE_SIZE = 25;

/** Binds an idempotency key to one exact payload, so a replayed key with different content is rejected. */
export function payloadHash(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function submitPublicResponse(kind: "rsvp" | "feedback", slug: string, payload: Record<string, unknown>) {
  const { data, error } = await createPrivilegedClient().rpc(kind === "rsvp" ? "submit_rsvp" : "submit_feedback", { p_slug: slug, p_payload: payload, p_hash: payloadHash(payload) });
  if (error) databaseError(error);
  if (typeof data !== "string") throw new ServiceError(503, "Jawaban belum dapat dipastikan tersimpan. Coba kirim kembali.");
  return { id: data };
}

async function eventExists(client: Awaited<ReturnType<typeof createPrivilegedClient>>, eventId: string) {
  const { data, error } = await client.from("events").select("id").eq("id", eventId).maybeSingle();
  if (error) databaseError(error);
  if (!data) throw new ServiceError(404, "Acara tidak ditemukan.");
}

export async function listRsvps(eventId: string, options: { page: number; attendance?: "yes" | "no"; q?: string }): Promise<PageResult<RsvpRecord>> {
  const client = await createPrivilegedClient();
  await eventExists(client, eventId);
  const page = Math.max(1, options.page);
  let query = client.from("rsvps").select("id,event_id,name,organization,attendance,phone,email,has_allergy,allergy_details,created_at", { count: "exact" }).eq("event_id", eventId);
  if (options.attendance) query = query.eq("attendance", options.attendance);
  // Escaped so a search term cannot alter the filter expression.
  if (options.q) { const term = options.q.replace(/[\\%_,()]/g, ch => `\\${ch}`); query = query.or(`name.ilike.%${term}%,organization.ilike.%${term}%`); }
  const { data, error, count } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) databaseError(error);
  return { items: (data ?? []) as RsvpRecord[], total: count ?? 0, page, pageSize: PAGE_SIZE };
}

export async function listAllRsvps(eventId: string): Promise<RsvpRecord[]> {
  const client = await createPrivilegedClient();
  await eventExists(client, eventId);
  const { data, error } = await client.from("rsvps").select("id,event_id,name,organization,attendance,phone,email,has_allergy,allergy_details,created_at").eq("event_id", eventId).order("created_at", { ascending: false }).limit(5000);
  if (error) databaseError(error);
  return (data ?? []) as RsvpRecord[];
}

export async function listFeedback(eventId: string, page: number): Promise<PageResult<FeedbackRecord>> {
  const client = await createPrivilegedClient();
  await eventExists(client, eventId);
  const current = Math.max(1, page);
  const { data, error, count } = await client.from("feedback_submissions").select("id,event_id,created_at,feedback_answers(question_id,value)", { count: "exact" }).eq("event_id", eventId).order("created_at", { ascending: false }).order("id", { ascending: false }).range((current - 1) * PAGE_SIZE, current * PAGE_SIZE - 1);
  if (error) databaseError(error);
  const { data: questions, error: questionError } = await client.from("feedback_questions").select("id,label,sort_order").eq("event_id", eventId);
  if (questionError) databaseError(questionError);
  const labels = new Map((questions ?? []).map(q => [q.id as string, { label: q.label as string, sort: q.sort_order as number }]));
  const rows = (data ?? []) as { id: string; event_id: string; created_at: string; feedback_answers: { question_id: string; value: string }[] }[];
  return {
    items: rows.map(row => ({
      id: row.id, event_id: row.event_id, created_at: row.created_at,
      answers: [...row.feedback_answers]
        .sort((a, b) => (labels.get(a.question_id)?.sort ?? 0) - (labels.get(b.question_id)?.sort ?? 0))
        .map(answer => ({ question_id: answer.question_id, label: labels.get(answer.question_id)?.label ?? "Pertanyaan dihapus", value: answer.value })),
    })),
    total: count ?? 0, page: current, pageSize: PAGE_SIZE,
  };
}

/** Prefixes spreadsheet-interpreted characters so an exported cell is never evaluated as a formula. */
export function csvCell(value: string) {
  const text = value.replace(/\r\n|\r|\n/g, " ");
  return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
}

export function rsvpCsv(rows: RsvpRecord[]) {
  const header = ["Waktu", "Nama", "Instansi", "Kehadiran", "Telepon", "Email", "Alergi", "Catatan alergi"];
  const lines = rows.map(row => [row.created_at, row.name, row.organization, row.attendance === "yes" ? "Hadir" : "Tidak hadir", row.phone, row.email, row.has_allergy ? "Ada" : "Tidak ada", row.allergy_details].map(csvCell).join(","));
  return `﻿${[header.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}
