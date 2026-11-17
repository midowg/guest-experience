/*
 * JSON to and from the module APIs (agen D). An ended session reloads the screen: its gate sends the
 * person to the right sign-in page (Main WAM's or Pra WAM's) and back here. No connection is told
 * apart (`offline`), so a screen can keep the person's text and say so.
 */

export class ModulError extends Error {
  constructor(message: string, public status = 0, public offline = false) {
    super(message);
    this.name = "ModulError";
  }
}

export async function modulRequest<T>(url: string, init: { method?: string; json?: unknown } = {}): Promise<{ data: T; message: string }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "GET", credentials: "same-origin", cache: "no-store",
      ...(init.json !== undefined ? { body: JSON.stringify(init.json), headers: { "Content-Type": "application/json" } } : {}),
    });
  } catch {
    throw new ModulError("Tidak ada sinyal. Coba lagi saat tersambung.", 0, true);
  }
  let result: { ok?: boolean; data?: T; message?: string } = {};
  try { result = await response.json(); } catch { /* not JSON */ }
  if (response.status === 401 && typeof window !== "undefined") window.location.reload();
  if (!response.ok || !result.ok) throw new ModulError(result.message || "Belum berhasil. Coba lagi sebentar.", response.status);
  return { data: result.data as T, message: result.message ?? "" };
}

/** The words to show for any failure. */
export const errorText = (error: unknown) => (error instanceof ModulError ? error.message : "Belum berhasil. Coba lagi sebentar.");
