"use client";

import { useState } from "react";
import { praWamApi, praWamPath } from "@/lib/routes";
import { praWamRequest } from "./api";

export function SignOutButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  return <button type="button" className={className} disabled={busy} onClick={async () => {
    setBusy(true);
    try { await praWamRequest(praWamApi.logout, { method: "POST" }); } catch { /* the cookie may already be gone */ }
    window.location.assign(praWamPath.login());
  }}>{busy ? "Keluar…" : "Keluar"}</button>;
}
