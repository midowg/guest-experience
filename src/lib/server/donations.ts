import "server-only";
import { randomUUID } from "node:crypto";
import { donationTotals, publicDonors, type DonationInput, type DonationRecord, type DonationTotals, type PublicDonor } from "@/lib/donations";
import { sniffPhoto } from "@/lib/image-signature";
import type { EventRecord } from "@/lib/types";
import { createPrivilegedClient } from "./supabase/admin";
import { databaseError } from "./http";
import { ServiceError } from "./config";
import { csvCell, payloadHash } from "./responses";

const MIGRATION = "202610270003_donations.sql";
const BUCKET = "bukti-donasi";
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
const columns = "id,event_id,item_key,item_label,category,amount,unit,donor_name,display,donor_phone,message,proof_key,status,received_amount,reject_reason,verified_at,notified_at,created_at";
const notMigrated = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205", "PGRST202", "42883"].includes(error.code ?? "") || /donations|submit_donation/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Donasi menunggu migrasi ${MIGRATION}.`);

/** numeric columns arrive as strings from PostgREST. */
function record(row: Record<string, unknown>): DonationRecord {
  return { ...(row as DonationRecord), amount: Number(row.amount ?? 0), received_amount: row.received_amount === null || row.received_amount === undefined ? null : Number(row.received_amount) };
}

/** Image or PDF, from its first bytes; anything else is refused. */
function proofKind(bytes: Uint8Array): { extension: string; type: string } | null {
  const photo = sniffPhoto(bytes);
  if (photo === "jpeg") return { extension: "jpg", type: "image/jpeg" };
  if (photo === "png") return { extension: "png", type: "image/png" };
  if (photo === "webp") return { extension: "webp", type: "image/webp" };
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return { extension: "pdf", type: "application/pdf" };
  return null;
}

/** Stores a proof of transfer in the private bucket; returns its key. */
export async function storeProof(slug: string, file: File): Promise<string> {
  if (file.size === 0) throw new ServiceError(400, "Berkas bukti kosong.");
  if (file.size > PROOF_MAX_BYTES) throw new ServiceError(413, "Ukuran bukti transfer maksimal 5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = proofKind(bytes);
  if (!kind) throw new ServiceError(415, "Bukti transfer harus berupa foto (JPG, PNG, WebP) atau PDF.");
  const key = `${slug.replace(/[^a-z0-9-]/g, "").slice(0, 80) || "acara"}/${randomUUID()}.${kind.extension}`;
  const { error } = await createPrivilegedClient().storage.from(BUCKET).upload(key, bytes, { contentType: kind.type, upsert: false });
  if (error) throw new ServiceError(503, "Bukti transfer belum dapat disimpan. Coba lagi, atau kirim tanpa bukti bila diperbolehkan.");
  return key;
}

export async function submitDonation(slug: string, payload: DonationInput, proofKey: string): Promise<string> {
  const { data, error } = await createPrivilegedClient().rpc("submit_donation", { p_slug: slug, p_payload: payload, p_hash: payloadHash(payload), p_proof: proofKey });
  if (error) { if (notMigrated(error)) throw waiting(); databaseError(error); }
  return data as string;
}

/**
 * What the public page shows: the totals and the donor list, both from received donations only and
 * as the admin's switches and each donor's choice allow. Before the migration: nothing to show.
 */
export async function publicDonationView(event: Pick<EventRecord, "id" | "donation">): Promise<{ totals: DonationTotals; donors: PublicDonor[]; ready: boolean }> {
  const { data, error } = await createPrivilegedClient().from("donations")
    .select("id,item_key,item_label,category,amount,unit,donor_name,display,message,status,received_amount,verified_at,created_at")
    .eq("event_id", event.id).neq("status", "rejected").order("created_at", { ascending: false }).limit(5000);
  if (error) {
    if (notMigrated(error)) return { totals: donationTotals(event.donation, []), donors: [], ready: false };
    databaseError(error);
  }
  const rows = (data ?? []).map(row => record({ ...row, donor_phone: "", proof_key: "", reject_reason: "", notified_at: null, event_id: event.id }));
  return { totals: donationTotals(event.donation, rows), donors: publicDonors(event.donation, rows).slice(0, 200), ready: true };
}

export async function listDonations(eventId: string): Promise<{ donations: DonationRecord[]; migrated: boolean }> {
  const { data, error } = await createPrivilegedClient().from("donations").select(columns).eq("event_id", eventId).order("created_at", { ascending: false }).limit(5000);
  if (error) { if (notMigrated(error)) return { donations: [], migrated: false }; databaseError(error); }
  return { donations: (data ?? []).map(record), migrated: true };
}

type Action = { action: "receive"; received_amount: number | null } | { action: "reject"; reason: string } | { action: "pending" } | { action: "notified" };
/** Receive (with what actually came in), reject (with a reason), back to waiting, or handover message sent. */
export async function updateDonation(eventId: string, id: string, change: Action): Promise<DonationRecord> {
  const now = new Date().toISOString();
  const values =
    change.action === "receive" ? { status: "received", received_amount: change.received_amount, reject_reason: "", verified_at: now }
    : change.action === "reject" ? { status: "rejected", reject_reason: change.reason, received_amount: null, verified_at: now }
    : change.action === "pending" ? { status: "pending", reject_reason: "", received_amount: null, verified_at: null }
    : { notified_at: now };
  const { data, error } = await createPrivilegedClient().from("donations").update(values).eq("event_id", eventId).eq("id", id).select(columns).maybeSingle();
  if (error) { if (notMigrated(error)) throw waiting(); databaseError(error); }
  if (!data) throw new ServiceError(404, "Donasi tidak ditemukan.");
  return record(data);
}

/** Cash or goods handed over in person: recorded by the committee, already received. */
export async function addManualDonation(eventId: string, input: Omit<DonationInput, "website" | "idempotency_key">): Promise<DonationRecord> {
  const { data, error } = await createPrivilegedClient().from("donations")
    .insert({ ...input, event_id: eventId, manual: true, status: "received", verified_at: new Date().toISOString() }).select(columns).single();
  if (error) { if (notMigrated(error)) throw waiting(); databaseError(error); }
  return record(data);
}

export async function deleteDonation(eventId: string, id: string): Promise<void> {
  const client = createPrivilegedClient();
  const { data, error } = await client.from("donations").delete().eq("event_id", eventId).eq("id", id).select("proof_key").maybeSingle();
  if (error) { if (notMigrated(error)) throw waiting(); databaseError(error); }
  if (data?.proof_key) await client.storage.from(BUCKET).remove([data.proof_key]).catch(() => null);
}

/** A ten-minute address to look at one proof of transfer. */
export async function proofAddress(eventId: string, id: string): Promise<string> {
  const client = createPrivilegedClient();
  const { data, error } = await client.from("donations").select("proof_key").eq("event_id", eventId).eq("id", id).maybeSingle();
  if (error) { if (notMigrated(error)) throw waiting(); databaseError(error); }
  if (!data?.proof_key) throw new ServiceError(404, "Donasi ini tidak membawa bukti transfer.");
  const signed = await client.storage.from(BUCKET).createSignedUrl(data.proof_key, 600);
  if (signed.error || !signed.data) throw new ServiceError(503, "Bukti transfer belum dapat dibuka. Coba lagi.");
  return signed.data.signedUrl;
}

const statusLabels = { pending: "Menunggu", received: "Diterima", rejected: "Ditolak" } as const;
const displayLabels = { name: "Nama", hamba_allah: "Hamba Allah", hidden: "Tidak disebutkan" } as const;
const categoryLabels = { fund: "Dana", goods: "Barang", other: "Lainnya" } as const;
/** Every donation as a spreadsheet, formula-safe (csvCell). */
export function donationsCsv(rows: DonationRecord[]) {
  const header = ["Waktu", "Nama", "Tampil sebagai", "WhatsApp", "Kelompok", "Bantuan", "Jumlah", "Jumlah diterima", "Satuan", "Status", "Alasan ditolak", "Pesan", "Bukti transfer", "Dikonfirmasi", "Kabar terkirim"];
  const lines = rows.map(row => [row.created_at, row.donor_name, displayLabels[row.display], row.donor_phone, categoryLabels[row.category], row.item_label,
    String(row.amount), row.received_amount === null ? "" : String(row.received_amount), row.unit, statusLabels[row.status], row.reject_reason, row.message,
    row.proof_key ? "Ada" : "", row.verified_at ?? "", row.notified_at ?? ""].map(csvCell).join(","));
  return `﻿${[header.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}
