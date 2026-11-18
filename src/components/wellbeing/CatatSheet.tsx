"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, CircleAlert, Crown, Dumbbell, ImagePlus, Info, NotebookPen, PauseCircle, ScanText, TrendingUp, TriangleAlert, X } from "lucide-react";
import { Panel } from "@/components/app-shell/Panel";
import { load, revalidate, setResource, useResource } from "@/components/app-shell/resource";
import type { WbAppCatalog, WbBoardRow, WbCatalogDaily, WbHome, WbLogResult, WbRules, WbUploadedPhoto } from "@/lib/wellbeing/app-types";
import { dateProblem, DIMENSIONS, dimensionLabels, earliestDate, MIN_STEPS, PHOTO_MIMES, wibToday, type DimensionId } from "@/lib/wellbeing/rules";
import { errorText, isCancelled, uploadPhoto, WellbeingApiError } from "./api";
import { keys, reducedMotion, useWellbeing, type CatatPreset } from "./context";
import { ALREADY_LOGGED, catatErrors, clockLabel, dayLabel, firstError, firstName, formatDate, num, type CatatErrors, type CatatField } from "./format";
import { dimensionIcons, Icon, sportIcon } from "./icons";
import { StreakFlame } from "./Flame";
import { readPhotoText, type OcrStage } from "./ocr";
import { cx, ErrorState, Preparing, SkRows } from "./parts";
import { litToday } from "./race";
import { readProof, type ProofReading } from "./read-proof";
import css from "./wellbeing.module.css";

/*
 * Catat (17 Nov 2026): one tall sheet in steps. Kegiatan harian: dimensi, kegiatan, detail.
 * Olahraga: the sport, the date, the kcal (1 kkal = 1 poin) and the duration. Proof photos (1 to
 * the programme's maximum) upload one by one with their own progress, then the activity is sent.
 * A Strava twin can be saved anyway; a limit or the same day is explained, a day already logged
 * before any upload. Batalkan stops a save; closing the sheet keeps the draft for next time.
 *
 * Dari foto (18 Nov 2026): pick a proof photo first; its text is read on the phone (Tesseract,
 * ocr.ts) and turned into the activity, date, steps, kcal and duration (read-proof.ts). The form
 * opens filled, the read fields marked, and the person checks it and saves. A photo added later in
 * the form is read too, and fills only what is still empty.
 */

type Step = "kind" | "scan" | "review" | "dim" | "type" | "detail" | "sport" | "done";
type AutoField = "sport" | "date" | "time" | "steps" | "kcal" | "minutes" | "note";
/** What the photo gave: shown above the form, the fields it filled marked until edited. */
type FromPhoto = { summary: string[]; missing: string[]; filled: AutoField[] };
type Reading = { url: string; stage: OcrStage; progress: number; mode: "entry" | "inline" };
type Photo = {
  id: string; file: File; url: string; progress: number | null;
  /** Uploaded, and when (its token lasts an hour). */
  uploaded: WbUploadedPhoto | null; uploadedAt: number;
  failed: boolean;
  /** The server refused this file (too big, wrong type): it has to be replaced. */
  refused: boolean;
};
type Problem = { text: string; twin: boolean };
const DEFAULT_RULES: WbRules = { backdateDays: null, programStart: "2026-05-22", maxKcal: 3000, maxSteps: 60000, maxPhotos: 5 };
const FIELD_IDS: Record<CatatField, string> = { sport: "catat-sport", date: "catat-date", time: "catat-time", steps: "catat-steps", kcal: "catat-kcal", minutes: "catat-minutes", photos: "catat-photos" };
/** An upload token lasts an hour; older than this, the photo is uploaded again before sending. */
const UPLOAD_FRESH_MS = 55 * 60_000;
const REPLACE_PHOTO = "Ganti atau hapus foto yang ditandai.";
const digits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);
const objectUrl = (file: File) => typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : "";
const dropUrl = (url: string) => { if (url && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url); };
let photoSerial = 0;

/** Catat ulang starts on the old date while it may still be logged, else today. */
function startDate(preset: CatatPreset | null) {
  const today = wibToday();
  return preset?.date && !dateProblem(preset.date, today, DEFAULT_RULES.backdateDays) ? preset.date : today;
}

export function CatatSheet({ open, preset, onClose, onSaved }: { open: boolean; preset: CatatPreset | null; onClose: () => void; onSaved: () => void }) {
  const { api } = useWellbeing();
  const catalog = useResource(open ? keys.catalog : null, () => api.catalog());
  // The month's board (shared with Beranda): after a save, how far the one to catch still is.
  const monthBoard = useResource(open ? keys.board("month", "all") : null, () => api.leaderboard("month", "all"));
  const cat = catalog.data;
  const rules = cat?.rules ?? DEFAULT_RULES;
  // Admin Wellbeing → Aplikasi karyawan: photo reading on/off, Catat paused with a message.
  const photoReading = cat?.controls?.photoReading ?? true;
  const pausedMessage = cat?.controls?.pausedMessage ?? null;
  const today = useMemo(() => cat?.today ?? wibToday(), [cat?.today]);

  const sportPreset = preset?.kind === "sport" || !!preset?.code?.startsWith("sport.");
  const [step, setStep] = useState<Step>(preset?.code ? (sportPreset ? "sport" : "detail") : preset?.kind === "sport" ? "sport" : "kind");
  const [dir, setDir] = useState<"fwd" | "back" | null>(null);
  const [kind, setKind] = useState<"daily" | "sport" | null>(preset?.code || preset?.kind ? (sportPreset ? "sport" : "daily") : null);
  const [dim, setDim] = useState<DimensionId | null>(null);
  const [code, setCode] = useState<string | null>(preset?.code ?? null);
  const [form, setForm] = useState(() => ({ date: startDate(preset), time: "", steps: "", kcal: "", minutes: "", note: "" }));
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [tried, setTried] = useState(false);
  const [serverErrors, setServerErrors] = useState<CatatErrors>({});
  const [problem, setProblem] = useState<Problem | null>(null);
  const [saving, setSaving] = useState<{ label: string; progress: number } | null>(null);
  // rankBefore: my place before this save (null: none yet; undefined: Beranda had not loaded). ahead: the one I was chasing.
  // lit: this save lit today's streak flame (the first activity of the day), as Duolingo celebrates it.
  const [result, setResult] = useState<(WbLogResult & { rankBefore: number | null | undefined; ahead: WbBoardRow | null; lit: boolean }) | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [fromPhoto, setFromPhoto] = useState<FromPhoto | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [dateTouched, setDateTouched] = useState(false);
  // The next picked photo starts "Dari foto"; a reading that was left (Isi manual, Catat lagi) is ignored.
  const scanIntent = useRef(false);
  const scanRound = useRef(0);
  const catalogNow = useRef<WbAppCatalog | undefined>(undefined);
  useEffect(() => { catalogNow.current = cat; }, [cat]);
  const fileInput = useRef<HTMLInputElement>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  const abort = useRef<AbortController | null>(null);
  // The draft's photos are let go only when the draft itself is (unmounted after a save, or Catat lagi).
  const kept = useRef<Photo[]>([]);
  useEffect(() => { kept.current = photos; }, [photos]);
  useEffect(() => () => { abort.current?.abort(); kept.current.forEach(photo => dropUrl(photo.url)); }, []);
  // Done: say so (the sheet's title is empty there).
  useEffect(() => { if (step === "done") doneHeading.current?.focus({ preventScroll: true }); }, [step]);

  const type: WbCatalogDaily | undefined = kind === "daily" ? cat?.daily.find(item => item.code === code) : undefined;
  const sport = kind === "sport" ? cat?.sports.find(item => item.code === code) : undefined;
  const typeDim = type?.dimension ?? dim;
  const mode = kind === "sport" ? "kcal" as const : type?.mode ?? "fixed";
  const draft = { kind: kind ?? "daily", code, mode, fixedPoints: type?.points ?? 0, date: form.date, time: form.time, steps: form.steps, kcal: form.kcal, minutes: form.minutes, photos: photos.length, loggedOn: type?.loggedOn };
  const check = (): CatatErrors => {
    const found = catatErrors(draft, rules, today);
    if (!found.photos && photos.some(photo => photo.refused)) found.photos = REPLACE_PHOTO;
    return found;
  };
  const live = check();
  // A day already logged shows at once (before any upload); the rest after the first Simpan.
  const errors: CatatErrors = { ...(tried ? live : live.date === ALREADY_LOGGED ? { date: live.date } : {}), ...serverErrors };

  function goStep(next: Step, direction: "fwd" | "back") { setDir(direction); setStep(next); setProblem(null); if (next !== "kind") setScanNote(null); }
  function set(field: keyof typeof form, value: string) {
    setForm(current => ({ ...current, [field]: value }));
    if (field === "date") setDateTouched(true);
    if (fromPhoto?.filled.includes(field as AutoField)) setFromPhoto(current => current && { ...current, filled: current.filled.filter(item => item !== field) });
    if (serverErrors[field as CatatField]) setServerErrors(current => ({ ...current, [field]: undefined }));
    if (problem && field !== "note") setProblem(null);
  }
  function reset() {
    photos.forEach(photo => dropUrl(photo.url));
    setPhotos([]); setKind(null); setDim(null); setCode(null); setForm({ date: today, time: "", steps: "", kcal: "", minutes: "", note: "" });
    setTried(false); setServerErrors({}); setProblem(null); setResult(null);
    scanRound.current += 1; setReading(null); setFromPhoto(null); setScanNote(null); setDateTouched(false);
    goStep("kind", "back");
  }
  function addFiles(files: FileList | null): Photo[] {
    const room = rules.maxPhotos - photos.length;
    const all = [...(files ?? [])];
    const fits = all.filter(file => (PHOTO_MIMES as readonly string[]).includes(file.type));
    const picked = fits.slice(0, Math.max(0, room));
    const skipped = all.length - fits.length ? "Foto harus berupa JPG, PNG, atau WebP." : fits.length > picked.length ? `Maksimal ${num(rules.maxPhotos)} foto.` : undefined;
    const added: Photo[] = picked.map(file => ({ id: `photo-${++photoSerial}`, file, url: objectUrl(file), progress: null, uploaded: null, uploadedAt: 0, failed: false, refused: false }));
    if (added.length) setPhotos(current => [...current, ...added]);
    setServerErrors(current => ({ ...current, photos: skipped }));
    return added;
  }

  /* ---------- Dari foto ---------- */

  function pickForScan() { scanIntent.current = true; setScanNote(null); fileInput.current?.click(); }
  function pickPhotos() { scanIntent.current = false; fileInput.current?.click(); }
  function leaveScan(note: string) { scanRound.current += 1; setReading(null); goStep("kind", "back"); setScanNote(note); }

  /** Read a photo: "entry" (Dari foto) opens the form it found; "inline" (a photo added in the form) fills what is empty. */
  async function scanPhoto(photo: Photo, mode: Reading["mode"]) {
    const round = ++scanRound.current;
    setReading({ url: photo.url, stage: "load", progress: 0, mode });
    if (mode === "entry") goStep("scan", "fwd");
    let text: string;
    try {
      text = await readPhotoText(photo.file, value => { if (scanRound.current === round) setReading(current => current && { ...current, ...value }); });
    } catch {
      if (scanRound.current !== round) return;
      setReading(null);
      if (mode === "entry") leaveScan("Foto belum bisa dibaca (pertama kali perlu internet). Foto tetap terlampir: pilih jenis kegiatan, lalu isi datanya.");
      else setFromPhoto({ summary: [], missing: ["datanya"], filled: [] });
      return;
    }
    const catalogData = catalogNow.current ?? await load(keys.catalog, () => api.catalog());
    if (scanRound.current !== round) return;
    setReading(null);
    if (!catalogData?.migrated) { if (mode === "entry") leaveScan("Foto tetap terlampir: pilih jenis kegiatan."); return; }
    applyReading(readProof(text, { today: catalogData.today, backdateDays: catalogData.rules.backdateDays, programStart: catalogData.rules.programStart, sports: catalogData.sports, daily: catalogData.daily }), mode, catalogData);
  }

  function applyReading(found: ProofReading, mode: Reading["mode"], catalogData: WbAppCatalog) {
    if (mode === "entry" && !found.kind) { leaveScan("Tidak ada data yang terbaca dari foto. Foto tetap terlampir: pilih jenis kegiatan, lalu isi datanya."); return; }
    // Inline, the kind already chosen stays; the reading only fills what is empty.
    const nextKind = mode === "entry" ? found.kind : kind;
    const nextCode = mode === "entry" ? found.code : code ?? (found.kind === kind ? found.code : null);
    const dailyType = nextKind === "daily" ? catalogData.daily.find(item => item.code === nextCode) : undefined;
    const sportType = nextKind === "sport" ? catalogData.sports.find(item => item.code === nextCode) : undefined;
    const filled: AutoField[] = [];
    const next = { ...form };
    if (found.date && (mode === "entry" || !dateTouched)) { next.date = found.date; filled.push("date"); }
    if (found.time && (mode === "entry" || !form.time)) { next.time = found.time; filled.push("time"); }
    if (found.title && !form.note.trim()) { next.note = found.title; filled.push("note"); }
    if (dailyType?.mode === "steps" && found.steps != null && (mode === "entry" || !form.steps)) { next.steps = String(found.steps); filled.push("steps"); }
    if (nextKind === "sport" && found.kcal != null && (mode === "entry" || !form.kcal)) { next.kcal = String(found.kcal); filled.push("kcal"); }
    if (nextKind === "sport" && found.minutes != null && (mode === "entry" || !form.minutes)) { next.minutes = String(found.minutes); filled.push("minutes"); }
    if (nextCode && nextCode !== code) filled.push("sport");
    setForm(next);
    if (mode === "entry") {
      setKind(nextKind); setCode(nextCode); setTried(false); setServerErrors({});
      if (dailyType) setDim(dailyType.dimension);
    } else if (nextCode !== code) setCode(nextCode);

    const summary = [
      sportType?.name ?? (dailyType && dailyType.mode !== "steps" ? dailyType.name : null),
      filled.includes("steps") ? `${num(Number(next.steps))} langkah` : null,
      filled.includes("kcal") ? `${num(Number(next.kcal))} kkal` : null,
      filled.includes("minutes") ? `${num(Number(next.minutes))} menit` : null,
      filled.includes("date") ? `${formatDate(next.date, { day: "numeric", month: "short" })}${filled.includes("time") ? ` ${clockLabel(next.time)}` : ""}` : filled.includes("time") ? clockLabel(next.time) : null,
    ].filter((item): item is string => !!item);
    const missing = nextKind === "sport"
      ? [!nextCode ? "jenis olahraga" : null, !next.kcal ? "kalori" : null].filter((item): item is string => !!item)
      : dailyType?.mode === "steps" && !next.steps ? ["jumlah langkah"] : [];
    setFromPhoto({ summary, missing, filled });
    // One screen to check everything the photo gave, then Simpan.
    if (mode === "entry") goStep("review", "fwd");
  }

  function onFilesPicked(files: FileList | null) {
    const added = addFiles(files);
    const entry = scanIntent.current;
    scanIntent.current = false;
    if (!added.length) return;
    if (entry) { void scanPhoto(added[0], "entry"); return; }
    // A photo added in the form is read when it can still fill something.
    const empty = (kind === "sport" && (!form.kcal || !code)) || (type?.mode === "steps" && !form.steps);
    if (photoReading && (step === "sport" || step === "detail") && empty && !reading) void scanPhoto(added[0], "inline");
  }
  function removePhoto(id: string) {
    setPhotos(current => { const gone = current.find(photo => photo.id === id); if (gone) dropUrl(gone.url); return current.filter(photo => photo.id !== id); });
    setServerErrors(current => ({ ...current, photos: undefined }));
  }
  const patchPhoto = (id: string, change: Partial<Photo>) => setPhotos(current => current.map(photo => photo.id === id ? { ...photo, ...change } : photo));

  function showFirstError(found: CatatErrors) {
    const field = firstError(found);
    if (!field) return;
    const element = document.getElementById(FIELD_IDS[field]);
    element?.scrollIntoView?.({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
    if (element instanceof HTMLInputElement) element.focus({ preventScroll: true });
  }

  async function save(force = false) {
    if (saving) return;
    setTried(true); setServerErrors({}); setProblem(null);
    const found = check();
    if (firstError(found) || !code) { showFirstError(found); return; }
    const controller = new AbortController();
    abort.current = controller;
    const list = photos;
    const uploaded: WbUploadedPhoto[] = [];
    let index = 0;
    try {
      for (; index < list.length; index++) {
        const photo = list[index];
        // Still fresh: send it as it is. Older than ~55 minutes: its token is about to end, upload again.
        if (photo.uploaded && Date.now() - photo.uploadedAt < UPLOAD_FRESH_MS) { uploaded.push(photo.uploaded); continue; }
        const label = `Mengunggah foto ${index + 1} dari ${list.length}…`;
        const at = index;
        setSaving({ label, progress: at / list.length });
        patchPhoto(photo.id, { progress: 0, failed: false, uploaded: null, uploadedAt: 0 });
        const done = await uploadPhoto(api, photo.file, fraction => {
          patchPhoto(photo.id, { progress: fraction });
          setSaving({ label, progress: (at + fraction) / list.length });
        }, controller.signal);
        patchPhoto(photo.id, { uploaded: done, uploadedAt: Date.now(), progress: 1 });
        uploaded.push(done);
      }
    } catch (error) {
      abort.current = null;
      setSaving(null);
      const photo = list[index];
      if (isCancelled(error)) { patchPhoto(photo.id, { progress: null }); return; }
      if (error instanceof WellbeingApiError && error.status === 422) {
        // This file cannot be used (too big, wrong type): told once, on the photos, until it is replaced.
        patchPhoto(photo.id, { refused: true, progress: null });
        setServerErrors({ photos: `Foto ${index + 1}: ${error.message} ${REPLACE_PHOTO}` });
        showFirstError({ photos: "x" });
        return;
      }
      patchPhoto(photo.id, { failed: true, progress: null });
      setProblem({ text: `Foto ${index + 1} gagal diunggah. ${errorText(error)}`, twin: false });
      return;
    }
    setSaving({ label: "Menyimpan…", progress: 1 });
    try {
      const answer = await api.log({
        code, date: form.date, time: form.time || null, note: form.note.trim(), photos: uploaded,
        steps: mode === "steps" ? Number(form.steps) : null,
        kcal: mode === "kcal" ? Number(form.kcal) : null,
        minutes: mode === "kcal" && form.minutes ? Number(form.minutes) : null,
        ...(force ? { force: true } : {}),
      }, { signal: controller.signal });
      abort.current = null;
      // Beranda changes at once (the place before is kept, to tell a climb); then every screen refreshes from the server.
      let rankBefore = undefined as number | null | undefined, litBefore = true;
      setResource<WbHome>(keys.home, current => {
        rankBefore = current ? current.totals.rank : undefined;
        // Unknown before (Beranda had not loaded): no celebration rather than a wrong one.
        litBefore = current ? litToday(current.totals, today) : true;
        return current && { ...current, totals: answer.totals, recent: [answer.activity, ...current.recent.filter(item => item.id !== answer.activity.id)].slice(0, 5) };
      });
      const lit = !litBefore && litToday(answer.totals, today);
      setResult({ ...answer, rankBefore, ahead: monthBoard.data?.migrated ? monthBoard.data.ahead : null, lit }); setSaving(null); goStep("done", "fwd");
      onSaved();
      revalidate(keys.all);
      try { if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(12); } catch { /* no vibration */ }
    } catch (error) {
      abort.current = null;
      setSaving(null);
      if (isCancelled(error)) return;
      const refused = error instanceof WellbeingApiError ? error : null;
      if (refused?.code === "strava_twin") { setProblem({ text: refused.message, twin: true }); return; }
      // Anything but a limit, or a word about the photos: the server may have let the uploads go, so they go up again next time.
      if (!refused || refused.status !== 409 || refused.field("photos")) setPhotos(current => current.map(photo => ({ ...photo, uploaded: null, uploadedAt: 0, progress: null })));
      if (refused?.fieldErrors) {
        const fields: CatatErrors = {};
        for (const field of ["date", "time", "steps", "kcal", "minutes", "photos"] as const) { const text = refused.field(field); if (text) fields[field] = text; }
        if (kind === "sport" && refused.status !== 409 && refused.field("code")) fields.sport = refused.field("code");
        setServerErrors(fields);
        showFirstError(fields);
      }
      setProblem({ text: errorText(error), twin: false });
    }
  }

  /* ---------- steps ---------- */

  let title = "Catat aktivitas", onBack: (() => void) | undefined, body: React.ReactNode, footer: React.ReactNode = null;
  const needsCatalog = step !== "kind" && step !== "done";
  if (cat && !cat.migrated && step !== "done") {
    body = <Preparing />;
  } else if (needsCatalog && !cat) {
    body = catalog.error ? <ErrorState message={catalog.error} onRetry={() => void catalog.reload()} /> : <SkRows rows={5} />;
    onBack = () => goStep("kind", "back");
  } else if (step === "kind" && pausedMessage) {
    body = <div className={css.state} role="status">
      <div className={cx(css.lead, css.toneWarn)}><PauseCircle size={24} aria-hidden="true" /></div>
      <h2 className={css.sub}>Pencatatan sedang dijeda</h2>
      <p>{pausedMessage}</p>
      <button type="button" className={cx(css.btn, css.btnOutline)} onClick={onClose}>Tutup</button>
    </div>;
  } else if (step === "kind") {
    body = <>
      {scanNote && <p className={cx(css.note, css.noteWarn)} role="status" style={{ marginTop: 0, marginBottom: 12 }}><ScanText size={20} aria-hidden="true" /><span>{scanNote}</span></p>}
      {photoReading && <>
        <button type="button" className={cx(css.opt, css.optHero, css.pressable)} onClick={pickForScan} style={{ marginTop: 0 }}>
          <span className={cx(css.lead, css.leadLg, css.toneScan)}><ScanText size={26} aria-hidden="true" /></span>
          <span className={css.rowMain}><b className={css.sub}>Dari foto bukti</b><span>Screenshot aplikasi atau foto layar jam. Data dibaca otomatis di HP-mu, kamu tinggal periksa.</span></span>
          <ChevronRight size={20} className={css.chev} aria-hidden="true" />
        </button>
        <p className={css.optDivider}>atau isi sendiri</p>
      </>}
      <button type="button" className={cx(css.opt, css.pressable)} onClick={() => { setKind("daily"); goStep("dim", "fwd"); }}>
        <span className={cx(css.lead, css.leadLg, css.tonePrimary)}><NotebookPen size={26} aria-hidden="true" /></span>
        <span className={css.rowMain}><b className={css.sub}>Kegiatan harian</b><span>Emosional, sosial, finansial, spiritual, dan langkah.</span></span>
        <ChevronRight size={20} className={css.chev} aria-hidden="true" />
      </button>
      <button type="button" className={cx(css.opt, css.pressable)} onClick={() => { setKind("sport"); setCode(null); goStep("sport", "fwd"); }}>
        <span className={cx(css.lead, css.leadLg)} data-dim="physical"><Dumbbell size={26} aria-hidden="true" /></span>
        <span className={css.rowMain}><b className={css.sub}>Olahraga</b><span>Lari, sepeda, renang, badminton, dan lainnya.</span></span>
        <ChevronRight size={20} className={css.chev} aria-hidden="true" />
      </button>
      <p className={css.note}><Info size={20} aria-hidden="true" /><span>Sinkron Strava segera hadir. Sementara ini, olahraga dicatat lewat <b>Olahraga</b>.</span></p>
    </>;
  } else if (step === "scan") {
    title = "Membaca foto"; onBack = () => leaveScan("Foto tetap terlampir: pilih jenis kegiatan, lalu isi datanya.");
    const percent = Math.round((reading?.stage === "read" ? 0.15 + (reading.progress * 0.85) : (reading?.progress ?? 0) * 0.15) * 100);
    body = <div className={css.scan} role="status" aria-live="polite">
      <div className={css.scanFrame}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob:) of the chosen file */}
        {reading?.url ? <img src={reading.url} alt="Foto yang sedang dibaca" /> : <ImagePlus size={32} aria-hidden="true" />}
        <span className={css.scanLine} aria-hidden="true" />
      </div>
      <p className={css.sub}>{reading?.stage === "read" ? "Membaca angka di foto…" : "Menyiapkan pembaca foto…"}</p>
      <p className={cx(css.caption, css.muted)}>{reading?.stage === "read" ? "Dibaca di HP-mu; foto tidak dikirim ke layanan lain untuk dibaca." : "Pertama kali mengunduh ±7 MB, berikutnya langsung."}</p>
      <div className={css.progress} role="progressbar" aria-label="Kemajuan membaca foto" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} style={{ width: "100%", marginTop: 16 }}><i style={{ width: `${Math.max(4, percent)}%` }} /></div>
    </div>;
    footer = <button type="button" className={cx(css.btn, css.btnOutline, css.block)} onClick={() => leaveScan("Foto tetap terlampir: pilih jenis kegiatan, lalu isi datanya.")}>Isi manual</button>;
  } else if (step === "review" && cat) {
    // Periksa hasil foto: the photo on top, everything it gave below, each field correctable, then Simpan.
    title = "Periksa hasil foto"; onBack = () => leaveScan("Foto tetap terlampir: pilih jenis kegiatan, lalu isi datanya.");
    const auto = (field: AutoField) => fromPhoto?.filled.includes(field) || undefined;
    const choose = (value: string) => {
      const daily = cat.daily.find(item => item.code === value);
      setKind(daily ? "daily" : "sport"); setCode(value || null); if (daily) setDim(daily.dimension);
      setServerErrors(current => ({ ...current, sport: undefined })); setProblem(null);
      setFromPhoto(current => current && { ...current, filled: current.filled.filter(field => field !== "sport") });
    };
    body = <>
      <div className={css.reviewHead}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob:) of the chosen file */}
        {photos[0]?.url ? <img src={photos[0].url} alt="Foto yang dibaca" className={css.reviewPhoto} /> : <span className={css.reviewPhoto}><ImagePlus size={24} aria-hidden="true" /></span>}
        <div className={css.rowMain} role="status">
          <b className={css.sub}><ScanText size={18} aria-hidden="true" /> {fromPhoto?.summary.length ? "Terbaca dari foto" : "Belum ada angka terbaca"}</b>
          <span className={css.rowMetaWrap}>{fromPhoto?.summary.length ? fromPhoto.summary.join(" · ") : "Isi datanya di bawah."}</span>
          <span className={cx(css.caption, css.muted)}>{fromPhoto?.missing.length ? `Lengkapi ${fromPhoto.missing.join(" dan ")}. ` : ""}Periksa dan perbaiki bila perlu, lalu simpan.</span>
        </div>
      </div>
      <div className={css.field}>
        <label className={css.fieldLabel} htmlFor={FIELD_IDS.sport}>Kegiatan</label>
        <select id={FIELD_IDS.sport} className={cx(css.input, css.select)} value={code ?? ""} data-auto={(!!code && auto("sport")) || undefined} aria-invalid={!!errors.sport} onChange={event => choose(event.target.value)}>
          <option value="" disabled>Pilih kegiatan…</option>
          <optgroup label="Olahraga">{cat.sports.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</optgroup>
          {DIMENSIONS.map(dimension => {
            const list = cat.daily.filter(item => item.dimension === dimension && (!item.blocked || item.limit === "day"));
            return list.length ? <optgroup key={dimension} label={`Harian · ${dimensionLabels[dimension]}`}>{list.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</optgroup> : null;
          })}
        </select>
        <FieldError text={errors.sport} />
      </div>
      <WhenFields date={form.date} time={form.time} today={today} rules={rules} errors={errors} filled={fromPhoto?.filled ?? []} onChange={set} />
      {mode === "kcal" && <div className={css.grid2}>
        <div className={css.field}>
          <label className={css.fieldLabel} htmlFor={FIELD_IDS.kcal}>Kalori</label>
          <div className={css.inputWrap}><input id={FIELD_IDS.kcal} className={css.input} inputMode="numeric" autoComplete="off" placeholder="0" value={form.kcal} aria-invalid={!!errors.kcal} data-auto={auto("kcal")}
            onChange={event => set("kcal", digits(event.target.value, String(rules.maxKcal).length))} /><span className={css.suffix}>kkal</span></div>
          <FieldError text={errors.kcal} />
        </div>
        <div className={css.field}>
          <label className={css.fieldLabel} htmlFor={FIELD_IDS.minutes}>Durasi <span className={css.faint}>(opsional)</span></label>
          <div className={css.inputWrap}><input id={FIELD_IDS.minutes} className={css.input} inputMode="numeric" autoComplete="off" placeholder="0" value={form.minutes} aria-invalid={!!errors.minutes} data-auto={auto("minutes")}
            onChange={event => set("minutes", digits(event.target.value, 4))} /><span className={css.suffix}>menit</span></div>
          <FieldError text={errors.minutes} />
        </div>
      </div>}
      {mode === "steps" && <div className={css.field}>
        <label className={css.fieldLabel} htmlFor={FIELD_IDS.steps}>Jumlah langkah</label>
        <div className={css.inputWrap}><input id={FIELD_IDS.steps} className={css.input} inputMode="numeric" autoComplete="off" placeholder="mis. 8000" value={form.steps} data-auto={auto("steps")}
          aria-invalid={!!errors.steps} onChange={event => set("steps", digits(event.target.value, String(rules.maxSteps).length))} /><span className={css.suffix}>langkah</span></div>
        <FieldError text={errors.steps} />
      </div>}
      <NoteField value={form.note} placeholder="Nama acara atau cerita singkat" label="Catatan / nama acara" auto={auto("note")} onChange={value => set("note", value)} />
      <Photos photos={photos} max={rules.maxPhotos} hint={sport?.proofHint || type?.proofHint || "Foto bukti"} error={errors.photos} busy={!!saving} onAdd={pickPhotos} onRemove={removePhoto} />
    </>;
  } else if (step === "dim" && cat) {
    title = "Kegiatan harian"; onBack = () => goStep("kind", "back");
    body = <>
      <p className={css.muted}>Pilih dimensi.</p>
      <div className={cx(css.card, css.list)} style={{ marginTop: 12 }}>
        {DIMENSIONS.filter(dimension => cat.daily.some(item => item.dimension === dimension)).map(dimension => {
          const count = cat.daily.filter(item => item.dimension === dimension).length;
          const onlySteps = count === 1 && cat.daily.find(item => item.dimension === dimension)?.mode === "steps";
          return <button key={dimension} type="button" className={cx(css.row, css.pressable)} onClick={() => { setDim(dimension); goStep("type", "fwd"); }}>
            <span className={css.lead} data-dim={dimension}><Icon of={dimensionIcons[dimension]} size={22} /></span>
            <span className={css.rowMain}><span className={css.rowTitle}>{dimensionLabels[dimension]}</span><span className={css.rowMeta}>{onlySteps ? "Langkah harian" : `${count} kegiatan`}</span></span>
            <ChevronRight size={20} className={css.chev} aria-hidden="true" />
          </button>;
        })}
      </div>
    </>;
  } else if (step === "type" && cat && dim) {
    title = dimensionLabels[dim]; onBack = () => goStep("dim", "back");
    const list = cat.daily.filter(item => item.dimension === dim);
    body = <>
      <p className={css.muted}>Pilih kegiatan.</p>
      <div className={cx(css.card, css.list)} style={{ marginTop: 12 }}>
        {list.map(item => {
          // Only a monthly limit closes a type; once a day is a matter of the date (checked in the next step).
          const closed = !!item.blocked && item.limit !== "day";
          return <button key={item.code} type="button" className={cx(css.row, css.rowTall, css.pressable)} disabled={closed}
          onClick={() => { if (code !== item.code) setForm(current => ({ ...current, steps: "" })); setCode(item.code); setTried(false); setServerErrors({}); goStep("detail", "fwd"); }}>
          <span className={css.lead} data-dim={item.dimension}><Icon of={item.mode === "steps" ? sportIcon("walking") : dimensionIcons[item.dimension]} size={22} /></span>
          <span className={css.rowMain}>
            <span className={cx(css.rowTitle, css.wrap)}>{item.name}</span>
            <span className={css.rowMetaWrap}>{closed ? <b className={css.warnText}>{item.blocked}</b> : item.proofHint}{!closed && item.limit === "month" ? " · 1x per bulan" : ""}</span>
            {!closed && item.loggedOn.includes(today) && <span className={cx(css.caption, css.faint)}>Sudah dicatat hari ini</span>}
          </span>
          {/* No points while choosing (18 Nov 2026, as the old app): they show once it is saved. */}
          <ChevronRight size={20} className={css.chev} aria-hidden="true" />
        </button>;
        })}
      </div>
      {dim === "physical" && <p className={css.note}><Info size={20} aria-hidden="true" /><span>Lari, sepeda, renang, dan lainnya dicatat lewat <b>Olahraga</b>.
        <span className={css.noteActions}><button type="button" className={cx(css.btn, css.btnOutline)} onClick={() => { setKind("sport"); setCode(null); goStep("sport", "fwd"); }}>Catat olahraga</button></span></span></p>}
    </>;
  } else if (step === "detail" && cat) {
    title = "Detail"; onBack = () => { if (typeDim) setDim(typeDim); goStep(typeDim ? "type" : "dim", "back"); };
    body = !type ? <p className={cx(css.note, css.noteErr)}><CircleAlert size={20} aria-hidden="true" /><span>Kegiatan ini tidak ada lagi di daftar. Pilih kegiatan lain.</span></p> : <>
      <div className={cx(css.card, css.sum)}>
        <span className={css.lead} data-dim={type.dimension}><Icon of={type.mode === "steps" ? sportIcon("walking") : dimensionIcons[type.dimension]} size={22} /></span>
        <div className={css.rowMain}><b className={css.wrap}>{type.name}</b><span className={css.rowMeta}>{dimensionLabels[type.dimension]}</span></div>
      </div>
      {type.blocked && type.limit === "month" && <p className={cx(css.note, css.noteWarn)}><TriangleAlert size={20} aria-hidden="true" /><span>{type.blocked}</span></p>}
      <PhotoBanner reading={reading} fromPhoto={fromPhoto} />
      <WhenFields date={form.date} time={form.time} today={today} rules={rules} errors={errors} filled={fromPhoto?.filled ?? []} onChange={set} />
      {type.mode === "steps" && <div className={css.field}>
        <label className={css.fieldLabel} htmlFor={FIELD_IDS.steps}>Jumlah langkah</label>
        <div className={css.inputWrap}><input id={FIELD_IDS.steps} className={css.input} inputMode="numeric" autoComplete="off" placeholder="mis. 8000" value={form.steps} data-auto={fromPhoto?.filled.includes("steps") || undefined}
          aria-invalid={!!errors.steps} aria-describedby="catat-steps-help" onChange={event => set("steps", digits(event.target.value, String(rules.maxSteps).length))} /><span className={css.suffix}>langkah</span></div>
        <span className={css.help} id="catat-steps-help" aria-live="polite">{`Minimal ${num(MIN_STEPS)} langkah.`}</span>
        <FieldError text={errors.steps} />
      </div>}
      <Photos photos={photos} max={rules.maxPhotos} hint={type.proofHint} error={errors.photos} busy={!!saving} onAdd={pickPhotos} onRemove={removePhoto} />
      <NoteField value={form.note} placeholder="Ceritakan singkat kegiatannya" onChange={value => set("note", value)} />
    </>;
  } else if (step === "sport" && cat) {
    title = "Olahraga"; onBack = () => goStep("kind", "back");
    body = <>
      <PhotoBanner reading={reading} fromPhoto={fromPhoto} />
      <div className={css.field} style={{ marginTop: 4 }}>
        <span className={css.fieldLabel} id="catat-sport-label">Jenis olahraga</span>
        <div className={css.sportGrid} role="group" aria-labelledby="catat-sport-label" id={FIELD_IDS.sport}>
          {cat.sports.map(item => <button key={item.code} type="button" className={css.sport} aria-pressed={code === item.code} data-auto={(code === item.code && fromPhoto?.filled.includes("sport")) || undefined}
            onClick={() => { setCode(item.code); setServerErrors(current => ({ ...current, sport: undefined })); setProblem(null); setFromPhoto(current => current && { ...current, filled: current.filled.filter(field => field !== "sport") }); }}>
            <Icon of={sportIcon(item.code, item.name)} size={24} /><span>{item.name}</span>
          </button>)}
        </div>
        <FieldError text={errors.sport} />
      </div>
      <WhenFields date={form.date} time={form.time} today={today} rules={rules} errors={errors} filled={fromPhoto?.filled ?? []} onChange={set} />
      <div className={css.grid2}>
        <div className={css.field}>
          <label className={css.fieldLabel} htmlFor={FIELD_IDS.kcal}>Kalori</label>
          <div className={css.inputWrap}><input id={FIELD_IDS.kcal} className={css.input} inputMode="numeric" autoComplete="off" placeholder="0" value={form.kcal} aria-invalid={!!errors.kcal} data-auto={fromPhoto?.filled.includes("kcal") || undefined}
            aria-describedby="catat-kcal-help" onChange={event => set("kcal", digits(event.target.value, String(rules.maxKcal).length))} /><span className={css.suffix}>kkal</span></div>
        </div>
        <div className={css.field}>
          <label className={css.fieldLabel} htmlFor={FIELD_IDS.minutes}>Durasi <span className={css.faint}>(opsional)</span></label>
          <div className={css.inputWrap}><input id={FIELD_IDS.minutes} className={css.input} inputMode="numeric" autoComplete="off" placeholder="0" value={form.minutes} aria-invalid={!!errors.minutes} data-auto={fromPhoto?.filled.includes("minutes") || undefined}
            onChange={event => set("minutes", digits(event.target.value, 4))} /><span className={css.suffix}>menit</span></div>
        </div>
      </div>
      <p className={css.help} id="catat-kcal-help" style={{ marginTop: 6 }}>Kalori dari jam tangan atau aplikasi olahraga, maksimal {num(rules.maxKcal)} kkal.</p>
      <FieldError text={errors.kcal} />
      <FieldError text={errors.minutes} />
      <Photos photos={photos} max={rules.maxPhotos} hint={sport?.proofHint || "Foto layar jam atau aplikasi yang menunjukkan kalori"} error={errors.photos} busy={!!saving} onAdd={pickPhotos} onRemove={removePhoto} />
      <NoteField value={form.note} placeholder="mis. Main badminton bareng tim" onChange={value => set("note", value)} />
    </>;
  } else if (step === "done" && result) {
    title = "";
    body = <>
      <div className={css.done} role="status">
        <div className={css.doneMark}><Check size={48} strokeWidth={2.5} aria-hidden="true" /></div>
        <h3 ref={doneHeading} tabIndex={-1} className={css.headline}>Tercatat</h3>
        <p className={css.muted}>{result.activity.title || result.activity.typeName} · {dayLabel(result.activity.date, today)}{result.activity.time ? ` · ${clockLabel(result.activity.time)}` : ""}</p>
        <p className={css.donePts}>+{num(result.activity.points)} poin</p>
        <p className={css.muted}>Total poinmu sekarang <b>{num(result.totals.points)}</b></p>
        <RankAfter result={result} />
        {result.lit && <p className={css.streakUp}><StreakFlame lit ignite size={30} /><span><b>{num(result.totals.streak)}</b> hari beruntun · api hari ini menyala</span></p>}
      </div>
      <p className={css.note}><Info size={20} aria-hidden="true" /><span>Poin langsung masuk. Admin bisa memeriksa bukti; kalau ada yang diubah atau ditolak, alasannya muncul di Riwayat.</span></p>
    </>;
    footer = <div className={css.btnRow}>
      <button type="button" className={cx(css.btn, css.btnOutline)} onClick={reset}>Catat lagi</button>
      <button type="button" className={cx(css.btn, css.btnPrimary)} onClick={onClose}>Selesai</button>
    </div>;
  }

  if ((step === "detail" && type) || (step === "sport" && cat) || (step === "review" && cat)) {
    footer = <div className={css.foot}>
      {problem && (problem.twin
        ? <div className={cx(css.note, css.noteWarn)} role="alert"><TriangleAlert size={20} aria-hidden="true" /><span>{problem.text}
            <span className={css.noteActions}><button type="button" className={cx(css.btn, css.btnOutline)} onClick={() => void save(true)}>Tetap simpan</button></span></span></div>
        : <div className={cx(css.note, css.noteErr)} role="alert"><CircleAlert size={20} aria-hidden="true" /><span>{problem.text}</span></div>)}
      {saving && <div className={css.progress} role="progressbar" aria-label="Kemajuan menyimpan" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(saving.progress * 100)}><i style={{ width: `${Math.round(saving.progress * 100)}%` }} /></div>}
      {saving
        ? <div className={css.saveRow}>
            <button type="button" className={cx(css.btn, css.btnPrimary)} aria-busy="true" aria-live="polite"><span className={css.spin} aria-hidden="true" />{saving.label}</button>
            <button type="button" className={cx(css.btn, css.btnOutline)} onClick={() => abort.current?.abort()}>Batalkan</button>
          </div>
        : <button type="button" className={cx(css.btn, css.btnPrimary, css.block)} onClick={() => void save(false)}>Simpan</button>}
    </div>;
  }

  return <Panel open={open} onClose={onClose} locked={!!saving} title={title} label="Catat aktivitas" variant="sheet" tall onBack={onBack} focusKey={step} footer={footer}>
    <div key={step} className={css.step} data-dir={dir ?? undefined}>{body}</div>
    <input ref={fileInput} type="file" accept={PHOTO_MIMES.join(",")} multiple hidden data-testid="catat-file" onChange={event => { onFilesPicked(event.target.files); event.target.value = ""; }} />
  </Panel>;
}

function FieldError({ text }: { text?: string }) {
  if (!text) return null;
  return <span className={css.errText} role="alert"><CircleAlert size={14} aria-hidden="true" />{text}</span>;
}

/** Above the form: the photo being read, or what it gave and what is left to fill. */
function PhotoBanner({ reading, fromPhoto }: { reading: Reading | null; fromPhoto: FromPhoto | null }) {
  if (reading?.mode === "inline") return <p className={cx(css.note, css.noteInfo)} role="status" style={{ marginTop: 0, marginBottom: 12 }}>
    <span className={css.spin} aria-hidden="true" /><span>Membaca foto… angka yang terbaca akan langsung terisi.</span></p>;
  if (!fromPhoto) return null;
  return <p className={cx(css.note, css.noteInfo)} role="status" style={{ marginTop: 0, marginBottom: 12 }}>
    <ScanText size={20} aria-hidden="true" />
    <span>{fromPhoto.summary.length ? <><b>Dibaca dari foto:</b> {fromPhoto.summary.join(" · ")}. </> : <><b>Tidak ada angka yang terbaca dari foto.</b> </>}
      {fromPhoto.missing.length ? `Isi ${fromPhoto.missing.join(" dan ")} sendiri. ` : ""}Periksa lagi, lalu simpan.</span>
  </p>;
}

/** Tanggal and Jam (opsional) side by side; the help and the errors under both. */
function WhenFields({ date, time, today, rules, errors, filled, onChange }: { date: string; time: string; today: string; rules: WbRules; errors: CatatErrors; filled: readonly AutoField[]; onChange: (field: "date" | "time", value: string) => void }) {
  return <>
    <div className={css.grid2}>
      <div className={css.field}>
        <label className={css.fieldLabel} htmlFor={FIELD_IDS.date}>Tanggal</label>
        <input id={FIELD_IDS.date} className={css.input} type="date" value={date} data-auto={filled.includes("date") || undefined} min={earliestDate(today, rules.backdateDays, rules.programStart)} max={today}
          aria-invalid={!!errors.date} aria-describedby="catat-date-help" onChange={event => onChange("date", event.target.value)} />
      </div>
      <div className={css.field}>
        <label className={css.fieldLabel} htmlFor={FIELD_IDS.time}>Jam <span className={css.faint}>(opsional)</span></label>
        <input id={FIELD_IDS.time} className={css.input} type="time" value={time} data-auto={filled.includes("time") || undefined} aria-invalid={!!errors.time} onChange={event => onChange("time", event.target.value)} />
      </div>
    </div>
    <span className={css.help} id="catat-date-help" style={{ display: "block", marginTop: 6 }}>{rules.backdateDays === null ? `Sejak program mulai (${formatDate(rules.programStart, { day: "numeric", month: "long", year: "numeric" })}) sampai hari ini.`
      : rules.backdateDays === 0 ? "Hanya untuk hari ini." : `Hari ini sampai ${num(rules.backdateDays)} hari ke belakang.`}</span>
    <FieldError text={errors.date} />
    <FieldError text={errors.time} />
  </>;
}

function NoteField({ value, placeholder, label = "Catatan", auto, onChange }: { value: string; placeholder: string; label?: string; auto?: boolean; onChange: (value: string) => void }) {
  return <div className={css.field}>
    <label className={css.fieldLabel} htmlFor="catat-note">{label} <span className={css.faint}>(opsional)</span></label>
    <textarea id="catat-note" className={css.input} maxLength={300} placeholder={placeholder} value={value} data-auto={auto || undefined} onChange={event => onChange(event.target.value)} />
  </div>;
}

function Photos({ photos, max, hint, error, busy, onAdd, onRemove }: { photos: Photo[]; max: number; hint: string; error?: string; busy: boolean; onAdd: () => void; onRemove: (id: string) => void }) {
  return <div className={css.field}>
    <span className={css.fieldLabel} id="catat-photos-label">Foto bukti</span>
    <div className={css.photos} role="group" aria-labelledby="catat-photos-label">
      {photos.map((photo, index) => <div key={photo.id} className={css.ph}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob:) of the chosen file */}
        {photo.url ? <img src={photo.url} alt={`Foto bukti ${index + 1}`} /> : <ImagePlus size={24} aria-hidden="true" />}
        {photo.progress !== null && !photo.uploaded && <span className={css.phBar} role="progressbar" aria-label={`Unggah foto ${index + 1}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(photo.progress * 100)}>
          <i style={{ width: `${Math.round(photo.progress * 100)}%` }} /></span>}
        {photo.uploaded && <span className={css.phDone} aria-label={`Foto ${index + 1} terunggah`}><Check size={16} aria-hidden="true" /></span>}
        {(photo.failed || photo.refused) && <span className={css.phFailed} aria-label={photo.refused ? `Foto ${index + 1} perlu diganti` : `Foto ${index + 1} gagal diunggah`}><TriangleAlert size={24} aria-hidden="true" /></span>}
        {!busy && <button type="button" className={css.phRemove} onClick={() => onRemove(photo.id)} aria-label={`Hapus foto ${index + 1}`}><X size={18} aria-hidden="true" /></button>}
      </div>)}
      {photos.length < max && <button type="button" id={FIELD_IDS.photos} className={cx(css.ph, css.phAdd)} onClick={onAdd} disabled={busy} data-invalid={!!error} aria-describedby="catat-photos-help">
        <ImagePlus size={24} aria-hidden="true" /><span>Tambah</span></button>}
    </div>
    <span className={css.help} id="catat-photos-help">{hint}. Minimal 1, maksimal {num(max)} foto.</span>
    <FieldError text={error} />
  </div>;
}

/** After a save: a climb (or the first place, or entering the board), else how far the one to catch still is. */
function RankAfter({ result }: { result: WbLogResult & { rankBefore: number | null | undefined; ahead: WbBoardRow | null } }) {
  const { rank, of, monthPoints } = result.totals;
  if (rank == null) return null;
  const climbed = result.rankBefore === null || (result.rankBefore !== undefined && rank < result.rankBefore);
  // #1 may be shared (a tie): "di #1", not "memimpin".
  if (rank === 1) return <p className={css.rankUp}><Crown size={18} aria-hidden="true" />{climbed ? "Naik ke #1 bulan ini" : "Kamu di #1 bulan ini"}</p>;
  if (climbed) return <p className={css.rankUp}><TrendingUp size={18} aria-hidden="true" />{result.rankBefore == null ? `Masuk peringkat: #${num(rank)} bulan ini` : `Naik ke #${num(rank)} bulan ini`}</p>;
  const gap = result.ahead && result.rankBefore === rank ? result.ahead.points - monthPoints : 0;
  return <p className={cx(css.caption, css.muted)} style={{ marginTop: 8 }}>
    Peringkatmu bulan ini <b>#{num(rank)}</b> dari {num(of)}{gap > 0 && result.ahead ? <>; <b>{num(gap)} poin</b> lagi menyalip {firstName(result.ahead.name)}</> : null}
  </p>;
}
