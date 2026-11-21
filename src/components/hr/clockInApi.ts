import type { Copy } from "@/lib/hr/copy";
import type { AttendanceRequest, ClockInState, ClockMethod, DailyKind, DailyRecord, FaceStatus, ReasonKind, RequestType } from "@/lib/hr/attendance";
import type { LeaveInput, LeaveRequest, TeamLeave } from "@/lib/hr/leave";
import type { LivenessStep } from "@/lib/hr/liveness";
import { hrApi } from "@/lib/routes";
import { praWamRequest, PraWamApiError } from "@/components/pra-wam/api";
import type { FaceCapture } from "./FaceCamera";
import { putFile, putProblem } from "@/components/pra-wam/photoUpload";

/*
 * Absen harian from the browser: the three steps of src/lib/server/hr/attendance.ts
 * (start → upload the selfie → submit), and the same for enrolment.
 */

export type Challenge = { purpose: DailyKind | "daftar"; nonce: string; steps: LivenessStep[]; token: string; expiresAt: string; method?: ClockMethod };
export type StartAnswer =
  | { kind: "tantangan"; challenge: Challenge; needsConsent: boolean }
  | { kind: "sudah"; record: DailyRecord }
  | { kind: "daftar"; message: string };
export type Place = { lat: number; lng: number; accuracyM: number };

export const loadState = async () => (await praWamRequest<ClockInState>(hrApi.clockIn)).data;
export const startClockIn = async (kind: DailyKind) => (await praWamRequest<StartAnswer>(hrApi.clockInStart, { method: "POST", json: { kind } })).data;
export const startEnroll = async () => (await praWamRequest<Challenge>(hrApi.enrollStart, { method: "POST", json: {} })).data;
export const withdrawFace = async () => (await praWamRequest<null>(hrApi.face, { method: "DELETE" })).message;

/** The selfie into private storage, for this nonce; the agreed key and token come back. */
async function upload(token: string, selfie: FaceCapture["selfie"]) {
  const agreed = { mime: selfie.mime, size: selfie.blob.size };
  const { data } = await praWamRequest<{ key: string; uploadUrl: string; token: string }>(hrApi.clockInUpload, { method: "POST", json: { token, ...agreed } });
  const problem = putProblem(await putFile(data.uploadUrl, selfie.blob, selfie.mime));
  if (problem) throw new PraWamApiError(problem);
  return { ...agreed, key: data.key, token: data.token };
}

export async function submitClockIn(challenge: Challenge, capture: FaceCapture, place: Place, reason: { kind: ReasonKind; text: string } | null, consent: string | null) {
  const selfie = await upload(challenge.token, capture.selfie);
  return praWamRequest<{ kind: "tercatat" | "sudah"; record: DailyRecord }>(hrApi.clockInSubmit, {
    method: "POST",
    json: {
      token: challenge.token, embedding: capture.embedding, frameEmbeddings: capture.frameEmbeddings, signals: capture.signals,
      location: place, selfie, ...(reason ? { reason } : {}), ...(consent ? { consent } : {}),
    },
  });
}

export async function submitEnroll(challenge: Challenge, capture: FaceCapture, consent: string) {
  const photo = await upload(challenge.token, capture.selfie);
  return praWamRequest<{ status: FaceStatus }>(hrApi.enroll, {
    method: "POST",
    json: { consent, token: challenge.token, embeddings: capture.frameEmbeddings, signals: capture.signals, photo },
  });
}

/** The phone's position, as sure as it can be within 15 seconds; a problem in the person's language. */
export function readPlace(t: Copy): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new PraWamApiError(t.place.unsupported)); return; }
    navigator.geolocation.getCurrentPosition(
      position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracyM: Math.round(position.coords.accuracy) }),
      error => reject(new PraWamApiError(
        error.code === error.PERMISSION_DENIED ? t.place.denied : error.code === error.TIMEOUT ? t.place.timeout : t.place.failed,
      )),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

/** Revisi (21 Nov 2026): ask Admin HR to fix one absen; withdraw a waiting one. */
export const submitRequest = async (input: { type: RequestType; workDate: string; kind: DailyKind; recordId: string | null; time: string | null; zone: string; reasonKind: ReasonKind | null; reasonText: string; note: string }) =>
  (await praWamRequest<AttendanceRequest>(hrApi.requests, { method: "POST", json: input })).message;
export const cancelRequest = async (id: string) => (await praWamRequest<null>(hrApi.request(id), { method: "DELETE" })).message;

/** Cuti, sakit, izin and dinas (21 Nov 2026): ask for one, withdraw a waiting one, and the team's month. */
export const submitLeave = async (input: LeaveInput) => (await praWamRequest<LeaveRequest>(hrApi.leaves(), { method: "POST", json: input })).message;
export const cancelLeave = async (id: string) => (await praWamRequest<null>(hrApi.leave(id), { method: "DELETE" })).message;
export const loadTeam = async (month: string) => (await praWamRequest<{ ready: boolean; leaves: TeamLeave[] }>(hrApi.leaves(month))).data;
