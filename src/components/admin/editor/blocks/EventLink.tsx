"use client";

import { useState, type ReactNode } from "react";
import { Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui";
import { absolute, eventPath } from "@/lib/routes";
import type { EventRecord } from "@/lib/types";
import styles from "@/components/admin/admin.module.css";

/**
 * The event's short address (or one of its pages, `path`), ready to copy. The code never changes,
 * so printed links stay valid.
 */
export function EventLink({ event, origin, path, label = "Tautan acara", hint }: { event: EventRecord; origin: string; path?: string; label?: string; hint?: ReactNode }) {
  const [status, setStatus] = useState("");
  const url = absolute(origin, path ?? eventPath(event));
  async function copy() {
    try { await navigator.clipboard.writeText(url); setStatus("Tautan disalin."); }
    catch { setStatus("Tautan belum dapat disalin. Pilih teksnya lalu salin."); }
  }
  return <div className={styles.eventLink}>
    <span className={styles.eventLinkIcon} aria-hidden="true"><Link2 size={18} /></span>
    <div className={styles.eventLinkText}>
      <p className={styles.eventLinkLabel}>{label}</p>
      <p className={styles.eventLinkUrl}>{url.replace(/^https?:\/\//, "")}</p>
      <p className="field-hint">{hint ?? <>Kode <strong>{event.code}</strong> tidak berubah, jadi tautan yang sudah dibagikan atau dicetak tetap berlaku.</>}{event.status !== "published" && " Tamu baru bisa membukanya setelah acara dipublikasikan."}</p>
    </div>
    <Button type="button" variant="secondary" onClick={() => void copy()}><Copy size={16} aria-hidden="true" /> Salin</Button>
    <p role="status" className="sr-only">{status}</p>
  </div>;
}
