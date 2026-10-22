"use client";

import { useEffect, useState } from "react";
import { Copy, Download, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { Button } from "@/components/ui";
import type { EventRecord } from "@/lib/types";
import styles from "@/components/admin/admin.module.css";
import { absolute, eventPath } from "@/lib/routes";

const qrOptions = { errorCorrectionLevel: "M" as const, margin: 2, color: { dark: "#0f2747", light: "#ffffff" } };

function save(href: string, name: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.click();
}

/**
 * The general invitation link and its QR code, for printed signage or a slide at the venue. The
 * QR always carries the general link, never a personal one, on the public address (NEXT_PUBLIC_SITE_URL)
 * rather than whichever host the admin happens to be using.
 */
export function PublicLinkCard({ event, origin }: { event: EventRecord; origin: string }) {
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState("");
  const url = absolute(origin, eventPath(event));
  useEffect(() => {
    let live = true;
    void QRCode.toDataURL(url, { ...qrOptions, width: 240 }).then(data => { if (live) setPreview(data); });
    return () => { live = false; };
  }, [url]);

  async function png() {
    save(await QRCode.toDataURL(url, { ...qrOptions, width: 1200 }), `qr-${event.slug}.png`);
    setStatus("QR PNG diunduh.");
  }
  async function svg() {
    const text = await QRCode.toString(url, { ...qrOptions, type: "svg" });
    const href = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
    save(href, `qr-${event.slug}.svg`);
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    setStatus("QR SVG diunduh.");
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setStatus("Tautan umum disalin."); }
    catch { setStatus("Tautan belum dapat disalin. Pilih dan salin teksnya."); }
  }

  return <section className={styles.guestCard} aria-labelledby="public-link-title">
    <h2 id="public-link-title" className={styles.guestCardTitle}><QrCode size={18} aria-hidden="true" /> Tautan umum &amp; QR</h2>
    <div className={styles.qrRow}>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL, nothing to optimise */}
      {preview ? <img src={preview} alt={`QR menuju ${url}`} width={120} height={120} className={styles.qrImage} /> : <span className={styles.qrImage} aria-hidden="true" />}
      <div className={styles.qrText}>
        <p className={styles.qrUrl}>{url}</p>
        <p className="field-hint">Untuk dicetak di meja registrasi, banner, atau slide. Isinya tautan umum, bukan tautan per tamu.{event.status !== "published" && " Tautan baru bisa dibuka tamu setelah acara dipublikasikan."}</p>
        <div className={styles.qrActions}>
          <Button type="button" variant="secondary" onClick={() => void copy()}><Copy size={16} aria-hidden="true" /> Salin tautan</Button>
          <Button type="button" variant="secondary" onClick={() => void png()}><Download size={16} aria-hidden="true" /> Unduh PNG</Button>
          <Button type="button" variant="secondary" onClick={() => void svg()}><Download size={16} aria-hidden="true" /> Unduh SVG</Button>
        </div>
      </div>
    </div>
    <p role="status" className="sr-only">{status}</p>
    {status && <p className={styles.guestMessage} aria-hidden="true">{status}</p>}
  </section>;
}
