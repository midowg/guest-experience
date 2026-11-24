"use client";

import { useState } from "react";
import { isDemoFile } from "@/lib/main-wam/momen/viewer";
import { mainWamApi } from "@/lib/routes";

/**
 * A photo's picture comes from a short-lived storage address in the list (storage.ts VIEW_POLICY:
 * besar 10–15 minutes, kecil 1–2 hours). A list kept open longer than that would show broken
 * pictures, so on the first error the picture is fetched once more through the server
 * (mainWamApi.photoFile: access checked again, a fresh address). A second error stays an error
 * (the photo was hidden or deleted meanwhile); the tinted placeholder under it shows.
 */
export function useFreshAddress(id: string, size: "kecil" | "besar", src: string | null): { src: string | null; onError: () => void } {
  const [failed, setFailed] = useState<string | null>(null);
  // A sample picture (Mode demo) is a local file: asking the server for another address would only fail again.
  const stale = !!src && failed === src && !isDemoFile(src);
  return {
    src: !src ? null : stale ? mainWamApi.photoFile(id, size) : src,
    onError: () => { if (src && failed !== src) setFailed(src); },
  };
}
