"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Notice } from "@/components/ui";
import { Card, ConsoleButton } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { imageProblemLabels, loadFaceEngine } from "@/components/hr/faceEngine";
import { putFile, putProblem } from "@/components/pra-wam/photoUpload";
import { acceptPhotos, encodeWithinLimit, sourceProblem } from "@/lib/pra-wam/photo";
import { hrAdminApi } from "@/lib/routes";
import css from "./hr-admin.module.css";

export type FaceCandidate = { employeeId: string; name: string; department: string; hasFace: boolean };
type Message = { tone: "success" | "error"; text: string } | null;
/** The stored copy: the longest side, enough to see the face; the reading uses the original file. */
const STORED_SIDE = 720;

/** The photo as a smaller WebP or JPEG (200 KB at most), turned upright. */
async function storedCopy(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, STORED_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return encodeWithinLimit((type, quality) => new Promise(resolve => canvas.toBlob(resolve, type, quality)));
}

/**
 * Admin HR → Wajah terdaftar → Unggah foto acuan (21 Nov 2026, the owner's ask after a GreatDay
 * photo was missed): pick the person (those without a face first; anyone else gets a new photo),
 * pick a photo of their face, and it is read here with the phones' engine first. A photo without one
 * clear face is refused before anything is sent. A readable one goes to private storage and is in
 * use at once; their old reference photo is removed.
 */
export function FaceUpload({ candidates, picked, onPick, onDone }: {
  candidates: FaceCandidate[]; picked: string; onPick(employeeId: string): void; onDone(employeeId: string, message: string): void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const input = useRef<HTMLInputElement>(null);
  const personId = useId(), fileId = useId();
  const person = candidates.find(item => item.employeeId === picked) ?? null;
  const without = candidates.filter(item => !item.hasFace);
  const withFace = candidates.filter(item => item.hasFace);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const choose = (next: File | null) => {
    setMessage(null);
    const problem = next ? sourceProblem(next) : null;
    if (problem) { setMessage({ tone: "error", text: problem }); setFile(null); setPreview(null); return; }
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  };

  async function upload() {
    if (!file || !person) return;
    setMessage(null);
    try {
      setStage("Membaca wajah di foto…");
      const engine = await loadFaceEngine();
      const check = await engine.analyzeImage(file);
      if (!check.ok) { setMessage({ tone: "error", text: `${imageProblemLabels[check.reason].replace(/\.?$/, ".")} Pilih foto lain: wajah lurus ke depan, terang, hanya satu orang.` }); return; }
      setStage("Menyiapkan foto…");
      const { blob, mime } = await storedCopy(file);
      setStage("Mengunggah…");
      const start = await adminRequest<{ key: string; uploadUrl: string; token: string }>(hrAdminApi.faceUpload(person.employeeId), { method: "POST", body: JSON.stringify({ mime, size: blob.size }) });
      if (!start.data) throw new Error("Alamat unggah tidak diterima.");
      const problem = putProblem(await putFile(start.data.uploadUrl, blob, mime));
      if (problem) throw new Error(problem);
      setStage("Menyimpan…");
      const saved = await adminRequest<{ status: string }>(hrAdminApi.face(person.employeeId), {
        method: "POST", body: JSON.stringify({ action: "unggah", key: start.data.key, token: start.data.token, mime, size: blob.size, embedding: check.embedding }),
      });
      setFile(null); setPreview(null);
      if (input.current) input.current.value = "";
      onDone(person.employeeId, `${saved.message} (${person.name})`);
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setStage(null); }
  }

  return <Card title="Unggah foto acuan" id="unggah-foto">
    <p className={css.muted}>Untuk karyawan yang fotonya tidak ada di GreatDay, atau untuk mengganti foto yang kurang jelas. Fotonya dibaca dulu di browser ini; bila wajahnya terbaca, langsung dipakai untuk absen. Pakai foto wajah lurus ke depan, terang, hanya satu orang.</p>
    <div className={css.uploadForm}>
      <label className={css.field} htmlFor={personId}>Karyawan
        <select id={personId} value={picked} disabled={Boolean(stage)} onChange={event => { onPick(event.target.value); setMessage(null); }}>
          <option value="">Pilih karyawan</option>
          {without.length > 0 && <optgroup label={`Belum punya wajah (${without.length})`}>
            {without.map(item => <option key={item.employeeId} value={item.employeeId}>{item.name}{item.department ? ` · ${item.department}` : ""}</option>)}
          </optgroup>}
          {withFace.length > 0 && <optgroup label="Ganti foto acuan">
            {withFace.map(item => <option key={item.employeeId} value={item.employeeId}>{item.name}{item.department ? ` · ${item.department}` : ""}</option>)}
          </optgroup>}
        </select>
      </label>
      <label className={css.field} htmlFor={fileId}>Foto wajah
        <input ref={input} id={fileId} type="file" accept={acceptPhotos} disabled={Boolean(stage)} onChange={event => choose(event.target.files?.[0] ?? null)} />
      </label>
      {preview
        // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file
        ? <img className={css.uploadPreview} src={preview} alt={`Pratinjau foto${person ? ` untuk ${person.name}` : ""}`} />
        : <span className={css.uploadPreview} aria-hidden />}
    </div>
    {person?.hasFace && <p className={css.muted}>{person.name} sudah punya wajah acuan; foto baru menggantikannya.</p>}
    {stage && <p className={css.muted} role="status">{stage}</p>}
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <div className={css.actions}>
      <ConsoleButton variant="primary" icon={<Upload size={16} aria-hidden />} disabled={!person || !file || Boolean(stage)} onClick={() => void upload()}>
        {stage ? "Memproses…" : person?.hasFace ? "Ganti foto acuan" : "Unggah dan pakai"}
      </ConsoleButton>
    </div>
  </Card>;
}
