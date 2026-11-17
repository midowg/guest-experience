"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { praWamPath } from "@/lib/routes";

/**
 * Nobody signed in while Main WAM is not open to everyone (mode pra or uji): the frame draws
 * nothing of Main WAM (no theme, no tabs, no loading screen; audit M6) and this sends the person to
 * WAM's own sign-in, coming back to the exact address (a QR's, say). Only the browser knows that
 * address in a layout, so this runs there.
 */
export function SignInFirst() {
  const router = useRouter();
  useEffect(() => {
    router.replace(praWamPath.login(`${window.location.pathname}${window.location.search}`));
  }, [router]);
  return null;
}
