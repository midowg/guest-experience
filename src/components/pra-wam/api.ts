import { bookingPath, praWamApi, praWamPath } from "@/lib/routes";

export type Conflict = { kind: "room" | "participants"; sameRoom?: { start: string; end: string }[]; otherRooms?: string[]; people?: string[] };

export class PraWamApiError extends Error {
  constructor(message: string, public status?: number, public fieldErrors?: Record<string, string[]>, public conflict?: Conflict) {
    super(message);
    this.name = "PraWamApiError";
  }
}

/** JSON in and out; an ended session goes back to the sign-in page and returns here afterwards. */
export async function praWamRequest<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<{ data: T; message: string }> {
  const { json, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(url, { ...rest, credentials: "same-origin", cache: "no-store", ...(json !== undefined ? { body: JSON.stringify(json), headers: { "Content-Type": "application/json", ...rest.headers } } : {}) });
  } catch {
    throw new PraWamApiError("Tidak dapat terhubung. Periksa jaringan lalu coba lagi.");
  }
  let result: { ok: boolean; data?: T; message?: string; fieldErrors?: Record<string, string[]>; conflict?: Conflict };
  try { result = await response.json(); } catch { throw new PraWamApiError("Server belum dapat memberikan jawaban. Coba lagi sebentar.", response.status); }
  // A 401 from signing in or from an emailed link means a wrong password or an old link: the form
  // shows the message. From anywhere else it means the session ended.
  const signingIn = url === praWamApi.login || url === praWamApi.resetPassword || url === praWamApi.password;
  if (response.status === 401 && !signingIn && typeof window !== "undefined") {
    // Booking Kantor (/booking) signs in on its own page with the same account (11 Nov 2026).
    const here = `${window.location.pathname}${window.location.search}`;
    window.location.assign(window.location.pathname.startsWith(bookingPath.home) ? bookingPath.login(here) : praWamPath.login(here));
  }
  if (!response.ok || !result.ok) throw new PraWamApiError(result.message || "Permintaan gagal. Coba lagi.", response.status, result.fieldErrors, result.conflict);
  return { data: result.data as T, message: result.message ?? "" };
}

export const errorText = (error: unknown) => error instanceof Error && error.name === "PraWamApiError" ? error.message : "Terjadi kesalahan. Muat ulang lalu coba lagi.";
