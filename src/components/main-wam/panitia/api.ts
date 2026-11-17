"use client";

import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import type { AttendeeRow } from "@/lib/main-wam/panitia/attendance";
import type { AnnounceInput, ModerateInput, PresentInput, RundownChangeInput } from "@/lib/main-wam/panitia/schemas";
import { mainWamApi } from "@/lib/routes";

/*
 * The panitia screens talk to the server through this one object, so dev-preview can hand them a
 * stand-in (PanitiaApiContext) and the tests a mock. The real one calls the addresses in routes.ts
 * (area C's own, and area D's silentControl for Buka/Tutup Silent Meeting).
 */

export class PanitiaError extends Error {
  constructor(message: string, public status = 0, public fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = "PanitiaError";
  }
}
export const errorText = (error: unknown) => (error instanceof PanitiaError ? error.message : "Terjadi kesalahan. Coba lagi.");

/** JSON in and out. A session that ended reloads the page, so the gate sends the person to sign in and back. */
export async function panitiaRequest<T>(url: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "GET", credentials: "same-origin", cache: "no-store",
      ...(init.json !== undefined ? { body: JSON.stringify(init.json), headers: { "Content-Type": "application/json" } } : {}),
    });
  } catch {
    throw new PanitiaError("Tidak ada koneksi. Coba lagi saat sinyal kembali.");
  }
  let result: { ok?: boolean; data?: T; message?: string; fieldErrors?: Record<string, string[]> };
  try { result = await response.json(); } catch { throw new PanitiaError("Server belum dapat memberikan jawaban. Coba lagi sebentar.", response.status); }
  if (response.status === 401 && typeof window !== "undefined") window.location.reload();
  if (!response.ok || !result.ok) throw new PanitiaError(result.message || "Permintaan gagal. Coba lagi.", response.status, result.fieldErrors);
  return result.data as T;
}

export type RundownChangeAnswer = { changed: number; notified: boolean; recipients: number; versions: Record<string, string> };

export type PanitiaApi = {
  changeSession: (id: string, input: RundownChangeInput) => Promise<RundownChangeAnswer>;
  /** Area D's control: open or close a Silent Meeting by hand. */
  silent: (questionId: string, action: "buka" | "tutup") => Promise<void>;
  attendance: (sessionId: string) => Promise<{ rows: AttendeeRow[] }>;
  setPresent: (sessionId: string, input: PresentInput) => Promise<{ rows: AttendeeRow[] }>;
  announce: (input: AnnounceInput) => Promise<{ count: number }>;
  unpin: (id: string) => Promise<void>;
  removeAnnouncement: (id: string) => Promise<void>;
  moderate: (id: string, input: ModerateInput) => Promise<void>;
  /** The server's latest for this screen (router.refresh). */
  refresh: () => void;
  navigate: (href: string) => void;
};

export function httpApi(router: { refresh: () => void; push: (href: string) => void }): PanitiaApi {
  return {
    changeSession: (id, input) => panitiaRequest(mainWamApi.rundownSession(id), { method: "PATCH", json: input }),
    silent: async (questionId, action) => { await panitiaRequest(mainWamApi.silentControl(questionId), { method: "POST", json: { action } }); },
    attendance: sessionId => panitiaRequest(mainWamApi.attendance(sessionId)),
    setPresent: (sessionId, input) => panitiaRequest(mainWamApi.attendance(sessionId), { method: "POST", json: input }),
    announce: input => panitiaRequest(mainWamApi.announcements, { method: "POST", json: input }),
    unpin: async id => { await panitiaRequest(mainWamApi.announcement(id), { method: "PATCH", json: { pinnedUntil: null } }); },
    removeAnnouncement: async id => { await panitiaRequest(mainWamApi.announcement(id), { method: "DELETE" }); },
    moderate: async (id, input) => { await panitiaRequest(mainWamApi.moderatePhoto(id), { method: "POST", json: input }); },
    refresh: () => router.refresh(),
    navigate: href => router.push(href),
  };
}

export const PanitiaApiContext = createContext<PanitiaApi | null>(null);

/** The API for this screen: the stand-in when one is given (dev-preview, tests), else the real one. */
export function usePanitiaApi(): PanitiaApi {
  const given = useContext(PanitiaApiContext);
  const router = useRouter();
  const real = useMemo(() => httpApi(router), [router]);
  return given ?? real;
}

/**
 * Local state that starts from the server's value and starts over whenever the server sends a new
 * one (after router.refresh), so an optimistic change shows at once and the server's answer wins.
 */
export function useServerState<T>(value: T): [T, Dispatch<SetStateAction<T>>] {
  const [seen, setSeen] = useState(value);
  const [state, setState] = useState(value);
  if (seen !== value) { setSeen(value); setState(value); }
  return [state, setState];
}

/**
 * From one sheet or dialog straight to another (a menu → Pindah tempat; a detail → Hapus): the kit's
 * modals each own a history entry, and the first one takes its entry back asynchronously when it
 * closes, which would close the second one too. So: close the first, and open the next once its
 * history step is done (popstate), or at once when it held no entry.
 */
export function afterModal(close: () => void, next: () => void): void {
  const holding = typeof window !== "undefined" && !!(window.history.state as { mwSheet?: string } | null)?.mwSheet;
  close();
  if (!holding) { next(); return; }
  let done = false;
  const go = () => { if (done) return; done = true; window.removeEventListener("popstate", go); window.clearTimeout(timer); next(); };
  window.addEventListener("popstate", go);
  const timer = window.setTimeout(go, 1500);
}

/** False while the phone says it is offline (shown as a banner; data already on screen stays). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}

/**
 * Runs `tick` every `ms` while the screen is visible and `paused` is false (other panitia's changes
 * show without a reload), and once when the app comes back to the front.
 */
export function useLiveRefresh(tick: () => void, ms: number, paused: boolean): void {
  useEffect(() => {
    if (paused) return;
    const run = () => { if (document.visibilityState === "visible") tick(); };
    const timer = window.setInterval(run, ms);
    const onShow = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onShow); };
  }, [tick, ms, paused]);
}
