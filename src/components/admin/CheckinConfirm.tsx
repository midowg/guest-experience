"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import type { CheckinGuest } from "@/lib/tickets";
import { adminRequest, errorMessage } from "./api";
import { CheckinResult } from "./CheckinBoard";

/** After a phone camera opened the QR's address: one tap confirms, so a link preview never checks anyone in. */
export function CheckinConfirm({ eventId, code, guest, timezone }: { eventId: string; code: string; guest: CheckinGuest; timezone: string }) {
  const [result, setResult] = useState<Parameters<typeof CheckinResult>[0]["result"] | null>(
    guest.checked_in_at ? { tone: "again", guest, message: "" } : null);
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true);
    try {
      const response = await adminRequest<{ guest: CheckinGuest; first_time: boolean }>(`/api/admin/events/${eventId}/checkin`, { method: "POST", body: JSON.stringify({ code }) });
      setResult({ tone: response.data!.first_time ? "welcome" : "again", guest: response.data!.guest, message: response.message });
    } catch (cause) { setResult({ tone: "error", message: errorMessage(cause) }); }
    finally { setBusy(false); }
  }
  if (result) return <CheckinResult result={result} timezone={timezone} />;
  return <div className="stack">
    <p><strong>{guest.name}</strong>{guest.organization && <> · {guest.organization}</>}{guest.party_size > 1 && <> · {guest.party_size} orang</>}</p>
    <Button type="button" disabled={busy} onClick={() => void confirm()}>{busy ? "Memproses…" : "Konfirmasi check-in"}</Button>
  </div>;
}
