"use client";

import { useEffect, useState } from "react";
import { FaceCamera, type FaceCapture } from "@/components/hr/FaceCamera";
import { imageProblemLabels, loadFaceEngine, type ImageCheck } from "@/components/hr/faceEngine";
import styles from "@/components/hr/absen.module.css";
import { cosine, FACE_MATCH, faceVerdict, sameFace, scoreLabel } from "@/lib/hr/face-match";
import { challengeDone, pickChallenge, stepPrompt, type LivenessStep } from "@/lib/hr/liveness";

type Run = { at: string; score: number | null; live: boolean; oneFace: boolean; frames: number; selfieKb: number; embedMs: number };
type Photo = { name: string; check: ImageCheck; url: string };

const newNonce = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function Score({ value }: { value: number | null }) {
  if (value === null) return <span>—</span>;
  const verdict = faceVerdict(value);
  return <span className={`${styles.labScore} ${styles[verdict]}`}>{scoreLabel(value)} · {verdict.replace("_", " ")}</span>;
}

/** The calibration lab: everything stays in this tab. */
export function WajahLab() {
  const [mode, setMode] = useState<"idle" | "daftar" | "uji">("idle");
  const [steps, setSteps] = useState<LivenessStep[]>([]);
  const [reference, setReference] = useState<number[] | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [load, setLoad] = useState<string>("Belum dimuat");

  useEffect(() => () => { if (selfie) URL.revokeObjectURL(selfie); }, [selfie]);

  const open = (next: "daftar" | "uji") => { setSteps(pickChallenge(newNonce())); setMode(next); };
  const captured = async (capture: FaceCapture) => {
    const engine = await loadFaceEngine();
    setLoad(`Dimuat ${engine.timings.loadMs} ms · embedding terakhir ${engine.timings.embedMs} ms`);
    setSelfie(URL.createObjectURL(capture.selfie.blob));
    if (mode === "daftar") setReference(capture.embedding);
    setRuns(list => [{
      at: `${mode === "daftar" ? "Daftar" : "Uji"} ${new Date().toLocaleTimeString("id-ID")}`,
      score: mode === "uji" && reference ? cosine(capture.embedding, reference) : null,
      live: challengeDone(capture.steps, capture.signals),
      oneFace: sameFace(capture.frameEmbeddings),
      frames: capture.signals.length,
      selfieKb: Math.round(capture.selfie.blob.size / 1024),
      embedMs: engine.timings.embedMs,
    }, ...list]);
    setMode("idle");
  };

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    const engine = await loadFaceEngine();
    setLoad(`Dimuat ${engine.timings.loadMs} ms`);
    const checked: Photo[] = [];
    for (const file of Array.from(files)) checked.push({ name: file.name, check: await engine.analyzeImage(file), url: URL.createObjectURL(file) });
    setPhotos(list => [...list, ...checked]);
  };

  return <div className={styles.lab}>
    <div className={styles.labCard}>
      <h2>Kalibrasi absen wajah</h2>
      <p>Tidak ada yang diunggah atau disimpan. Ambang sekarang: cocok ≥ {scoreLabel(FACE_MATCH.cocok)}, perlu cek ≥ {scoreLabel(FACE_MATCH.perluCek)}. {load}.</p>
      <div className={styles.actions} style={{ justifyContent: "flex-start" }}>
        <button type="button" className={styles.primary} onClick={() => open("daftar")} disabled={mode !== "idle"}>{reference ? "Daftar ulang wajah" : "Daftar wajah"}</button>
        <button type="button" className={styles.ghost} onClick={() => open("uji")} disabled={mode !== "idle" || !reference}>Uji absen</button>
      </div>
      {mode !== "idle" && <>
        <p>Langkah: {steps.map(stepPrompt).join(" → ")}</p>
        <FaceCamera steps={steps} purpose={mode === "daftar" ? "daftar" : "absen"} onDone={capture => void captured(capture)} onCancel={() => setMode("idle")} />
      </>}
      {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
      {selfie && <img src={selfie} alt="Selfie terakhir" width={160} height={160} style={{ borderRadius: 12 }} />}
    </div>

    {runs.length > 0 && <div className={styles.labCard}>
      <h2>Percobaan</h2>
      <table className={styles.labTable}>
        <thead><tr><th>Waktu</th><th>Skor ke acuan</th><th>Liveness</th><th>Satu wajah</th><th>Frame</th><th>Selfie</th><th>Embed</th></tr></thead>
        <tbody>{runs.map(run => <tr key={run.at}>
          <td>{run.at}</td><td><Score value={run.score} /></td><td>{run.live ? "lulus" : "gagal"}</td><td>{run.oneFace ? "ya" : "tidak"}</td>
          <td>{run.frames}</td><td>{run.selfieKb} KB</td><td>{run.embedMs} ms</td>
        </tr>)}</tbody>
      </table>
    </div>}

    <div className={styles.labCard}>
      <h2>Bandingkan foto</h2>
      <p>Pilih foto dari disk (mis. foto dasar GreatDay). Skor dihitung ke wajah terdaftar di atas dan antar foto.</p>
      <input type="file" accept="image/*" multiple onChange={event => void pick(event.target.files)} />
      {photos.length > 0 && <table className={styles.labTable}>
        <thead><tr><th>Foto</th><th>Hasil</th><th>Ke acuan</th>{photos.map((_, i) => <th key={i}>#{i + 1}</th>)}</tr></thead>
        <tbody>{photos.map((photo, i) => <tr key={photo.url}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
          <td><img src={photo.url} alt="" width={40} height={40} style={{ objectFit: "cover", borderRadius: 6, verticalAlign: "middle" }} /> #{i + 1} {photo.name}</td>
          <td>{photo.check.ok ? `ok · tajam ${Math.round(photo.check.sharpness)}` : imageProblemLabels[photo.check.reason]}</td>
          <td>{photo.check.ok && reference ? <Score value={cosine(photo.check.embedding, reference)} /> : "—"}</td>
          {photos.map((other, j) => <td key={j}>{photo.check.ok && other.check.ok && i !== j ? <Score value={cosine(photo.check.embedding, other.check.embedding)} /> : "—"}</td>)}
        </tr>)}</tbody>
      </table>}
    </div>
  </div>;
}
