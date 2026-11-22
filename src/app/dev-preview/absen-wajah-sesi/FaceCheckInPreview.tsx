"use client";

import { useState } from "react";
import { FaceCheckIn, FaceResult, type FaceClient } from "@/components/pra-wam/FaceCheckIn";
import type { FaceCheckInAnswer } from "@/lib/pra-wam/attendance";
import styles from "@/components/pra-wam/pra-wam.module.css";

const SAMPLE = "/figur/ada-lovelace.webp";
const results: Record<string, FaceCheckInAnswer> = {
  cocok: { kind: "tercatat", checkedInAt: new Date().toISOString(), method: "wajah", percent: 92, status: "cocok" },
  "perlu cek": { kind: "tercatat", checkedInAt: new Date().toISOString(), method: "wajah", percent: 64, status: "perlu_cek" },
  "tidak cocok": { kind: "tidak-cocok", percent: 21 },
  sudah: { kind: "sudah", checkedInAt: new Date().toISOString(), method: "qr", percent: null },
};

/** The real camera and face reader; the "server" answers with the chosen result. */
export function FaceCheckInPreview() {
  const [pick, setPick] = useState("cocok");
  const [consent, setConsent] = useState(false);
  const client: FaceClient = {
    start: async () => ({ kind: "mulai", token: "contoh", expiresAt: new Date(Date.now() + 180_000).toISOString(), needsConsent: consent, referenceUrl: SAMPLE }),
    send: async () => { await new Promise(resolve => setTimeout(resolve, 800)); return results[pick]; },
  };
  return <div className={styles.app}><main style={{ maxWidth: 420, margin: "0 auto", padding: 16, display: "grid", gap: 16 }}>
    <h1 style={{ margin: 0, fontSize: 20 }}>Absen pakai wajah (contoh)</h1>
    <label>Hasil server: <select value={pick} onChange={event => setPick(event.target.value)}>{Object.keys(results).map(key => <option key={key}>{key}</option>)}</select></label>
    <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> Foto impor (minta persetujuan)</label>
    <FaceCheckIn sessionId="contoh" canTap client={client} />
    {Object.entries(results).map(([key, answer]) => <section key={key} style={{ border: "1px solid var(--pw-line, #ddd)", borderRadius: 16 }}>
      <p style={{ margin: "8px 16px 0", fontSize: 12, fontWeight: 700 }}>Hasil: {key}</p>
      <FaceResult answer={answer} photoUrl={SAMPLE} referenceUrl={SAMPLE} onRetry={() => undefined} onDone={() => undefined} />
    </section>)}
  </main></div>;
}
