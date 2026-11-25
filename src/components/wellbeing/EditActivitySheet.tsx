"use client";

import { useRef, useState } from "react";
import { Check, CircleAlert, CircleX, ImagePlus, Save, X } from "lucide-react";
import { Panel } from "@/components/app-shell/Panel";
import { revalidate, setResource, useResource } from "@/components/app-shell/resource";
import { useToast } from "@/components/app-shell/Toast";
import type { WbAppCatalog, WbMyActivity, WbUploadedPhoto } from "@/lib/wellbeing/app-types";
import { DIMENSIONS, dimensionLabels, earliestDate, MIN_STEPS, PHOTO_MIMES, wibToday } from "@/lib/wellbeing/rules";
import { errorText, uploadPhoto, WellbeingApiError } from "./api";
import { keys, useWellbeing } from "./context";
import { formatDate, num } from "./format";
import { cx } from "./parts";
import css from "./wellbeing.module.css";

/*
 * Ubah aktivitas (25 Nov 2026): my own Catat entry, changed while the admin has not checked it (the
 * detail's Ubah). The same fields as Catat: the activity (of the same kind), the date and time, the
 * steps or the kcal and minutes, the note, and the proof photos (the ones kept, and new ones, uploaded
 * on Simpan). The server checks it all again, as Catat; once the admin has checked it the answer is
 * 409 and the sheet says so. No points while editing, as in Catat; they show after it is saved.
 */

type Picked = { id: string; file: File; url: string };
const objectUrl = (file: File) => typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : "";
const digits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

export function EditActivitySheet({ activity, onClose }: { activity: WbMyActivity | null; onClose: () => void }) {
  return <Panel open={!!activity} onClose={onClose} title="Ubah aktivitas" variant="sheet" tall>
    {activity && <EditForm key={activity.id} activity={activity} onDone={onClose} />}
  </Panel>;
}

function EditForm({ activity, onDone }: { activity: WbMyActivity; onDone: () => void }) {
  const { api } = useWellbeing();
  const toast = useToast();
  const catalog = useResource(keys.catalog, () => api.catalog()).data as WbAppCatalog | undefined;
  const today = catalog?.today ?? wibToday();
  const rules = catalog?.rules;
  const [code, setCode] = useState(activity.typeCode);
  const [date, setDate] = useState(activity.date);
  const [time, setTime] = useState(activity.time ?? "");
  const [steps, setSteps] = useState(activity.steps != null ? String(activity.steps) : "");
  const [kcal, setKcal] = useState(activity.kcal != null ? String(activity.kcal) : "");
  const [minutes, setMinutes] = useState(activity.minutes ? String(activity.minutes) : "");
  const [note, setNote] = useState(activity.note);
  // The photos already on it (its stored keys, shown by their addresses) and the ones picked now.
  const [kept, setKept] = useState(() => activity.photoKeys.map((key, index) => ({ key, url: activity.photos[index] ?? "" })));
  const [picked, setPicked] = useState<Picked[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const max = rules?.maxPhotos ?? 5;
  const count = kept.length + picked.length;

  const sport = activity.kind === "sport";
  const daily = catalog?.daily.find(item => item.code === code);
  const mode = sport ? "kcal" : daily?.mode ?? (activity.steps != null ? "steps" : "fixed");

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const room = Math.max(0, max - count);
    setPicked(current => [...current, ...[...files].slice(0, room).map((file, index) => ({ id: `${Date.now()}-${index}`, file, url: objectUrl(file) }))]);
    setProblem(null);
  }

  function check(): string | null {
    if (!code) return "Pilih kegiatannya.";
    if (!date) return "Isi tanggalnya.";
    if (rules && date < earliestDate(today, rules.backdateDays, rules.programStart)) return "Tanggal itu sudah di luar batas pencatatan.";
    if (date > today) return "Tanggal tidak boleh setelah hari ini.";
    if (mode === "steps" && !(Number(steps) >= MIN_STEPS)) return `Isi jumlah langkah, minimal ${num(MIN_STEPS)}.`;
    if (mode === "kcal" && !(Number(kcal) >= 1)) return "Isi kalorinya.";
    if (count < 1) return "Lampirkan minimal satu foto bukti.";
    return null;
  }

  async function save(force = false) {
    const found = check();
    if (found) { setProblem(found); return; }
    setProblem(null);
    try {
      const uploaded: WbUploadedPhoto[] = [];
      for (let index = 0; index < picked.length; index++) {
        setBusy(`Mengunggah foto ${index + 1} dari ${picked.length}…`);
        uploaded.push(await uploadPhoto(api, picked[index].file, () => {}));
      }
      setBusy("Menyimpan…");
      const result = await api.updateActivity(activity.id, {
        code, date, time: time || null, note: note.trim(), force,
        steps: mode === "steps" ? Number(steps) : null, kcal: mode === "kcal" ? Number(kcal) : null, minutes: mode === "kcal" && minutes ? Number(minutes) : null,
        photos: [...kept.map(photo => ({ key: photo.key })), ...uploaded],
      });
      // The detail, the lists, Beranda and Peringkat show the change.
      setResource(keys.activity(activity.id), () => result.activity);
      revalidate(keys.all);
      toast({ message: "Aktivitas diperbarui.", tone: "ok" });
      onDone();
    } catch (error) {
      // Strava already has this sport that day: as in Catat, it may be saved anyway.
      if (error instanceof WellbeingApiError && error.code === "strava_twin" && !force) {
        setBusy(null);
        if (window.confirm(`${error.message}\n\nSimpan juga?`)) void save(true);
        return;
      }
      setProblem(errorText(error));
    } finally { setBusy(null); }
  }

  const dailyByDimension = DIMENSIONS.map(dimension => [dimension, (catalog?.daily ?? []).filter(item => item.dimension === dimension)] as const).filter(([, list]) => list.length);
  return <form className={css.editForm} onSubmit={event => { event.preventDefault(); void save(); }}>
    <p className={cx(css.note, css.noteInfo)} style={{ marginTop: 0 }}><Check size={20} aria-hidden="true" /><span>Belum diperiksa admin, jadi masih bisa diubah. Setelah disimpan, poinnya mengikuti data baru.</span></p>
    <div className={css.field}>
      <label className={css.fieldLabel} htmlFor="edit-code">Kegiatan</label>
      <select id="edit-code" className={cx(css.input, css.select)} value={code} onChange={event => setCode(event.target.value)} disabled={!catalog || !!busy}>
        {!catalog && <option value={code}>{activity.typeName}</option>}
        {catalog && (sport
          ? catalog.sports.map(item => <option key={item.code} value={item.code}>{item.name}</option>)
          : dailyByDimension.map(([dimension, list]) => <optgroup key={dimension} label={dimensionLabels[dimension]}>
              {list.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</optgroup>))}
      </select>
    </div>
    <div className={css.grid2}>
      <div className={css.field}>
        <label className={css.fieldLabel} htmlFor="edit-date">Tanggal</label>
        <input id="edit-date" className={css.input} type="date" value={date} max={today} disabled={!!busy}
          min={rules ? earliestDate(today, rules.backdateDays, rules.programStart) : undefined} onChange={event => setDate(event.target.value)} />
      </div>
      <div className={css.field}>
        <label className={css.fieldLabel} htmlFor="edit-time">Jam <span className={css.faint}>(opsional)</span></label>
        <input id="edit-time" className={css.input} type="time" value={time} disabled={!!busy} onChange={event => setTime(event.target.value)} />
      </div>
    </div>
    {mode === "steps" && <div className={css.field}>
      <label className={css.fieldLabel} htmlFor="edit-steps">Jumlah langkah</label>
      <div className={css.inputWrap}><input id="edit-steps" className={css.input} inputMode="numeric" value={steps} disabled={!!busy} onChange={event => setSteps(digits(event.target.value, 6))} /><span className={css.suffix}>langkah</span></div>
      <span className={css.help}>Minimal {num(MIN_STEPS)} langkah.</span>
    </div>}
    {mode === "kcal" && <div className={css.grid2}>
      <div className={css.field}>
        <label className={css.fieldLabel} htmlFor="edit-kcal">Kalori</label>
        <div className={css.inputWrap}><input id="edit-kcal" className={css.input} inputMode="numeric" value={kcal} disabled={!!busy} onChange={event => setKcal(digits(event.target.value, 5))} /><span className={css.suffix}>kkal</span></div>
      </div>
      <div className={css.field}>
        <label className={css.fieldLabel} htmlFor="edit-minutes">Durasi <span className={css.faint}>(opsional)</span></label>
        <div className={css.inputWrap}><input id="edit-minutes" className={css.input} inputMode="numeric" value={minutes} disabled={!!busy} onChange={event => setMinutes(digits(event.target.value, 4))} /><span className={css.suffix}>menit</span></div>
      </div>
    </div>}
    <div className={css.field}>
      <label className={css.fieldLabel} htmlFor="edit-note">Catatan <span className={css.faint}>(opsional)</span></label>
      <textarea id="edit-note" className={css.input} maxLength={300} value={note} disabled={!!busy} onChange={event => setNote(event.target.value)} />
    </div>
    <div className={css.field}>
      <span className={css.fieldLabel} id="edit-photos-label">Foto bukti</span>
      <div className={css.photos} role="group" aria-labelledby="edit-photos-label">
        {kept.map((photo, index) => <div key={photo.key} className={css.ph}>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed storage addresses */}
          {photo.url ? <img src={photo.url} alt={`Foto bukti ${index + 1}`} /> : <ImagePlus size={24} aria-hidden="true" />}
          {!busy && <button type="button" className={css.phRemove} onClick={() => setKept(current => current.filter(item => item.key !== photo.key))} aria-label={`Hapus foto ${index + 1}`}><X size={18} aria-hidden="true" /></button>}
        </div>)}
        {picked.map((photo, index) => <div key={photo.id} className={css.ph}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob:) of the chosen file */}
          {photo.url ? <img src={photo.url} alt={`Foto baru ${index + 1}`} /> : <ImagePlus size={24} aria-hidden="true" />}
          {!busy && <button type="button" className={css.phRemove} onClick={() => setPicked(current => current.filter(item => item.id !== photo.id))} aria-label={`Hapus foto baru ${index + 1}`}><X size={18} aria-hidden="true" /></button>}
        </div>)}
        {count < max && <button type="button" className={cx(css.ph, css.phAdd)} onClick={() => fileInput.current?.click()} disabled={!!busy}>
          <ImagePlus size={24} aria-hidden="true" /><span>Tambah</span></button>}
      </div>
      <span className={css.help}>Minimal 1, maksimal {num(max)} foto.</span>
      <input ref={fileInput} type="file" accept={PHOTO_MIMES.join(",")} multiple hidden data-testid="edit-file" onChange={event => { addFiles(event.target.files); event.target.value = ""; }} />
    </div>
    {problem && <p className={cx(css.note, css.noteErr)} role="alert"><CircleX size={20} aria-hidden="true" /><span>{problem}</span></p>}
    {busy && <p className={cx(css.caption, css.faint)} role="status" style={{ display: "flex", gap: 8, alignItems: "center" }}><span className={css.spin} aria-hidden="true" />{busy}</p>}
    <button type="submit" className={cx(css.btn, css.btnPrimary, css.block)} disabled={!!busy} aria-busy={!!busy}>
      {busy ? <span className={css.spin} aria-hidden="true" /> : <Save size={20} aria-hidden="true" />}{busy ? "Menyimpan…" : "Simpan perubahan"}</button>
    <p className={cx(css.caption, css.faint, css.center)}><CircleAlert size={12} aria-hidden="true" /> Dicatat {formatDate(activity.createdAt.slice(0, 10), { day: "numeric", month: "long" })}</p>
  </form>;
}
