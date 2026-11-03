"use client";

import { useState } from "react";
import { QrScanner } from "@/components/admin/checkin/QrScanner";
import { Notice } from "@/components/ui";
import { PRA_WAM_PATH } from "@/lib/routes";

/**
 * The in-app scanner. A session QR holds a Pra WAM address; anything else is refused here rather
 * than opened, so a stray QR cannot send the person to another site.
 */
export function CheckInScanner() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  function onScan(text: string) {
    let url: URL;
    try { url = new URL(text, window.location.origin); } catch { setError("QR ini bukan QR absen Pra WAM."); return; }
    if (url.origin !== window.location.origin || !url.pathname.startsWith(`${PRA_WAM_PATH}/absen/`)) { setError("QR ini bukan QR absen Pra WAM."); return; }
    setBusy(true);
    window.location.assign(url.pathname);
  }
  return <div className="stack">
    {error && <Notice tone="error">{error}</Notice>}
    <QrScanner onScan={onScan} paused={busy} />
  </div>;
}
