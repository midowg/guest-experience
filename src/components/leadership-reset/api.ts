"use client";

import { adminRequest } from "@/components/admin/shared/api";
import type { AnswerInput, CmsView, CoachView, FormSave, OwnAnswer } from "@/lib/leadership-reset/form";
import { LEADERSHIP_RESET_KEY_HEADER, leadershipResetApi } from "@/lib/routes";

/*
 * How Refleksi Leader's screens talk to the server. Each screen takes one of these, so the dev
 * previews hand it an in-memory one (preview.ts) and every screen is seen without a database.
 */

export type FormApi = {
  save: (input: AnswerInput) => Promise<OwnAnswer>;
  /** My answer by my key; null when there is none under it. */
  readOwn: (key: string) => Promise<OwnAnswer | null>;
};
export type CmsApi = {
  view: () => Promise<CmsView>;
  saveForm: (input: FormSave) => Promise<{ view: CmsView; message: string }>;
  newCoachKey: () => Promise<{ coachKey: string; view: CmsView }>;
  newCmsKey: () => Promise<{ cmsKey: string }>;
  deleteResponse: (id: string) => Promise<CmsView>;
};
export type CoachApi = {
  view: () => Promise<CoachView>;
  excel: () => Promise<Blob>;
};

const json = (body: unknown) => JSON.stringify(body);

export const formApi: FormApi = {
  save: async input => (await adminRequest<OwnAnswer>(leadershipResetApi.answer, { method: "PUT", body: json(input) })).data as OwnAnswer,
  readOwn: async key => {
    try { return (await adminRequest<OwnAnswer>(leadershipResetApi.answer, { method: "POST", body: json({ key }) })).data as OwnAnswer; }
    catch (error) { if ((error as { status?: number }).status === 404) return null; throw error; }
  },
};

export function cmsApi(key: string): CmsApi {
  const headers = { [LEADERSHIP_RESET_KEY_HEADER]: key };
  return {
    view: async () => (await adminRequest<CmsView>(leadershipResetApi.cms, { headers })).data as CmsView,
    saveForm: async input => {
      const result = await adminRequest<CmsView>(leadershipResetApi.cmsForm, { method: "PUT", headers, body: json(input) });
      return { view: result.data as CmsView, message: result.message };
    },
    newCoachKey: async () => (await adminRequest<{ coachKey: string; view: CmsView }>(leadershipResetApi.cmsCoach, { method: "POST", headers })).data!,
    newCmsKey: async () => (await adminRequest<{ cmsKey: string }>(leadershipResetApi.cmsKey, { method: "POST", headers })).data!,
    deleteResponse: async id => (await adminRequest<CmsView>(leadershipResetApi.cmsResponse(id), { method: "DELETE", headers })).data as CmsView,
  };
}

export function coachApi(key: string): CoachApi {
  const headers = { [LEADERSHIP_RESET_KEY_HEADER]: key };
  return {
    view: async () => (await adminRequest<CoachView>(leadershipResetApi.coach, { headers })).data as CoachView,
    excel: async () => {
      const response = await fetch(leadershipResetApi.coachExcel, { headers, cache: "no-store" });
      if (!response.ok) throw new Error("Excel belum bisa dibuat. Coba lagi.");
      return response.blob();
    },
  };
}

/** Save a file the browser holds (an Excel, a .txt). */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** localStorage that never throws (private windows, blocked storage). */
export const store = {
  get(key: string): string | null { try { return window.localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { window.localStorage.setItem(key, value); } catch { /* not kept */ } },
  remove(key: string) { try { window.localStorage.removeItem(key); } catch { /* nothing kept */ } },
};

/** The CMS key this device opened last: /refleksi/kelola goes straight there. */
export const CMS_KEY = "lr:cms";
