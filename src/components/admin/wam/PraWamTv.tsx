"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, ExternalLink, ImageUp, RefreshCw } from "lucide-react";
import { Notice } from "@/components/ui";
import { ConsoleButton, ConsoleButtonLink, PageHeader, Pill, SectionToolbar, type Crumb } from "@/components/console";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { putFile, putProblem } from "@/components/pra-wam/photoUpload";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import { fitWithin } from "@/lib/gallery";
import { agoLabel, tvIsOn, tvLimits, type TvSettings } from "@/lib/pra-wam/tv";
import { absolute, praWamTvApi, wamAdminPath } from "@/lib/routes";
import type { TvAdmin, TvAdminSlide, TvScreen } from "@/lib/server/pra-wam/tv";
import akun from "./akun/akun.module.css";
import css from "./tv-admin.module.css";

const MIGRATION = "202611100003_pw_tv.sql";
const ACCEPT = "image/jpeg,image/png,image/webp";
const SLIDE_SECONDS = [5, 8, 10, 15, 20, 30, 60];
const SCHEDULE_SECONDS = [10, 15, 20, 30, 45, 60];
const calendars = [
  { show: "showDay", seconds: "daySeconds", label: "Kalender hari ini (ruang dan jam)" },
  { show: "showWeek", seconds: "weekSeconds", label: "Kalender minggu ini (per hari)" },
] as const;
type Created = { name: string; path: string };
type Answer = TvAdmin & { created?: Created };

/** Any picked picture as WebP no longer than 2560 px, made here so the server never decodes an upload. */
async function asWebp(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new AdminApiError(`${file.name}: berkas ini tidak bisa dibuka sebagai gambar. Pakai JPG, PNG, atau WebP.`); }
  try {
    const size = fitWithin(bitmap.width, bitmap.height, tvLimits.imageEdge);
    const canvas = document.createElement("canvas");
    canvas.width = size.width; canvas.height = size.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, size.width, size.height);
    for (const quality of [0.86, 0.7, 0.5]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
      if (!blob || blob.type !== "image/webp") throw new AdminApiError("Browser ini belum bisa membuat WebP. Gunakan Chrome, Edge, Firefox, atau Safari terbaru.");
      if (blob.size <= tvLimits.imageBytes) return blob;
    }
    throw new AdminApiError(`${file.name}: gambar terlalu besar. Perkecil dulu, lalu unggah lagi.`);
  } finally { bitmap.close(); }
}

/** One picture into the loop: the server agrees a key and size, the browser stores it, the server checks it. */
async function uploadSlide(file: File): Promise<TvAdmin> {
  const blob = await asWebp(file);
  const agreed = { mime: "image/webp", size: blob.size };
  const start = await adminRequest<{ key: string; uploadUrl: string; token: string }>(praWamTvApi.slideStart, { method: "POST", body: JSON.stringify(agreed) });
  const problem = putProblem(await putFile(start.data!.uploadUrl, blob, agreed.mime));
  if (problem) throw new AdminApiError(problem);
  const title = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 80);
  const done = await adminRequest<TvAdmin>(praWamTvApi.slideConfirm, { method: "POST", body: JSON.stringify({ ...agreed, key: start.data!.key, token: start.data!.token, title }) });
  return done.data!;
}

function screenState(screen: TvScreen, now: number): { label: string; tone: "ok" | "warn" | "neutral" } {
  if (!screen.lastSeenAt) return { label: "Belum pernah dibuka", tone: "neutral" };
  return tvIsOn(screen.lastSeenAt, now) ? { label: "Menyala", tone: "ok" } : { label: "Tidak terlihat", tone: "warn" };
}
function screenMeta(screen: TvScreen, now: number): string {
  const parts = [`Tautan berakhiran …${screen.keyHint}`];
  if (screen.lastSeenAt) parts.push(`terakhir terlihat ${agoLabel(screen.lastSeenAt, now)}`);
  if (screen.width && screen.height) parts.push(`layar ${screen.width}×${screen.height} (${screen.height > screen.width ? "tegak" : "mendatar"})`);
  return parts.join(" · ");
}

/**
 * Admin WAM → TV Announcement: the office TVs (each opens its own secret address, no sign-in),
 * the pictures they play after today's room schedule, and how long each stays. Every TV shows
 * the same content, fitted to its own screen.
 */
export function PraWamTv({ initial, crumbs, title }: { initial: TvAdmin; crumbs: readonly Crumb[]; title: string }) {
  const [list, setList] = useState<TvAdmin>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState("");
  const [settings, setSettings] = useState<TvSettings>(initial.settings);
  const [progress, setProgress] = useState("");
  const [confirm, confirmDialog] = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const now = Date.parse(list.now);

  async function run(tag: string, url: string, init: RequestInit, after?: (answer: Answer) => void) {
    setBusy(tag); setMessage(null);
    try {
      const result = await adminRequest<Answer>(url, init);
      if (result.data) { setList(result.data); after?.(result.data); }
      setMessage({ tone: "success", text: result.message });
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(null); }
  }
  const refresh = () => run("refresh", praWamTvApi.list, {}, answer => setSettings(answer.settings));
  const addScreen = () => run("tambah", praWamTvApi.screens, { method: "POST", body: JSON.stringify({ name }) }, answer => { setName(""); setCopied(false); setCreated(answer.created ?? null); });
  async function removeScreen(screen: TvScreen) {
    if (!(await confirm({ title: "Hapus TV ini?", body: `Tautan ${screen.name} langsung tidak berlaku, dan TV-nya berhenti menayangkan. Untuk memakainya lagi, tambah TV baru dan buka tautan barunya.`, confirmLabel: "Hapus TV", danger: true }))) return;
    await run(`hapus-tv-${screen.id}`, praWamTvApi.screen(screen.id), { method: "DELETE" });
  }
  const patchSlide = (slide: TvAdminSlide, change: Partial<Pick<TvAdminSlide, "seconds" | "active">>) =>
    run(`gambar-${slide.id}`, praWamTvApi.slide(slide.id), { method: "PATCH", body: JSON.stringify(change) });
  async function removeSlide(slide: TvAdminSlide) {
    if (!(await confirm({ title: "Hapus gambar ini?", body: `${slide.title || "Gambar ini"} hilang dari semua TV dan dari penyimpanan. Kalau hanya ingin berhenti menayangkannya, pilih Sembunyikan.`, confirmLabel: "Hapus gambar", danger: true }))) return;
    await run(`gambar-${slide.id}`, praWamTvApi.slide(slide.id), { method: "DELETE" });
  }
  function move(index: number, by: -1 | 1) {
    const ids = list.slides.map(slide => slide.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    return run("urutan", praWamTvApi.order, { method: "PUT", body: JSON.stringify({ ids }) });
  }
  const saveSettings = () => run("pengaturan", praWamTvApi.settings, { method: "PUT", body: JSON.stringify(settings) }, answer => setSettings(answer.settings));

  async function upload(files: File[]) {
    setBusy("unggah"); setMessage(null);
    const failed: string[] = [];
    let done = 0;
    for (const [index, file] of files.entries()) {
      setProgress(`Mengunggah ${index + 1} dari ${files.length}: ${file.name}`);
      try { setList(await uploadSlide(file)); done += 1; }
      catch (error) { failed.push(error instanceof AdminApiError ? error.message : `${file.name}: gagal diunggah.`); }
    }
    setProgress(""); setBusy(null);
    setMessage(failed.length
      ? { tone: "error", text: `${done} gambar ditambahkan, ${failed.length} gagal. ${failed.join(" ")}` }
      : { tone: "success", text: `${done} gambar ditambahkan. TV menayangkannya dalam setengah menit.` });
  }

  async function copyLink(url: string) {
    try { await navigator.clipboard.writeText(url); setCopied(true); }
    catch { setMessage({ tone: "error", text: "Tautan tidak bisa disalin otomatis. Blok tautannya, lalu salin sendiri." }); }
  }

  const createdUrl = created && typeof window !== "undefined" ? absolute(window.location.origin, created.path) : "";
  const settingsChanged = calendars.some(calendar => settings[calendar.show] !== list.settings[calendar.show] || settings[calendar.seconds] !== list.settings[calendar.seconds]);
  const shown = list.slides.filter(slide => slide.active).length;
  return <>
    {confirmDialog}
    <PageHeader crumbs={crumbs} title={title}
      subtitle="TV kantor menayangkan kalender ruang hari ini, kalender minggu ini, lalu gambar di bawah, bergantian. Semua TV menayangkan isi yang sama."
      actions={list.migrated ? <>
        <ConsoleButton icon={<RefreshCw size={18} aria-hidden />} disabled={!!busy} onClick={() => void refresh()}>{busy === "refresh" ? "Memuat…" : "Muat ulang"}</ConsoleButton>
        <ConsoleButtonLink href={wamAdminPath.tvPreview} target="_blank" rel="noopener" variant="primary" icon={<ExternalLink size={18} aria-hidden />}>Pratinjau</ConsoleButtonLink>
      </> : undefined} />
    {!list.migrated ? <Notice tone="warning">TV Announcement menunggu migrasi {MIGRATION}. Jalankan di Supabase SQL Editor; sampai itu, belum ada TV yang bisa ditambahkan.</Notice> : <>
      <div aria-live="polite">{message && <Notice tone={message.tone}>{message.text}</Notice>}</div>

      <section className={akun.section} aria-labelledby="tv-layar">
        <SectionToolbar title={<span id="tv-layar">Layar TV</span>} count={`${list.screens.length} TV`} />
        <p className={akun.lead}>Buka tautan TV di browser TV-nya, lalu tekan Layar penuh. Tautan itu rahasia: siapa pun yang memegangnya bisa melihat jadwal ruang.</p>
        {created && <div className={css.created} role="status">
          <p><strong>Tautan untuk {created.name}.</strong> Salin sekarang; tautan ini tidak ditampilkan lagi.</p>
          <code className={css.link}>{createdUrl}</code>
          <div className={css.buttons}>
            <ConsoleButton variant="primary" icon={<Copy size={18} aria-hidden />} onClick={() => void copyLink(createdUrl)}>{copied ? "Tersalin" : "Salin tautan"}</ConsoleButton>
            <ConsoleButton onClick={() => setCreated(null)}>Sudah saya simpan</ConsoleButton>
          </div>
        </div>}
        {list.screens.length === 0 ? <p className={akun.empty}>Belum ada TV. Tambahkan satu untuk mendapat tautannya.</p>
          : <ul className={css.screens} aria-label="Layar TV">{list.screens.map(screen => {
            const state = screenState(screen, now);
            return <li key={screen.id} className={css.screen}>
              <div className={css.screenTop}><strong>{screen.name}</strong><Pill tone={state.tone}>{state.label}</Pill></div>
              <p className={css.meta}>{screenMeta(screen, now)}</p>
              <div className={css.buttons}>
                <ConsoleButton disabled={!!busy} onClick={() => void removeScreen(screen)}>{busy === `hapus-tv-${screen.id}` ? "Menghapus…" : "Hapus TV"}</ConsoleButton>
              </div>
            </li>;
          })}</ul>}
        <form className={css.addForm} onSubmit={event => { event.preventDefault(); void addScreen(); }}>
          <div className="field">
            <label htmlFor="tv-nama">Nama TV baru</label>
            <input id="tv-nama" className="input" value={name} maxLength={60} placeholder="Misalnya Lobi" disabled={!!busy || list.screens.length >= tvLimits.screens} onChange={change => setName(change.target.value)} />
          </div>
          <ConsoleButton type="submit" disabled={!!busy || name.trim().length < 2 || list.screens.length >= tvLimits.screens}>{busy === "tambah" ? "Menambahkan…" : "Tambah TV"}</ConsoleButton>
        </form>
        {list.screens.length >= tvLimits.screens && <p className={akun.hint}>Paling banyak {tvLimits.screens} TV.</p>}
      </section>

      <section className={akun.section} aria-labelledby="tv-gambar">
        <SectionToolbar title={<span id="tv-gambar">Gambar</span>} count={`${shown} tayang dari ${list.slides.length}`} />
        {!list.storageReady && <Notice tone="warning">Penyimpanan gambar belum disiapkan (R2). Jadwal ruang tetap tayang; gambar belum bisa diunggah.</Notice>}
        <div className={css.buttons}>
          <input ref={fileInput} className={css.fileInput} type="file" accept={ACCEPT} multiple tabIndex={-1} aria-hidden="true"
            onChange={change => { const files = [...(change.target.files ?? [])]; change.target.value = ""; if (files.length) void upload(files); }} />
          <ConsoleButton icon={<ImageUp size={18} aria-hidden />} disabled={!!busy || !list.storageReady || list.slides.length >= tvLimits.slides} onClick={() => fileInput.current?.click()}>
            {busy === "unggah" ? "Mengunggah…" : "Unggah gambar"}
          </ConsoleButton>
          <span className={css.meta} aria-live="polite">{progress || `JPG, PNG, atau WebP. Paling banyak ${tvLimits.slides} gambar.`}</span>
        </div>
        {list.slides.length === 0 ? <p className={akun.empty}>Belum ada gambar. TV hanya menayangkan jadwal ruang.</p>
          : <ol className={css.slides} aria-label="Gambar, urut tayang">{list.slides.map((slide, index) => {
            const label = slide.title || `Gambar ${index + 1}`;
            const seconds = SLIDE_SECONDS.includes(slide.seconds) ? SLIDE_SECONDS : [...SLIDE_SECONDS, slide.seconds].sort((a, b) => a - b);
            return <li key={slide.id} className={`${css.slide} ${slide.active ? "" : css.slideOff}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={css.thumb} src={praWamTvApi.slideImage(slide.id)} alt="" loading="lazy" />
              <div className={css.slideMain}>
                <div className={css.slideTitle}><strong>{label}</strong><Pill tone={slide.active ? "ok" : "neutral"}>{slide.active ? "Tayang" : "Disembunyikan"}</Pill></div>
                <p className={css.meta}>Urutan {index + 1}</p>
              </div>
              <div className={css.slideTools}>
                <label>Durasi
                  <select className="select" value={slide.seconds} disabled={!!busy} aria-label={`Durasi ${label}`} onChange={change => void patchSlide(slide, { seconds: Number(change.target.value) })}>
                    {seconds.map(value => <option key={value} value={value}>{value} detik</option>)}
                  </select>
                </label>
                <ConsoleButton className={css.iconButton} disabled={!!busy || index === 0} aria-label={`Naikkan ${label}`} onClick={() => void move(index, -1)}><ArrowUp size={18} aria-hidden /></ConsoleButton>
                <ConsoleButton className={css.iconButton} disabled={!!busy || index === list.slides.length - 1} aria-label={`Turunkan ${label}`} onClick={() => void move(index, 1)}><ArrowDown size={18} aria-hidden /></ConsoleButton>
                <ConsoleButton disabled={!!busy} onClick={() => void patchSlide(slide, { active: !slide.active })}>{slide.active ? "Sembunyikan" : "Tayangkan"}</ConsoleButton>
                <ConsoleButton disabled={!!busy} onClick={() => void removeSlide(slide)}>Hapus</ConsoleButton>
              </div>
            </li>;
          })}</ol>}
      </section>

      <section className={akun.section} aria-labelledby="tv-pengaturan">
        <SectionToolbar title={<span id="tv-pengaturan">Jadwal ruang</span>} />
        <form className={css.settings} onSubmit={event => { event.preventDefault(); void saveSettings(); }}>
          {calendars.map(calendar => <div key={calendar.show} className={css.calendar}>
            <label className={css.check}>
              <input type="checkbox" checked={settings[calendar.show]} disabled={!!busy} onChange={change => setSettings(value => ({ ...value, [calendar.show]: change.target.checked }))} />
              {calendar.label}
            </label>
            <div className="field">
              <label htmlFor={`tv-${calendar.seconds}`}>Durasi</label>
              <select id={`tv-${calendar.seconds}`} className="select" value={settings[calendar.seconds]} disabled={!!busy || !settings[calendar.show]} onChange={change => setSettings(value => ({ ...value, [calendar.seconds]: Number(change.target.value) }))}>
                {(SCHEDULE_SECONDS.includes(settings[calendar.seconds]) ? SCHEDULE_SECONDS : [...SCHEDULE_SECONDS, settings[calendar.seconds]].sort((a, b) => a - b)).map(value => <option key={value} value={value}>{value} detik</option>)}
              </select>
            </div>
          </div>)}
          <p className={akun.hint}>Yang tampil: nama kegiatan, ruang, jam, dan pemesan. Semua jadwal muat satu layar; makin banyak isinya, makin kecil barisnya.</p>
          <div className={css.buttons}>
            <ConsoleButton type="submit" variant="secondary" disabled={!!busy || !settingsChanged}>{busy === "pengaturan" ? "Menyimpan…" : "Simpan pengaturan"}</ConsoleButton>
          </div>
        </form>
      </section>
    </>}
  </>;
}
