"use client";

import { useState } from "react";
import { FaceTablet, type TabletDemo } from "@/components/pra-wam/FaceTablet";
import type { KioskCandidate } from "@/lib/pra-wam/face-kiosk";
import styles from "@/components/pra-wam/pra-wam.module.css";

const SAMPLE = "/figur/ada-lovelace.webp";
const NOW = Date.now();
const at = new Date(NOW).toISOString();
const overview = { total: 40, withFace: 34, present: 23, opens: new Date(NOW - 600_000).toISOString(), closes: new Date(NOW + 3_600_000).toISOString() };
const candidate = (employeeId: string, name: string, department: string, percent: number): KioskCandidate =>
  ({ employeeId, name, department, percent, referenceUrl: SAMPLE, token: "contoh", upload: { key: "contoh", uploadUrl: "", token: "contoh" } });
const recent: TabletDemo["recent"] = [
  { key: "1", name: "Ayu Lestari", department: "Comms", at, tone: "good" },
  { key: "2", name: "Rizky Pratama", department: "Finance", at, tone: "warn" },
  { key: "3", name: "Dewi Anggraini", department: "Creative", at, tone: "good" },
];
const box = (tone: TabletDemo["faces"][number]["tone"], label: string | null) => [
  { id: 1, left: 520, top: 170, width: 230, height: 280, tone, label, main: true },
  { id: -1, left: 180, top: 230, width: 120, height: 150, tone: "lacak" as const, label: null, main: false },
];
const states: Record<string, TabletDemo | null> = {
  mulai: null,
  cari: { faces: box("lacak", "Tahan sebentar…"), banners: [], confirm: null, recent, present: 23 },
  baca: { faces: box("baca", "Membaca wajah…"), banners: [], confirm: null, recent, present: 23 },
  cocok: { faces: box("good", "Budi Santoso"), banners: [{ tone: "good", title: "Budi Santoso", text: "Tercatat hadir 09.42" }], confirm: null, recent, present: 24 },
  "belum dikenali": { faces: box("bad", "Belum dikenali"), banners: [{ tone: "bad", title: "Wajah belum dikenali", text: "Scan QR di ruang, atau lapor panitia." }], confirm: null, recent, present: 23 },
  "belum setuju": { faces: box("warn", "Sari Wulandari"), banners: [{ tone: "warn", title: "Sari Wulandari belum bisa absen wajah", text: "Setujui dulu sekali lewat Absen pakai wajah di HP, atau scan QR." }], confirm: null, recent, present: 23 },
  "tiga sekaligus": {
    faces: [
      { id: 1, left: 250, top: 190, width: 190, height: 230, tone: "good", label: "Budi Santoso", main: true },
      { id: 2, left: 560, top: 160, width: 210, height: 250, tone: "baca", label: "Membaca wajah…", main: true },
      { id: 3, left: 860, top: 230, width: 150, height: 180, tone: "good", label: "Dewi Anggraini", main: true },
      { id: 4, left: 80, top: 300, width: 90, height: 110, tone: "lacak", label: "Mendekat sedikit", main: false },
    ],
    banners: [{ tone: "good", title: "Budi Santoso", text: "Tercatat hadir 09.42" }, { tone: "good", title: "Dewi Anggraini", text: "Tercatat hadir 09.42" }],
    confirm: null, recent, present: 25,
  },
  konfirmasi: { faces: box("baca", "Membaca wajah…"), banners: [], confirm: { photoUrl: SAMPLE, candidates: [candidate("a", "Budi Santoso", "Finance", 71), candidate("b", "Bayu Saputra", "IT", 68)] }, recent, present: 23 },
};

export function FaceTabletPreview() {
  const [pick, setPick] = useState("cocok");
  const demo = states[pick];
  return <div className={styles.app}>
    <FaceTablet key={pick} sessionId="contoh" title="Forum Komunikasi Q4" when="Senin, 9 Nov 2026 · 10.00–12.00" backHref="#"
      overview={overview} demo={demo ?? undefined} />
    <label style={{ position: "fixed", left: 12, bottom: 12, zIndex: 400, padding: "6px 10px", borderRadius: 10, background: "#fff", color: "#111", fontSize: 13 }}>
      Keadaan: <select value={pick} onChange={event => setPick(event.target.value)}>{Object.keys(states).map(key => <option key={key}>{key}</option>)}</select>
    </label>
  </div>;
}
