"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ArrowDown, ArrowUp, Copy, ExternalLink, ImageUp, RefreshCw } from "lucide-react";
import { Notice } from "@/components/ui";
import { ConsoleButton, ConsoleButtonLink, PageHeader, PageTabs, Pill, SectionToolbar, type Crumb } from "@/components/console";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { putFile, putProblem } from "@/components/pra-wam/photoUpload";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import { fitWithin } from "@/lib/gallery";
import { agoLabel, looksLikeTvSlug, loopCount, suggestSlug, tvIsOn, tvLimits, tvModeLabels, tvModes, tvQrPositionLabels, tvQrPositions, tvSlugLimits, type TvQrPosition, type TvSettings } from "@/lib/pra-wam/tv";
import { absolute, praWamTvApi, TV_HOME_PATH, tvPath, wamAdminPath } from "@/lib/routes";
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
const SLUG_MIGRATION = "202611100004_pw_tv_slug.sql";
const LOOK_MIGRATION = "202611100005_pw_tv_look.sql";

/** The section's three tabs, on its own address: ?tab=tayangan, ?tab=tampilan. */
export type TvAdminView = "layar" | "tayangan" | "tampilan";
const tvTabs: { key: TvAdminView; label: string; href: string }[] = [
  { key: "layar", label: "Layar TV", href: wamAdminPath.tv },
  { key: "tayangan", label: "Tayangan", href: `${wamAdminPath.tv}?tab=tayangan` },
  { key: "tampilan", label: "Tampilan", href: `${wamAdminPath.tv}?tab=tampilan` },
];

/** The QR code as the board will draw it, made here from the address being typed. */
function QrPreview({ url, label }: { url: string; label: string }) {
  const [made, setMade] = useState<{ of: string; src: string } | null>(null);
  useEffect(() => {
    let live = true;
    void QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: "M" }).then(src => { if (live) setMade({ of: url, src }); }, () => undefined);
    return () => { live = false; };
  }, [url]);
  return <figure className={css.qrPreview}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {made?.of === url ? <img src={made.src} alt={`Kode QR ke ${url}`} /> : <span aria-hidden="true" />}
    <figcaption>{label || "Tanpa keterangan"}<small>{url}</small></figcaption>
  </figure>;
}
type Answer = TvAdmin;

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
  const parts = screen.slug ? [] : [`Masih memakai tautan panjang lama (berakhiran …${screen.keyHint})`];
  if (screen.lastSeenAt) parts.push(`terakhir terlihat ${agoLabel(screen.lastSeenAt, now)}`);
  if (screen.width && screen.height) parts.push(`layar ${screen.width}×${screen.height} (${screen.height > screen.width ? "tegak" : "mendatar"})`);
  return parts.join(" · ");
}

/**
 * Admin WAM → TV Announcement: the office TVs (each opens its own short address, /tv/lobi, with no
 * sign-in; the address is open), the pictures they play after the room calendars, and how long
 * each stays. Every TV shows the same content, fitted to its own screen. `origin` is the site's
 * public address, for the links to copy.
 */
export function PraWamTv({ initial, crumbs, title, origin, view }: { initial: TvAdmin; crumbs: readonly Crumb[]; title: string; origin: string; view: TvAdminView }) {
  const [list, setList] = useState<TvAdmin>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [name, setName] = useState("");
  /** The new TV's address: follows the name until the admin types one of their own. */
  const [slug, setSlug] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; slug: string } | null>(null);
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
  const newSlug = slug ?? suggestSlug(name);
  const addScreen = () => run("tambah", praWamTvApi.screens, { method: "POST", body: JSON.stringify({ name, slug: newSlug }) }, () => { setName(""); setSlug(null); });
  async function removeScreen(screen: TvScreen) {
    if (!(await confirm({ title: "Hapus TV ini?", body: `Alamat ${screen.name} langsung tidak berlaku, dan TV-nya berhenti menayangkan. Untuk memakainya lagi, tambah TV baru dan buka alamatnya.`, confirmLabel: "Hapus TV", danger: true }))) return;
    await run(`hapus-tv-${screen.id}`, praWamTvApi.screen(screen.id), { method: "DELETE" });
  }
  async function saveSlug(screen: TvScreen, next: string) {
    // A TV that is already playing at its address goes dark until someone opens the new one on it.
    if (screen.slug && screen.lastSeenAt && !(await confirm({ title: "Ganti alamat TV ini?", body: `Alamat lama ${screen.name} langsung tidak berlaku. TV-nya berhenti menayangkan sampai alamat baru dibuka di browsernya.`, confirmLabel: "Ganti alamat", danger: true }))) return;
    await run(`alamat-${screen.id}`, praWamTvApi.screen(screen.id), { method: "PATCH", body: JSON.stringify({ slug: next }) }, () => setEditing(null));
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

  async function copyLink(id: string, url: string) {
    try { await navigator.clipboard.writeText(url); setCopied(id); }
    catch { setMessage({ tone: "error", text: "Alamat tidak bisa disalin otomatis. Blok alamatnya, lalu salin sendiri." }); }
  }
  const addressOf = (value: string) => absolute(origin, tvPath(value));
  const full = list.screens.length >= tvLimits.screens;
  const settingsChanged = (Object.keys(settings) as (keyof TvSettings)[]).some(key => settings[key] !== list.settings[key]);
  const shown = list.slides.filter(slide => slide.active).length;
  // With a single thing on the loop nothing ever changes on screen, so no duration is asked for.
  const rotates = loopCount(settings, shown) > 1;
  return <>
    {confirmDialog}
    <PageHeader crumbs={crumbs} title={title}
      subtitle="TV kantor menayangkan kalender ruang hari ini, kalender minggu ini, lalu gambar di bawah, bergantian. Semua TV menayangkan isi yang sama."
      actions={list.migrated ? <>
        <ConsoleButton icon={<RefreshCw size={18} aria-hidden />} disabled={!!busy} onClick={() => void refresh()}>{busy === "refresh" ? "Memuat…" : "Muat ulang"}</ConsoleButton>
        <ConsoleButtonLink href={wamAdminPath.tvPreview} target="_blank" rel="noopener" variant="primary" icon={<ExternalLink size={18} aria-hidden />}>Pratinjau</ConsoleButtonLink>
      </> : undefined} />
    {!list.migrated ? <Notice tone="warning">TV Announcement menunggu migrasi {MIGRATION}. Jalankan di Supabase SQL Editor; sampai itu, belum ada TV yang bisa ditambahkan.</Notice> : <>
      <PageTabs tabs={tvTabs} current={view} label="Bagian TV Announcement" />
      <div aria-live="polite">{message && <Notice tone={message.tone}>{message.text}</Notice>}</div>

      {view === "layar" && <section className={akun.section} aria-labelledby="tv-layar">
        <SectionToolbar title={<span id="tv-layar">Layar TV</span>} count={`${list.screens.length} TV`} />
        <p className={akun.lead}>Buka alamat di browser TV, lalu tekan Layar penuh. Alamat TV terbuka: siapa pun yang tahu alamatnya bisa melihat jadwal ruang, tanpa login.</p>
        <div className={css.created}>
          <p><strong>Alamat untuk semua TV.</strong> Cukup alamat ini di TV mana pun; isinya sama.</p>
          <code className={css.link}>{absolute(origin, TV_HOME_PATH)}</code>
          <div className={css.buttons}>
            <ConsoleButton icon={<Copy size={18} aria-hidden />} onClick={() => void copyLink("semua", absolute(origin, TV_HOME_PATH))}>{copied === "semua" ? "Tersalin" : "Salin alamat"}</ConsoleButton>
          </div>
          <p className={css.meta}>TV yang memakai alamat ini tidak tercatat di daftar di bawah. Beri TV alamat sendiri kalau ingin tahu TV mana yang menyala.</p>
        </div>
        {!list.slugReady && <Notice tone="warning">Alamat pendek menunggu migrasi {SLUG_MIGRATION}. Jalankan di Supabase SQL Editor; sampai itu, TV yang sudah ada tetap tayang di tautan panjangnya dan TV baru belum bisa ditambahkan.</Notice>}
        {list.screens.length === 0 ? <p className={akun.empty}>Belum ada TV dengan alamat sendiri.</p>
          : <ul className={css.screens} aria-label="Layar TV">{list.screens.map(screen => {
            const state = screenState(screen, now);
            const edit = editing?.id === screen.id ? editing : null;
            const meta = screenMeta(screen, now);
            return <li key={screen.id} className={css.screen}>
              <div className={css.screenTop}><strong>{screen.name}</strong><Pill tone={state.tone}>{state.label}</Pill></div>
              {edit
                ? <div className="field">
                  <label htmlFor={`tv-alamat-${screen.id}`}>Alamat baru</label>
                  <input id={`tv-alamat-${screen.id}`} className="input" value={edit.slug} maxLength={tvSlugLimits.max} disabled={!!busy} autoCapitalize="none" spellCheck={false}
                    onChange={change => setEditing({ id: screen.id, slug: change.target.value.toLowerCase() })} />
                  <span className={akun.hint}>{looksLikeTvSlug(edit.slug) ? addressOf(edit.slug) : "Huruf kecil, angka, dan tanda hubung; minimal 2 karakter."}</span>
                </div>
                : screen.slug && <code className={css.link}>{addressOf(screen.slug)}</code>}
              {meta && <p className={css.meta}>{meta}</p>}
              <div className={css.buttons}>
                {edit ? <>
                  <ConsoleButton disabled={!!busy} onClick={() => setEditing(null)}>Batal</ConsoleButton>
                  <ConsoleButton variant="primary" disabled={!!busy || !looksLikeTvSlug(edit.slug) || edit.slug === screen.slug} onClick={() => void saveSlug(screen, edit.slug)}>{busy === `alamat-${screen.id}` ? "Menyimpan…" : "Simpan alamat"}</ConsoleButton>
                </> : <>
                  {screen.slug && <ConsoleButton icon={<Copy size={18} aria-hidden />} onClick={() => void copyLink(screen.id, addressOf(screen.slug!))}>{copied === screen.id ? "Tersalin" : "Salin alamat"}</ConsoleButton>}
                  {list.slugReady && <ConsoleButton disabled={!!busy} onClick={() => setEditing({ id: screen.id, slug: screen.slug ?? suggestSlug(screen.name) })}>{screen.slug ? "Ubah alamat" : "Beri alamat pendek"}</ConsoleButton>}
                  <ConsoleButton disabled={!!busy} onClick={() => void removeScreen(screen)}>{busy === `hapus-tv-${screen.id}` ? "Menghapus…" : "Hapus TV"}</ConsoleButton>
                </>}
              </div>
            </li>;
          })}</ul>}
        {list.slugReady && <form className={css.addForm} onSubmit={event => { event.preventDefault(); void addScreen(); }}>
          <div className="field">
            <label htmlFor="tv-nama">Nama TV baru</label>
            <input id="tv-nama" className="input" value={name} maxLength={60} placeholder="Misalnya Lobi" disabled={!!busy || full} onChange={change => setName(change.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="tv-alamat">Alamat</label>
            <input id="tv-alamat" className="input" value={newSlug} maxLength={tvSlugLimits.max} placeholder="lobi" disabled={!!busy || full} autoCapitalize="none" spellCheck={false}
              onChange={change => setSlug(change.target.value.toLowerCase())} />
          </div>
          <ConsoleButton type="submit" disabled={!!busy || name.trim().length < 2 || !looksLikeTvSlug(newSlug) || full}>{busy === "tambah" ? "Menambahkan…" : "Tambah TV"}</ConsoleButton>
        </form>}
        {list.slugReady && !full && <p className={akun.hint}>{looksLikeTvSlug(newSlug) ? `TV ini dibuka di ${addressOf(newSlug)}` : "Alamat: huruf kecil, angka, dan tanda hubung, misalnya lobi atau pantry-2."}</p>}
        {full && <p className={akun.hint}>Paling banyak {tvLimits.screens} TV.</p>}
      </section>}

      {view === "tayangan" && <section className={akun.section} aria-labelledby="tv-gambar">
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
                {rotates && <label>Durasi
                  <select className="select" value={slide.seconds} disabled={!!busy} aria-label={`Durasi ${label}`} onChange={change => void patchSlide(slide, { seconds: Number(change.target.value) })}>
                    {seconds.map(value => <option key={value} value={value}>{value} detik</option>)}
                  </select>
                </label>}
                <ConsoleButton className={css.iconButton} disabled={!!busy || index === 0} aria-label={`Naikkan ${label}`} onClick={() => void move(index, -1)}><ArrowUp size={18} aria-hidden /></ConsoleButton>
                <ConsoleButton className={css.iconButton} disabled={!!busy || index === list.slides.length - 1} aria-label={`Turunkan ${label}`} onClick={() => void move(index, 1)}><ArrowDown size={18} aria-hidden /></ConsoleButton>
                <ConsoleButton disabled={!!busy} onClick={() => void patchSlide(slide, { active: !slide.active })}>{slide.active ? "Sembunyikan" : "Tayangkan"}</ConsoleButton>
                <ConsoleButton disabled={!!busy} onClick={() => void removeSlide(slide)}>Hapus</ConsoleButton>
              </div>
            </li>;
          })}</ol>}
      </section>}

      {view === "tampilan" && <section className={akun.section} aria-labelledby="tv-tampilan">
        <SectionToolbar title={<span id="tv-tampilan">Tema dan kode QR</span>} />
        {!list.lookReady && <Notice tone="warning">Tema dan QR menunggu migrasi {LOOK_MIGRATION}. Jalankan di Supabase SQL Editor; sampai itu, papan tetap gelap tanpa QR.</Notice>}
        <form className={css.settings} onSubmit={event => { event.preventDefault(); void saveSettings(); }}>
          <fieldset className={css.choice} disabled={!!busy || !list.lookReady}>
            <legend>Mode papan</legend>
            {tvModes.map(mode => <label key={mode} className={css.check}>
              <input type="radio" name="tv-mode" checked={settings.mode === mode} onChange={() => setSettings(value => ({ ...value, mode }))} />
              {tvModeLabels[mode]}
            </label>)}
          </fieldset>
          <p className={akun.hint}>Warnanya mengikuti tema WAM di Tema aplikasi. Gelap cocok untuk ruang redup; terang untuk ruang yang sangat terang.</p>

          <div className={css.calendar}>
            <label className={css.check}>
              <input type="checkbox" checked={settings.qrShow} disabled={!!busy || !list.lookReady} onChange={change => setSettings(value => ({ ...value, qrShow: change.target.checked }))} />
              Tampilkan kode QR di papan
            </label>
          </div>
          {settings.qrShow && <div className={css.qrForm}>
            <div className={css.qrFields}>
              <div className="field">
                <label htmlFor="tv-qr-alamat">Alamat yang dibuka QR</label>
                <input id="tv-qr-alamat" className="input" type="url" inputMode="url" value={settings.qrUrl} maxLength={500} placeholder={absolute(origin, TV_HOME_PATH)} disabled={!!busy || !list.lookReady} autoCapitalize="none" spellCheck={false}
                  onChange={change => setSettings(value => ({ ...value, qrUrl: change.target.value }))} />
                <span className={akun.hint}>Kosongkan untuk alamat TV itu sendiri. Kalau diisi, pakai alamat lengkap yang diawali https://.</span>
              </div>
              <div className="field">
                <label htmlFor="tv-qr-keterangan">Keterangan di bawah QR</label>
                <input id="tv-qr-keterangan" className="input" value={settings.qrLabel} maxLength={60} placeholder="Misalnya Book ruang di sini" disabled={!!busy || !list.lookReady}
                  onChange={change => setSettings(value => ({ ...value, qrLabel: change.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="tv-qr-letak">Letak di layar</label>
                <select id="tv-qr-letak" className="select" value={settings.qrPosition} disabled={!!busy || !list.lookReady} onChange={change => setSettings(value => ({ ...value, qrPosition: change.target.value as TvQrPosition }))}>
                  {tvQrPositions.map(position => <option key={position} value={position}>{tvQrPositionLabels[position]}</option>)}
                </select>
                <span className={akun.hint}>QR menumpang di atas tayangan, jadi menutupi sudut itu. Di sudut atas ia menutupi judul atau jam.</span>
              </div>
            </div>
            <QrPreview url={settings.qrUrl.trim() || absolute(origin, TV_HOME_PATH)} label={settings.qrLabel} />
          </div>}
          <div className={css.buttons}>
            <ConsoleButton type="submit" variant="primary" disabled={!!busy || !settingsChanged || !list.lookReady}>{busy === "pengaturan" ? "Menyimpan…" : "Simpan tampilan"}</ConsoleButton>
          </div>
        </form>
      </section>}

      {view === "tayangan" && <section className={akun.section} aria-labelledby="tv-pengaturan">
        <SectionToolbar title={<span id="tv-pengaturan">Jadwal ruang</span>} />
        <form className={css.settings} onSubmit={event => { event.preventDefault(); void saveSettings(); }}>
          {calendars.map(calendar => <div key={calendar.show} className={css.calendar}>
            <label className={css.check}>
              <input type="checkbox" checked={settings[calendar.show]} disabled={!!busy} onChange={change => setSettings(value => ({ ...value, [calendar.show]: change.target.checked }))} />
              {calendar.label}
            </label>
            {rotates && <div className="field">
              <label htmlFor={`tv-${calendar.seconds}`}>Durasi</label>
              <select id={`tv-${calendar.seconds}`} className="select" value={settings[calendar.seconds]} disabled={!!busy || !settings[calendar.show]} onChange={change => setSettings(value => ({ ...value, [calendar.seconds]: Number(change.target.value) }))}>
                {(SCHEDULE_SECONDS.includes(settings[calendar.seconds]) ? SCHEDULE_SECONDS : [...SCHEDULE_SECONDS, settings[calendar.seconds]].sort((a, b) => a - b)).map(value => <option key={value} value={value}>{value} detik</option>)}
              </select>
            </div>}
          </div>)}
          {!rotates && <p className={akun.hint}>Hanya satu yang ditayangkan, jadi tampil terus tanpa berganti. Durasi muncul lagi begitu ada lebih dari satu tayangan.</p>}
          <p className={akun.hint}>Yang tampil: nama kegiatan, ruang, jam, dan pemesan. Semua jadwal muat satu layar; makin banyak isinya, makin kecil barisnya.</p>
          <div className={css.buttons}>
            <ConsoleButton type="submit" variant="secondary" disabled={!!busy || !settingsChanged}>{busy === "pengaturan" ? "Menyimpan…" : "Simpan pengaturan"}</ConsoleButton>
          </div>
        </form>
      </section>}
    </>}
  </>;
}
