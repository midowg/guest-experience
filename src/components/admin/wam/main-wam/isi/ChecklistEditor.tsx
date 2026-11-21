"use client";

import { useId, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, ListChecks, Plus, Trash2, X } from "lucide-react";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import { putFile, putProblem } from "@/components/pra-wam/photoUpload";
import { CHECKLIST_MAX_ITEMS, CHECKLIST_NOTE_MAX, CHECKLIST_PHOTO_BYTES, CHECKLIST_PHOTO_TYPES, CHECKLIST_TEXT_MAX, type ChecklistPhotoMime, type ChecklistPhotoRef } from "@/lib/main-wam/ceklis/ceklis";
import { blankItem, moveItem, type ChecklistDraft, type ChecklistDraftItem } from "@/lib/main-wam/ceklis/draft";
import { mainWamAdminApi } from "@/lib/routes";
import { SwitchRow } from "./fields";
import css from "./isi.module.css";
import own from "./ceklis.module.css";

/** The longest side of a photo kept for a checklist item (it shows 64–96 px wide on a phone). */
const MAX_SIDE = 900;

/** The photo as WebP (JPEG when the browser cannot), at most MAX_SIDE on its long side. */
async function shrink(file: File): Promise<{ blob: Blob; mime: ChecklistPhotoMime }> {
  if (!file.type.startsWith("image/")) throw new AdminApiError("Pilih berkas gambar (WebP, JPG, atau PNG).");
  const bitmap = await createImageBitmap(file).catch(() => { throw new AdminApiError("Gambar ini tidak bisa dibuka. Coba gambar lain."); });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const toBlob = (mime: ChecklistPhotoMime) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, 0.82));
  const webp = await toBlob("image/webp");
  if (webp && webp.type === "image/webp") return { blob: webp, mime: "image/webp" };
  const jpeg = await toBlob("image/jpeg");
  if (!jpeg) throw new AdminApiError("Gambar ini tidak bisa diperkecil. Coba gambar lain.");
  return { blob: jpeg, mime: "image/jpeg" };
}

/** The server agrees a key, the browser stores the photo, the server checks it (like the guides' files). */
async function uploadPhoto(file: File): Promise<{ ref: ChecklistPhotoRef; preview: string }> {
  const { blob, mime } = await shrink(file);
  if (!(mime in CHECKLIST_PHOTO_TYPES) || blob.size > CHECKLIST_PHOTO_BYTES) throw new AdminApiError("Foto lebih dari 5 MB. Pilih foto yang lebih kecil.");
  const agreed = { mime, size: blob.size };
  const start = await adminRequest<{ key: string; uploadUrl: string; token: string }>(mainWamAdminApi.checklistPhotoStart, { method: "POST", body: JSON.stringify(agreed) });
  const problem = putProblem(await putFile(start.data!.uploadUrl, blob, mime));
  if (problem) throw new AdminApiError(problem);
  const done = await adminRequest<ChecklistPhotoRef>(mainWamAdminApi.checklistPhotoConfirm, { method: "POST", body: JSON.stringify({ ...agreed, key: start.data!.key, token: start.data!.token }) });
  return { ref: done.data!, preview: URL.createObjectURL(blob) };
}

/**
 * Admin WAM → Main WAM → Rundown → the session form's "Ceklis persiapan" (agen S1): the items of an
 * agenda, each a text, a short note and an optional photo, in order, and the switch "Wajib lengkap
 * sebelum absen". It edits a draft the form holds; the form's Simpan saves the checklist too.
 * `ready` is false before the migration (nothing can be saved then, and the section says so).
 */
export function ChecklistEditor({ draft, onChange, ready, problems }: { draft: ChecklistDraft; onChange: (draft: ChecklistDraft) => void; ready: boolean; problems?: Record<string, string> }) {
  const id = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const filled = draft.items.filter(item => item.text.trim()).length;

  const setItems = (items: ChecklistDraftItem[]) => onChange({ ...draft, items });
  const patch = (key: string, change: Partial<ChecklistDraftItem>) => setItems(draft.items.map(item => (item.key === key ? { ...item, ...change } : item)));

  async function pick(item: ChecklistDraftItem, file: File | undefined) {
    if (!file) return;
    setBusy(item.key); setProblem(null);
    try {
      const { ref, preview } = await uploadPhoto(file);
      patch(item.key, { photo: ref, photoUrl: preview });
    } catch (error) { setProblem(errorMessage(error)); }
    finally { setBusy(null); }
  }

  if (!ready) {
    return <fieldset className={css.group}>
      <legend>Ceklis persiapan</legend>
      <p className={css.note}>Ceklis menunggu pembaruan sistem, jadi belum bisa diisi. Hubungi tim CoE.</p>
    </fieldset>;
  }
  return <fieldset className={css.group}>
    <legend>Ceklis persiapan</legend>
    <p className={css.note}>Daftar yang dicentang peserta di agenda ini, mis. perlengkapan sebelum berangkat. Tiap item boleh punya foto contoh. Ceklis hanya tampil bila modul Ceklis menyala di Pengaturan.</p>
    {draft.items.length > 0 && <ol className={own.items} aria-label="Item ceklis">
      {draft.items.map((item, index) => <li key={item.key} className={own.item}>
        <div className={own.photo}>
          {item.photoUrl
            // eslint-disable-next-line @next/next/no-img-element -- a private storage address behind a redirect, or the browser's own copy
            ? <img src={item.photoUrl} alt={`Foto ${item.text || `item ${index + 1}`}`} className={own.photoImage} />
            : <span className={own.photoEmpty} aria-hidden><ImagePlus size={22} /></span>}
          <label className={own.photoButton}>
            <input type="file" accept="image/webp,image/jpeg,image/png" className="sr-only" disabled={busy !== null}
              onChange={event => { void pick(item, event.target.files?.[0]); event.target.value = ""; }} />
            {busy === item.key ? "Mengunggah…" : item.photo ? "Ganti foto" : "Tambah foto"}
          </label>
          {item.photo && <button type="button" className={own.photoRemove} onClick={() => patch(item.key, { photo: null, photoUrl: null })} aria-label={`Hapus foto ${item.text || `item ${index + 1}`}`}><X size={14} aria-hidden />Hapus</button>}
        </div>
        <div className={own.fields}>
          <label className={own.label} htmlFor={`${id}-t${item.key}`}>Item {index + 1}</label>
          <input id={`${id}-t${item.key}`} className="input" value={item.text} maxLength={CHECKLIST_TEXT_MAX} placeholder="mis. Jaket dan baju tebal" onChange={event => patch(item.key, { text: event.target.value })} />
          <label className={own.label} htmlFor={`${id}-n${item.key}`}>Keterangan <span className={css.optional}>(boleh kosong)</span></label>
          <textarea id={`${id}-n${item.key}`} className="textarea" rows={2} value={item.note} maxLength={CHECKLIST_NOTE_MAX} placeholder="mis. Malam di Kota Batu bisa 15–18°C." onChange={event => patch(item.key, { note: event.target.value })} />
        </div>
        <div className={own.moves}>
          <button type="button" className={css.iconButton} disabled={index === 0} onClick={() => setItems(moveItem(draft.items, index, -1))} aria-label={`Naikkan item ${index + 1}`} title="Naikkan"><ArrowUp size={18} aria-hidden /></button>
          <button type="button" className={css.iconButton} disabled={index === draft.items.length - 1} onClick={() => setItems(moveItem(draft.items, index, 1))} aria-label={`Turunkan item ${index + 1}`} title="Turunkan"><ArrowDown size={18} aria-hidden /></button>
          <button type="button" className={`${css.iconButton} ${css.iconDanger}`} onClick={() => setItems(draft.items.filter(entry => entry.key !== item.key))} aria-label={`Hapus item ${index + 1}`} title="Hapus item"><Trash2 size={18} aria-hidden /></button>
        </div>
      </li>)}
    </ol>}
    {problem && <p className={css.error} role="alert">{problem}</p>}
    {problems?.items && <p className={css.error} role="alert">{problems.items}</p>}
    <div className={own.addRow}>
      <button type="button" className={css.textButton} disabled={draft.items.length >= CHECKLIST_MAX_ITEMS || busy !== null} onClick={() => setItems([...draft.items, blankItem()])}>
        <Plus size={18} aria-hidden />Tambah item
      </button>
      <span className={css.hint}><ListChecks size={14} aria-hidden /> {filled} item{draft.items.length >= CHECKLIST_MAX_ITEMS ? ` (paling banyak ${CHECKLIST_MAX_ITEMS})` : ""}</span>
    </div>
    <SwitchRow title="Wajib lengkap sebelum absen" sub="Peserta yang belum melengkapi ceklis ini tidak bisa absen di agenda sesudahnya (tombol Absen terkunci dan menaut ke ceklis). Dimatikan: ceklis hanya pengingat."
      checked={draft.required} disabled={filled === 0} onChange={required => onChange({ ...draft, required })} />
    {problems?.required && <p className={css.error} role="alert">{problems.required}</p>}
  </fieldset>;
}
