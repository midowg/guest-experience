"use client";

import { useEffect } from "react";
import { PRA_WAM_PATH } from "@/lib/routes";

/** Registers Pra WAM's own service worker (scope /pra-wam/), which makes the app installable. */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`${PRA_WAM_PATH}/sw.js`, { scope: `${PRA_WAM_PATH}/` }).catch(() => undefined);
  }, []);
  return null;
}
