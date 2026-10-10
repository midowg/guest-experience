import type { ApiResult } from "@/lib/types";

export class AdminApiError extends Error {
  constructor(message: string, public fieldErrors?: Record<string, string[]>, public status?: number) {
    super(message);
    this.name = "AdminApiError";
  }
}

export async function adminRequest<T>(url: string, init: RequestInit = {}): Promise<ApiResult<T> & { ok: true }> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store", headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new AdminApiError("Tidak dapat terhubung. Periksa jaringan lalu coba lagi. Perubahan belum dikonfirmasi tersimpan.");
  }
  let result: ApiResult<T>;
  try { result = await response.json(); }
  catch { throw new AdminApiError("Server belum dapat memberikan jawaban. Coba lagi atau hubungi pengelola aplikasi.", undefined, response.status); }
  if (!result || typeof result.ok !== "boolean") throw new AdminApiError("Respons server tidak dikenali. Penyimpanan belum dapat dikonfirmasi.", undefined, response.status);
  if (!response.ok || !result.ok) {
    throw new AdminApiError(response.status === 401 ? "Sesi berakhir. Masuk kembali sebelum melanjutkan." : result.message || "Permintaan gagal. Coba lagi.", result.ok ? undefined : result.fieldErrors, response.status);
  }
  return result;
}

export function errorMessage(error: unknown) {
  return error instanceof AdminApiError ? error.message : "Terjadi kesalahan. Muat ulang atau coba lagi.";
}
