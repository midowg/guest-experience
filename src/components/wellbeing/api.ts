"use client";

import { praWamRequest, PraWamApiError } from "@/components/pra-wam/api";
import { uploadProfilePhoto } from "@/components/pra-wam/photoUpload";
import { compressImage } from "@/lib/compress-image";
import type { PhotoMime } from "@/lib/pra-wam/photo";
import type { CardView } from "@/lib/server/pra-wam/cards";
import { praWamApi, wellbeingApi, wellbeingPath } from "@/lib/routes";
import type { WbAppCatalog, WbBoard, WbHome, WbLedger, WbLogInput, WbLogResult, WbMyActivity, WbMyActivityFilter, WbMyActivityPage, WbUploadedPhoto, WbUploadStart } from "@/lib/wellbeing/app-types";
import type { DimensionId } from "@/lib/wellbeing/rules";

/*
 * Wellbeing app (17 Nov 2026): the one door to /api/wellbeing/*. The screens only talk to a
 * WellbeingApi, so /dev-preview/wellbeing can hand them sample data instead (mock-api.ts).
 */

export type BoardPeriod = "month" | "all";
export type BoardDim = DimensionId | "all";
/** Batalkan while saving aborts the request. */
export type RequestOptions = { signal?: AbortSignal };

export type WellbeingApi = {
  home(): Promise<WbHome>;
  catalog(): Promise<WbAppCatalog>;
  activities(filter: WbMyActivityFilter, before?: string): Promise<WbMyActivityPage>;
  activity(id: string): Promise<WbMyActivity>;
  /** Where to PUT one proof photo. */
  startUpload(input: { mime: string; size: number }, options?: RequestOptions): Promise<WbUploadStart>;
  /** 409 with code "limit" | "same_day" | "strava_twin" (WellbeingApiError.code). */
  log(input: WbLogInput, options?: RequestOptions): Promise<WbLogResult>;
  leaderboard(period: BoardPeriod, dim: BoardDim): Promise<WbBoard>;
  ledger(): Promise<WbLedger>;
  /** Ends the WAM session and leaves for the sign-in page. */
  signOut(): Promise<void>;
  /** My WAM character card, to use as my profile photo; null without one (18 Nov 2026). */
  myCard(): Promise<CardView | null>;
  /** A ready square photo (320 × 320, at most 200 KB) as my WAM profile photo, with progress; answers its address. */
  savePhoto(blob: Blob, mime: PhotoMime, onProgress: (share: number) => void): Promise<string | null>;
  /** My profile photo removed: initials again. */
  removePhoto(): Promise<void>;
};

/** A refused request: the server's message, its status, and per-field messages (fieldErrors.code for 409s). */
export class WellbeingApiError extends Error {
  constructor(message: string, public status = 0, public fieldErrors?: Record<string, string[]>, public cancelled = false) {
    super(message);
    this.name = "WellbeingApiError";
  }
  /** A 409's reason: "limit", "same_day", "strava_twin", or null. */
  get code(): string | null { return this.status === 409 ? this.fieldErrors?.code?.[0] ?? null : null; }
  /** The first message for one field, if the server named it. */
  field(name: string): string | undefined { return this.fieldErrors?.[name]?.[0]; }
}

export const errorText = (error: unknown) => error instanceof Error && error.message ? error.message : "Terjadi kesalahan. Coba lagi.";

type Envelope<T> = { ok: boolean; data?: T; message?: string; fieldErrors?: Record<string, string[]> };

const REQUEST_TIMEOUT = 30_000;
const UPLOAD_TIMEOUT = 60_000;
export const cancelledError = () => new WellbeingApiError("Dibatalkan.", 0, undefined, true);
export const isCancelled = (error: unknown) => error instanceof WellbeingApiError && error.cancelled;

async function request<T>(url: string, init: { method?: "GET" | "POST"; json?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  if (init.signal?.aborted) throw cancelledError();
  // Given up after 30 seconds, or at once on Batalkan.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT);
  const cancel = () => controller.abort();
  init.signal?.addEventListener("abort", cancel);
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "GET", credentials: "same-origin", cache: "no-store", signal: controller.signal,
      ...(init.json !== undefined ? { body: JSON.stringify(init.json), headers: { "Content-Type": "application/json" } } : {}),
    });
  } catch {
    if (timedOut) throw new WellbeingApiError("Server terlalu lama menjawab. Periksa jaringan lalu coba lagi.");
    if (init.signal?.aborted) throw cancelledError();
    throw new WellbeingApiError("Tidak dapat terhubung. Periksa jaringan lalu coba lagi.");
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", cancel);
  }
  let body: Envelope<T>;
  try { body = await response.json(); } catch { throw new WellbeingApiError("Server belum dapat memberikan jawaban. Coba lagi sebentar.", response.status); }
  // The session ended: sign in again and come back here.
  if (response.status === 401 && typeof window !== "undefined") window.location.assign(wellbeingPath.login(`${window.location.pathname}${window.location.search}`));
  if (!response.ok || !body.ok) throw new WellbeingApiError(body.message || "Permintaan gagal. Coba lagi.", response.status, body.fieldErrors);
  return body.data as T;
}

export const realApi: WellbeingApi = {
  home: () => request<WbHome>(wellbeingApi.home),
  catalog: () => request<WbAppCatalog>(wellbeingApi.catalog),
  activities: (filter, before) => request<WbMyActivityPage>(wellbeingApi.activities(filter, before)),
  activity: id => request<WbMyActivity>(wellbeingApi.activity(id)),
  startUpload: (input, options) => request<WbUploadStart>(wellbeingApi.uploads, { method: "POST", json: input, signal: options?.signal }),
  log: (input, options) => request<WbLogResult>(wellbeingApi.log, { method: "POST", json: input, signal: options?.signal }),
  leaderboard: (period, dim) => request<WbBoard>(wellbeingApi.leaderboard(period, dim)),
  ledger: () => request<WbLedger>(wellbeingApi.ledger),
  signOut: async () => {
    try { await fetch(praWamApi.logout, { method: "POST", credentials: "same-origin" }); } catch { /* the cookie may already be gone */ }
    window.location.assign(wellbeingPath.login());
  },
  // The profile photo is the WAM account's: the same APIs as WAM's Profil (one photo everywhere).
  myCard: async () => {
    try { return (await praWamRequest<{ card: CardView | null }>(praWamApi.questionnaireCard)).data.card ?? null; }
    // No questionnaire open for me (404), or the cards are not installed yet (503): no card.
    catch (error) { if (error instanceof PraWamApiError && (error.status === 404 || error.status === 503)) return null; throw error; }
  },
  savePhoto: (blob, mime, onProgress) => uploadProfilePhoto(blob, mime, onProgress),
  removePhoto: async () => { await praWamRequest(praWamApi.photo, { method: "DELETE" }); },
};

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(cancelledError()); return; }
  const timer = setTimeout(() => { signal?.removeEventListener("abort", stop); resolve(); }, ms);
  const stop = () => { clearTimeout(timer); reject(cancelledError()); };
  signal?.addEventListener("abort", stop, { once: true });
});

function put(url: string, file: Blob, mime: string, onProgress: (fraction: number) => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(cancelledError()); return; }
    const xhr = new XMLHttpRequest();
    const cancel = () => xhr.abort();
    const done = () => signal?.removeEventListener("abort", cancel);
    xhr.open("PUT", url);
    xhr.timeout = UPLOAD_TIMEOUT;
    xhr.setRequestHeader("Content-Type", mime);
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    xhr.onload = () => { done(); if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new WellbeingApiError("Foto gagal diunggah.", xhr.status)); };
    xhr.onerror = () => { done(); reject(new WellbeingApiError("Foto gagal diunggah. Periksa jaringan.")); };
    xhr.ontimeout = () => { done(); reject(new WellbeingApiError("Unggahan terlalu lama. Periksa jaringan.")); };
    xhr.onabort = () => { done(); reject(cancelledError()); };
    signal?.addEventListener("abort", cancel, { once: true });
    xhr.send(file);
  });
}

/**
 * One proof photo: made smaller, an upload address asked for, the file PUT there (with progress),
 * and what log() needs back. An address starting with "mock:" (the dev preview) skips the network.
 */
export async function uploadPhoto(api: WellbeingApi, file: File, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<WbUploadedPhoto> {
  const small = await compressImage(file);
  const mime = small.type || "image/jpeg";
  const start = await api.startUpload({ mime, size: small.size }, { signal });
  if (start.uploadUrl.startsWith("mock:")) {
    for (let step = 1; step <= 4; step++) { await wait(90, signal); onProgress(step / 4); }
  } else {
    await put(start.uploadUrl, small, mime, onProgress, signal);
  }
  onProgress(1);
  return { key: start.key, mime, size: small.size, token: start.token };
}
