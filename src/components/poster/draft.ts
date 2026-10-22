import type { PhotoFrame } from "@/lib/types";

/**
 * The poster someone is making, kept in their own browser (IndexedDB) so a refresh or a closed
 * tab loses nothing. Nothing here is sent anywhere. Any failure (private mode, blocked storage)
 * simply means no draft.
 */
export type PosterDraft = { text: Record<string, string>; photos: Record<string, { blob: Blob; frame: PhotoFrame }>; saved: boolean; palette?: string };

const DB = "studio-poster", STORE = "drafts";

function open(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

export async function loadDraft(eventId: string): Promise<PosterDraft | null> {
  const db = await open();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const request = db.transaction(STORE).objectStore(STORE).get(eventId);
      request.onsuccess = () => resolve((request.result as PosterDraft | undefined) ?? null);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

export async function saveDraft(eventId: string, draft: PosterDraft): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(draft, eventId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch { resolve(); }
  });
}

export async function clearDraft(eventId: string): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete(eventId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch { resolve(); }
  });
}

/** A phone photo made smaller (longest side 2400 px) before it is kept or drawn. */
export async function preparePhoto(file: File): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== "function") return file;
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    if (ratio === 1 && file.size < 4_000_000) { bitmap.close(); return file; }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob ?? file), "image/jpeg", 0.9));
  } catch { return file; }
}
