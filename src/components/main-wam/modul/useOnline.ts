"use client";

import { useSyncExternalStore } from "react";

const subscribe = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => { window.removeEventListener("online", notify); window.removeEventListener("offline", notify); };
};
/** Online as the browser sees it (true on the server and before hydration). */
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
