"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Cake, CalendarDays, CalendarRange, DoorOpen, ExternalLink, Eye, EyeOff, ImageUp, Images, FileVideo, ListOrdered, Megaphone, Play, Plus, SlidersHorizontal, Square, Trash2, Type, UserRound, X, Zap } from "lucide-react";
import { Notice } from "@/components/ui";
import { ConsoleButton, ConsoleButtonLink, PageHeader, Pill, SectionToolbar, SegmentedControl, type Crumb } from "@/components/console";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import { putFile, putProblem } from "@/components/pra-wam/photoUpload";
import { uploadSlide } from "@/components/admin/wam/PraWamTv";
import akun from "@/components/admin/wam/akun/akun.module.css";
import { clockLabel, wibTime } from "@/lib/pra-wam/appraisal";
import { isTemplateKind, scheduleLabel, tvItemKindHints, tvItemKindLabels, tvLimits, tvTakeoverMinutes, tvTemplateKinds, TV_BIRTHDAY_WISH, tvVideoTypes, TV_VIDEO_BYTES, tvWelcomeDesignLabels, tvWelcomeDesigns, youtubeId, youtubeWatch, type TvItemKind, type TvVideoMime, type TvWelcomeDesign } from "@/lib/pra-wam/tv";
import { praWamTvApi, tvAdminPath } from "@/lib/routes";
import type { TvAdmin, TvAdminItem } from "@/lib/server/pra-wam/tv";
import { cutOutPerson } from "./cutout";
import { TvPreview } from "./TvPreview";
import css from "./tv-playlist.module.css";

const ACCEPT = "image/jpeg,image/png,image/webp";
const ACCEPT_VIDEO = Object.keys(tvVideoTypes).join(",");
const SECONDS = [5, 8, 10, 15, 20, 30, 45, 60];
const icons: Record<TvItemKind, typeof Type> = { kalender_hari: CalendarDays, kalender_minggu: CalendarRange, timeline: ListOrdered, pengumuman: Megaphone, sambutan: DoorOpen, tamu: UserRound, ultah: Cake, foto_meeting: Images, teks: Type, video: Play, gambar: ImageUp };
/** The kinds whose words the admin types: a title (a guest's name for a typed welcome) and what it says. */
const isTyped = (kind: TvItemKind) => kind === "teks" || kind === "tamu" || kind === "ultah";
/** The kinds that welcome a guest, and so have a design to pick. A typed welcome has no visit, so no cover photo. */
const isWelcome = (kind: TvItemKind) => kind === "sambutan" || kind === "tamu";
const designsFor = (kind: TvItemKind) => tvWelcomeDesigns.filter(design => kind === "sambutan" || design !== "foto");
/** Where a row's content comes from, for the line under its name. */
const sourceOf = (kind: TvItemKind) => kind === "sambutan" ? "Dari Kunjungan Kantor" : isTemplateKind(kind) ? "Dari WAM" : kind === "tamu" ? "Sambutan tamu" : tvItemKindLabels[kind];
type Draft = { title: string; body: string; call: string; date: string; design: TvWelcomeDesign; seconds: number; showFrom: string; showUntil: string; timeFrom: string; timeUntil: string; screenIds: string[] };
/** What "Tayangkan sekarang" is asked with (`minutes` null: until stopped). */
type Take = { minutes: number | null; screenIds: string[] };
const draftOf = (item: TvAdminItem): Draft => ({
  title: item.title, body: item.body, call: item.call, date: item.date, design: item.design, seconds: item.seconds, showFrom: item.showFrom ?? "", showUntil: item.showUntil ?? "",
  timeFrom: item.timeFrom ?? "", timeUntil: item.timeUntil ?? "", screenIds: item.screenIds,
});
/** The four ways to add a row, one shown at a time. */
const adds = [{ value: "template", label: "Template" }, { value: "tamu", label: "Sambutan" }, { value: "ultah", label: "Ulang tahun" }, { value: "teks", label: "Teks" }, { value: "video", label: "Video" }, { value: "gambar", label: "Gambar" }] as const;
type AddKind = (typeof adds)[number]["value"];

/**
 * Admin TV → Tayangan: the playlist. Every thing a TV plays is a card, in playing order, in as
 * many columns as the page has room for (one on a phone). A card is for reading: its number and
 * where it comes from, its name in full, what it says, then its duration, its schedule and its TVs
 * as labelled facts. It carries only what is used in passing: the two arrows that move it, and
 * Atur. Atur opens the card across the page with everything else inside: its words, its duration,
 * its schedule and TVs, and the actions (Simpan, Tayangkan sekarang, Sembunyikan, Hapus).
 * Tambah tayangan is one card with a choice of four.
 */
export function TvPlaylist({ initial, crumbs, title }: { initial: TvAdmin; crumbs: readonly Crumb[]; title: string }) {
  const [list, setList] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  /** The card that is open (Atur), with what is typed in it; `take` is set while its "Tayangkan sekarang" is being asked. */
  const [editing, setEditing] = useState<{ id: string; draft: Draft; take: Take | null } | null>(null);
  const [text, setText] = useState({ title: "", body: "" });
  const [guest, setGuest] = useState({ title: "", body: "" });
  const [clip, setClip] = useState({ title: "", body: "" });
  const [bday, setBday] = useState({ title: "", call: "", date: initial.now.slice(0, 10), body: TV_BIRTHDAY_WISH });
  const photoInput = useRef<HTMLInputElement>(null);
  /** The photo picked for a greeting that is not added yet: already cut out, with an address to show it by. */
  const [bdayPhoto, setBdayPhoto] = useState<{ file: File; cut: boolean; shown: string; note: string } | null>(null);
  const newPhotoInput = useRef<HTMLInputElement>(null);
  /** The birthday greeting whose photo is being picked. */
  const photoFor = useRef<string | null>(null);
  const [adding, setAdding] = useState<AddKind>("template");
  const [progress, setProgress] = useState("");
  const [confirm, confirmDialog] = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const items = list.items ?? [];

  async function run(tag: string, url: string, init: RequestInit, after?: () => void) {
    setBusy(tag); setMessage(null);
    try {
      const result = await adminRequest<TvAdmin>(url, init);
      if (result.data) setList(result.data);
      setMessage({ tone: "success", text: result.message });
      after?.();
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(null); }
  }
  const patch = (item: TvAdminItem, change: Record<string, unknown>, after?: () => void) =>
    run(`baris-${item.id}`, praWamTvApi.item(item.id), { method: "PATCH", body: JSON.stringify(change) }, after);
  const add = (kind: TvItemKind, more: { title?: string; body?: string; call?: string; date?: string | null } = {}, after?: () => void) =>
    run(`tambah-${kind}`, praWamTvApi.items, { method: "POST", body: JSON.stringify({ kind, ...more }) }, after);
  function move(index: number, by: -1 | 1) {
    const ids = items.map(item => item.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    return run("urutan", praWamTvApi.itemOrder, { method: "PUT", body: JSON.stringify({ ids }) });
  }
  async function remove(item: TvAdminItem) {
    const name = nameOf(item);
    const body = item.kind === "gambar" ? `${name} hilang dari semua TV dan dari penyimpanan. Kalau hanya ingin berhenti menayangkannya, pilih Sembunyi.`
      : isTemplateKind(item.kind) ? `${name} tidak lagi tayang di TV mana pun. Template ini bisa ditambahkan lagi kapan saja; datanya tetap ada di sumbernya.`
      : `${name} dihapus dari daftar tayangan.`;
    if (!(await confirm({ title: "Hapus tayangan ini?", body, confirmLabel: "Hapus", danger: true }))) return;
    await run(`baris-${item.id}`, praWamTvApi.item(item.id), { method: "DELETE" });
  }
  function save(item: TvAdminItem, draft: Draft) {
    return patch(item, {
      ...(isTyped(item.kind) || item.kind === "gambar" || item.kind === "video" ? { title: draft.title } : {}),
      ...(isTyped(item.kind) ? { body: draft.body } : {}),
      seconds: draft.seconds,
      ...(isWelcome(item.kind) ? { design: draft.design } : {}),
      ...(item.kind === "ultah" ? { call: draft.call, date: draft.date || null } : {}),
      showFrom: draft.showFrom || null, showUntil: draft.showUntil || null, timeFrom: draft.timeFrom || null, timeUntil: draft.timeUntil || null,
      screenIds: draft.screenIds,
    }, () => setEditing(null));
  }
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
      : { tone: "success", text: `${done} gambar ditambahkan di urutan terakhir.` });
  }

  /** A birthday greeting's photo: made smaller in the browser, sent to storage, then kept as that row's picture. */
  async function uploadPhoto(itemId: string, file: File) {
    setBusy(`foto-${itemId}`); setMessage(null);
    try {
      // The person is cut out of the photo here, in this browser, so they stand in front of the frame as on the card.
      const made = await cutOutPerson(file);
      setList(await uploadSlide(made.file, itemId, made.cut));
      setMessage(made.cut ? { tone: "success", text: "Foto tersimpan. Orangnya sudah dipotong dari latarnya." } : { tone: "success", text: `Foto tersimpan utuh. ${made.problem ?? ""}`.trim() });
    }
    catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(null); }
  }

  /** The photo for a greeting being added: cut out at once, here, so the preview shows the card as the TV will. */
  async function pickBirthdayPhoto(file: File) {
    setBusy("foto-baru"); setMessage(null);
    try {
      const made = await cutOutPerson(file);
      if (bdayPhoto) URL.revokeObjectURL(bdayPhoto.shown);
      setBdayPhoto({ file: made.file, cut: made.cut, shown: URL.createObjectURL(made.file), note: made.cut ? "Foto siap. Orangnya sudah dipotong dari latarnya." : `Foto siap, dipakai utuh. ${made.problem ?? ""}`.trim() });
    } finally { setBusy(null); }
  }
  /** Tambah ucapan: the greeting first, then its photo, when one was picked. */
  async function addBirthday() {
    setBusy("tambah-ultah"); setMessage(null);
    try {
      const before = new Set(items.map(item => item.id));
      const added = await adminRequest<TvAdmin>(praWamTvApi.items, { method: "POST", body: JSON.stringify({ kind: "ultah", ...bday, date: bday.date || null }) });
      let data = added.data ?? list, text = added.message;
      const made = data.items?.find(item => item.kind === "ultah" && !before.has(item.id));
      if (bdayPhoto && made) {
        try { data = await uploadSlide(bdayPhoto.file, made.id, bdayPhoto.cut); text = "Ucapan ulang tahun ditambahkan dengan fotonya."; }
        catch (error) { text = `Ucapan ditambahkan, tetapi fotonya belum tersimpan: ${errorMessage(error)} Unggah lagi lewat Atur.`; }
      }
      setList(data);
      setMessage({ tone: "success", text });
      setBday(value => ({ ...value, title: "", call: "" }));
      if (bdayPhoto) URL.revokeObjectURL(bdayPhoto.shown);
      setBdayPhoto(null);
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(null); }
  }

  /** One video file: the server agrees the upload, the browser sends it to storage, the server checks it and adds its row. */
  async function uploadVideo(file: File) {
    if (!(file.type in tvVideoTypes)) { setMessage({ tone: "error", text: "Pilih berkas video MP4 atau WebM." }); return; }
    if (file.size > TV_VIDEO_BYTES) { setMessage({ tone: "error", text: "Berkas video lebih dari 200 MB. Perkecil dulu, atau unggah ke YouTube dan tempel alamatnya." }); return; }
    setBusy("unggah-video"); setMessage(null); setProgress("Menyiapkan unggahan…");
    try {
      const agreed = { mime: file.type as TvVideoMime, size: file.size };
      const start = await adminRequest<{ key: string; uploadUrl: string; token: string }>(praWamTvApi.videoStart, { method: "POST", body: JSON.stringify(agreed) });
      const problem = putProblem(await putFile(start.data!.uploadUrl, file, agreed.mime, share => setProgress(`Mengunggah ${file.name}: ${Math.round(share * 100)}%`)));
      if (problem) throw new AdminApiError(problem);
      setProgress("Memeriksa berkas…");
      const title = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 80);
      const done = await adminRequest<TvAdmin>(praWamTvApi.videoConfirm, { method: "POST", body: JSON.stringify({ ...agreed, key: start.data!.key, token: start.data!.token, title }) });
      if (done.data) setList(done.data);
      setMessage({ tone: "success", text: done.message });
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(null); setProgress(""); }
  }

  const screenName = (id: string) => list.screens.find(screen => screen.id === id)?.name ?? null;
  const nameOf = (item: TvAdminItem) => isTyped(item.kind) || item.kind === "gambar" || item.kind === "video" ? item.title || tvItemKindLabels[item.kind] : tvItemKindLabels[item.kind];
  const takeOver = (item: TvAdminItem, take: Take) =>
    run("ambil-alih", praWamTvApi.takeover, { method: "POST", body: JSON.stringify({ itemId: item.id, ...take }) }, () => setEditing(null));
  const taken = list.takeover ? items.find(item => item.id === list.takeover?.itemId) : undefined;
  const takenWhere = list.takeover?.screenIds.length ? list.takeover.screenIds.map(id => screenName(id) ?? "TV yang sudah dihapus").join(", ") : "semua TV";
  const missing = tvTemplateKinds.filter(kind => !items.some(item => item.kind === kind));
  const pictures = items.filter(item => item.kind === "gambar").length;
  const active = items.filter(item => item.active).length;

  return <>
    {confirmDialog}
    <PageHeader crumbs={crumbs} title={title} subtitle="Semua yang ditayangkan TV, berurutan dari atas lalu mengulang."
      actions={<ConsoleButtonLink href={tvAdminPath.preview} target="_blank" rel="noopener" variant="primary" icon={<ExternalLink size={18} aria-hidden />}>Pratinjau</ConsoleButtonLink>} />
    <div aria-live="polite">{message && <Notice tone={message.tone}>{message.text}</Notice>}</div>
    {list.takeover && taken && <div className={css.plTaking} role="status">
      <Zap size={20} aria-hidden />
      <p><strong>{nameOf(taken)}</strong> sedang mengambil alih {takenWhere}, {list.takeover.until ? `sampai ${clockLabel(wibTime(list.takeover.until))} WIB` : "sampai dihentikan"}. Tayangan lain menunggu.</p>
      <ConsoleButton icon={<Square size={16} aria-hidden />} disabled={!!busy} onClick={() => void run("hentikan", praWamTvApi.takeover, { method: "DELETE" })}>{busy === "hentikan" ? "Menghentikan…" : "Hentikan"}</ConsoleButton>
    </div>}
    {list.items && !list.welcomeReady && <Notice tone="warning">Sambutan tamu dan Tayangkan sekarang menunggu migrasi 202611100008_pw_tv_welcome.sql. Tayangan lain berjalan seperti biasa.</Notice>}

    <section className={akun.section} aria-labelledby="tv-daftar">
      <SectionToolbar title={<span id="tv-daftar">Daftar tayangan</span>} count={`${active} tayang dari ${items.length}`} />
      {items.length === 0 ? <p className={akun.empty}>Daftar tayangan kosong, jadi TV menulis &quot;Belum ada yang ditayangkan&quot;. Tambahkan tayangan di bawah.</p>
        : <ol className={css.plGrid} aria-label="Tayangan, urut tayang">{items.map((item, index) => {
          const Icon = icons[item.kind];
          const name = nameOf(item);
          const isTaking = list.takeover?.itemId === item.id;
          const days = scheduleLabel({ ...item, screenIds: [] }, screenName) || "Setiap hari, sepanjang hari";
          const screens = item.screenIds.length ? item.screenIds.map(id => screenName(id) ?? "TV yang sudah dihapus").join(", ") : "Semua TV";
          const note = item.kind === "sambutan" ? (list.welcomes.length ? `Hari ini: ${list.welcomes.join(", ")}` : "Tidak ada kunjungan terbit hari ini, jadi dilewati.")
            : item.kind === "ultah" ? [item.call && `Happy Birthday ${item.call}`, item.slideId ? "" : "Belum ada foto."].filter(Boolean).join(" · ")
            : isTyped(item.kind) ? item.body : item.kind === "video" ? (item.videoFile ? "Berkas video yang diunggah" : youtubeWatch(item.body)) : isTemplateKind(item.kind) ? tvItemKindHints[item.kind] : "";
          const open = editing?.id === item.id ? editing : null;
          const edit = open?.draft ?? null, take = open?.take ?? null;
          const change = (more: Partial<Draft>) => { if (open) setEditing({ ...open, draft: { ...open.draft, ...more } }); };
          const seconds = edit && !SECONDS.includes(edit.seconds) ? [...SECONDS, edit.seconds].sort((a, b) => a - b) : SECONDS;
          const saving = busy === `baris-${item.id}`;
          return <li key={item.id} className={css.plCard} data-off={!item.active} data-open={!!open}>
            {/* What it looks like on a TV, at a glance: the picture itself, or a drawing of the slide. */}
            <div className={css.plShot}>
              {item.kind === "gambar" && item.slideId
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={praWamTvApi.slideImage(item.slideId)} alt="" loading="lazy" width={320} height={180} />
                : <TvPreview kind={item.kind} title={edit?.title ?? item.title} body={item.videoFile ? "" : edit?.body ?? item.body} design={edit?.design ?? item.design}
                  call={edit?.call ?? item.call} date={edit?.date ?? item.date} photo={item.kind === "ultah" && item.slideId ? praWamTvApi.slideImage(item.slideId) : ""} />}
            </div>
            <div className={css.plHead}>
              <span className={css.plKind} aria-hidden="true"><Icon size={18} /></span>
              <p className={css.plOrder}><span aria-label={`Urutan ${index + 1}`}>{index + 1}</span>{sourceOf(item.kind)}</p>
              {isTaking ? <Pill tone="warn">Mengambil alih</Pill> : <Pill tone={item.active ? "ok" : "neutral"}>{item.active ? "Tayang" : "Disembunyikan"}</Pill>}
            </div>
            <div className={css.plText}>
              <h3 className={css.plName}>{name}</h3>
              {note && <p className={css.plNote}>{note}</p>}
            </div>
            <dl className={css.plFacts}>
              <div><dt>Durasi</dt><dd>{item.kind === "video" ? "Sampai video selesai" : `${item.seconds} detik`}</dd></div>
              <div><dt>Tayang di</dt><dd>{screens}</dd></div>
              <div className={css.plWide}><dt>Jadwal</dt><dd>{days}</dd></div>
            </dl>
            <div className={css.plFoot}>
              <div className={css.plMove}>
                <button type="button" className={css.plStep} disabled={!!busy || index === 0} aria-label={`Naikkan ${name}`} title="Naikkan urutan" onClick={() => void move(index, -1)}><ArrowUp size={20} aria-hidden /></button>
                <button type="button" className={css.plStep} disabled={!!busy || index === items.length - 1} aria-label={`Turunkan ${name}`} title="Turunkan urutan" onClick={() => void move(index, 1)}><ArrowDown size={20} aria-hidden /></button>
              </div>
              <ConsoleButton icon={open ? <X size={18} aria-hidden /> : <SlidersHorizontal size={18} aria-hidden />} disabled={!!busy} aria-expanded={!!open} aria-label={`${open ? "Tutup" : "Atur"} ${name}`}
                onClick={() => setEditing(open ? null : { id: item.id, draft: draftOf(item), take: null })}>{open ? "Tutup" : "Atur"}</ConsoleButton>
            </div>

            {open && edit && <form className={css.plDetail} onSubmit={event => { event.preventDefault(); void save(item, edit); }}>
              <div className={css.plCols}>
                <fieldset className={css.plGroup} disabled={!!busy}>
                  <legend>Isi dan durasi</legend>
                  {(isTyped(item.kind) || item.kind === "gambar" || item.kind === "video") && <div className={css.plField}>
                    <label htmlFor={`judul-${item.id}`}>{item.kind === "teks" ? "Judul" : item.kind === "tamu" ? "Nama tamu" : item.kind === "ultah" ? "Nama lengkap" : item.kind === "video" ? "Nama video" : "Nama gambar"}</label>
                    <input id={`judul-${item.id}`} value={edit.title} maxLength={80} onChange={event => change({ title: event.target.value })} />
                  </div>}
                  {item.kind === "ultah" && <div className={css.plFields}>
                    <div className={css.plField}><label htmlFor={`panggilan-${item.id}`}>Nama panggilan</label><input id={`panggilan-${item.id}`} value={edit.call} maxLength={40} placeholder="Misalnya Pak Contoh" onChange={event => change({ call: event.target.value })} /></div>
                    <div className={css.plField}><label htmlFor={`lahir-${item.id}`}>Tanggal ulang tahun</label><input id={`lahir-${item.id}`} type="date" value={edit.date} onChange={event => change({ date: event.target.value })} /></div>
                  </div>}
                  {item.kind === "ultah" && <div className={css.plSubmit}>
                    <ConsoleButton icon={<ImageUp size={18} aria-hidden />} disabled={!!busy || !list.storageReady} onClick={() => { photoFor.current = item.id; photoInput.current?.click(); }}>{busy === `foto-${item.id}` ? "Memotong dan mengunggah…" : item.slideId ? "Ganti foto" : "Unggah foto"}</ConsoleButton>
                    <span className={css.plHint}>Foto setengah badan, tegak. Orangnya dipotong dari latarnya secara otomatis di browser ini (beberapa detik; perlu internet saat pertama).</span>
                  </div>}
                  {isTyped(item.kind) && <div className={css.plField}>
                    <label htmlFor={`isi-${item.id}`}>{item.kind === "tamu" || item.kind === "ultah" ? "Ucapan" : "Isi"}</label>
                    <textarea id={`isi-${item.id}`} rows={3} value={edit.body} maxLength={600} onChange={event => change({ body: event.target.value })} />
                  </div>}
                  {isTemplateKind(item.kind) && <p className={css.plHint}>{tvItemKindHints[item.kind]}</p>}
                  {isWelcome(item.kind) && <div className={css.plField}>
                    <label htmlFor={`desain-${item.id}`}>Desain layar</label>
                    <select id={`desain-${item.id}`} value={edit.design} onChange={event => change({ design: event.target.value as TvWelcomeDesign })}>
                      {designsFor(item.kind).map(design => <option key={design} value={design}>{tvWelcomeDesignLabels[design]}</option>)}
                    </select>
                  </div>}
                  {item.kind === "video" ? <p className={css.plHint}>Diputar tanpa suara sampai selesai, lalu TV lanjut ke tayangan berikutnya. Untuk mengganti videonya, hapus tayangan ini dan tambahkan yang baru.</p>
                  : <div className={css.plField}>
                    <label htmlFor={`durasi-${item.id}`}>Durasi tayang</label>
                    <select id={`durasi-${item.id}`} value={edit.seconds} onChange={event => change({ seconds: Number(event.target.value) })}>
                      {seconds.map(value => <option key={value} value={value}>{value} detik</option>)}
                    </select>
                  </div>}
                </fieldset>

                <fieldset className={css.plGroup} disabled={!!busy}>
                  <legend>Jadwal dan TV</legend>
                  <div className={css.plFields}>
                    <div className={css.plField}><label htmlFor={`dari-${item.id}`}>Mulai tanggal</label><input id={`dari-${item.id}`} type="date" value={edit.showFrom} onChange={event => change({ showFrom: event.target.value })} /></div>
                    <div className={css.plField}><label htmlFor={`sampai-${item.id}`}>Sampai tanggal</label><input id={`sampai-${item.id}`} type="date" value={edit.showUntil} min={edit.showFrom || undefined} onChange={event => change({ showUntil: event.target.value })} /></div>
                    <div className={css.plField}><label htmlFor={`jam-dari-${item.id}`}>Dari jam (WIB)</label><input id={`jam-dari-${item.id}`} type="time" value={edit.timeFrom} onChange={event => change({ timeFrom: event.target.value })} /></div>
                    <div className={css.plField}><label htmlFor={`jam-sampai-${item.id}`}>Sampai jam (WIB)</label><input id={`jam-sampai-${item.id}`} type="time" value={edit.timeUntil} onChange={event => change({ timeUntil: event.target.value })} /></div>
                  </div>
                  <p className={css.plHint}>Kosongkan untuk tayang tanpa batas. Di luar jadwalnya, tayangan dilewati dan muncul lagi dengan sendirinya.</p>
                  {list.screens.length > 0 && <div className={css.plScreens} role="group" aria-label="Tayang di TV">
                    {list.screens.map(screen => <label key={screen.id} className={css.plCheck}>
                      <input type="checkbox" checked={edit.screenIds.includes(screen.id)}
                        onChange={event => change({ screenIds: event.target.checked ? [...edit.screenIds, screen.id] : edit.screenIds.filter(id => id !== screen.id) })} />
                      {screen.name}
                    </label>)}
                  </div>}
                  <p className={css.plHint}>{list.screens.length === 0 ? "Belum ada TV beralamat sendiri, jadi tayangan ini untuk semua TV."
                    : edit.screenIds.length === 0 ? "Tidak ada TV yang dicentang: tayang di semua TV, termasuk alamat umum /tv." : "Hanya di TV yang dicentang. Alamat umum /tv tidak menayangkannya."}</p>
                </fieldset>
              </div>

              <div className={css.plActions}>
                <ConsoleButton type="submit" variant="primary" disabled={!!busy}>{saving ? "Menyimpan…" : "Simpan"}</ConsoleButton>
                {list.welcomeReady && <ConsoleButton icon={<Zap size={18} aria-hidden />} disabled={!!busy} aria-expanded={!!take} onClick={() => setEditing({ ...open, take: take ? null : { minutes: 15, screenIds: [] } })}>Tayangkan sekarang</ConsoleButton>}
                <ConsoleButton icon={item.active ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />} disabled={!!busy} onClick={() => void patch(item, { active: !item.active })}>{item.active ? "Sembunyikan" : "Tayangkan lagi"}</ConsoleButton>
                <ConsoleButton className={css.plDanger} icon={<Trash2 size={18} aria-hidden />} disabled={!!busy} onClick={() => void remove(item)}>Hapus</ConsoleButton>
              </div>

              {take && <div className={css.plTake} role="group" aria-label="Tayangkan sekarang">
                <p className={css.plHint}><strong>{name}</strong> tayang sendirian di TV yang dipilih, menggantikan daftar tayangan, lalu TV kembali ke daftar dengan sendirinya.{item.kind === "sambutan" && !list.welcomes.length ? " Hari ini tidak ada kunjungan terbit, jadi TV akan menulis belum ada yang ditayangkan." : ""}{list.takeover ? " Ini menggantikan tayangan yang sedang mengambil alih." : ""}</p>
                <div className={css.plFields}>
                  <div className={css.plField}>
                    <label htmlFor={`lama-${item.id}`}>Lama</label>
                    <select id={`lama-${item.id}`} value={take.minutes ?? ""} disabled={!!busy} onChange={event => setEditing({ ...open, take: { ...take, minutes: event.target.value ? Number(event.target.value) : null } })}>
                      {tvTakeoverMinutes.map(value => <option key={value} value={value}>{value} menit</option>)}
                      <option value="">Sampai dihentikan</option>
                    </select>
                  </div>
                </div>
                {list.screens.length > 0 && <div className={css.plScreens} role="group" aria-label="Ambil alih di TV">
                  {list.screens.map(screen => <label key={screen.id} className={css.plCheck}>
                    <input type="checkbox" checked={take.screenIds.includes(screen.id)} disabled={!!busy}
                      onChange={event => setEditing({ ...open, take: { ...take, screenIds: event.target.checked ? [...take.screenIds, screen.id] : take.screenIds.filter(id => id !== screen.id) } })} />
                    {screen.name}
                  </label>)}
                </div>}
                <p className={css.plHint}>{take.screenIds.length === 0 ? "Semua TV, termasuk alamat umum /tv." : "Hanya TV yang dicentang. TV lain dan alamat umum /tv tetap memutar daftar tayangan."}</p>
                <div className={css.plActions}>
                  <ConsoleButton variant="primary" icon={<Zap size={18} aria-hidden />} disabled={!!busy} onClick={() => void takeOver(item, take)}>{busy === "ambil-alih" ? "Memulai…" : "Mulai tayangkan"}</ConsoleButton>
                </div>
              </div>}
            </form>}
          </li>;
        })}</ol>}
    </section>

    <input ref={photoInput} className={css.plFile} type="file" accept={ACCEPT} tabIndex={-1} aria-hidden="true"
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file && photoFor.current) void uploadPhoto(photoFor.current, file); }} />

    <section className={akun.section} aria-labelledby="tv-tambah">
      <SectionToolbar title={<span id="tv-tambah">Tambah tayangan</span>} />
      {!list.storageReady && <Notice tone="warning">Penyimpanan gambar belum disiapkan (R2). Template dan teks tetap bisa ditayangkan; gambar belum bisa diunggah.</Notice>}
      <div className={css.plAdd}>
        <div className={css.plPick}><SegmentedControl label="Jenis tayangan yang ditambahkan" options={adds} value={adding} onChange={setAdding} /></div>

        {adding === "template" && <div className={css.plPane}>
          <p className={css.plHint}>Isinya datang sendiri dari WAM dan Kunjungan Kantor. Tiap template cukup satu.</p>
          {missing.length === 0 ? <p className={css.plDone}>Semua template sudah ada di daftar.</p>
            : <ul className={css.plTemplates}>{missing.map(kind => {
              const Icon = icons[kind];
              return <li key={kind} className={css.plTemplate}>
                <TvPreview className={css.plMini} kind={kind} />
                <div><strong><Icon size={16} aria-hidden />{tvItemKindLabels[kind]}</strong><p>{tvItemKindHints[kind]}</p></div>
                <ConsoleButton icon={<Plus size={18} aria-hidden />} disabled={!!busy || (kind === "sambutan" && !list.welcomeReady)} aria-label={`Tambah ${tvItemKindLabels[kind]}`} onClick={() => void add(kind)}>{busy === `tambah-${kind}` ? "Menambahkan…" : "Tambah"}</ConsoleButton>
              </li>;
            })}</ul>}
          {(missing.includes("pengumuman") || missing.includes("sambutan")) && <p className={css.plHint}>Alamat TV terbuka: pengumuman yang tayang hanya yang dikirim ke semua peserta, dan Sambutan tamu menampilkan nama tamu di TV.</p>}
        </div>}

        {adding === "tamu" && <form className={css.plPane} onSubmit={event => { event.preventDefault(); void add("tamu", guest, () => setGuest({ title: "", body: "" })); }}>
          <p className={css.plHint}>Untuk tamu tanpa halaman Kunjungan Kantor. Tanggal dan jam tayangnya diatur lewat Atur setelah ditambahkan.</p>
          <TvPreview className={css.plLive} kind="tamu" title={guest.title} body={guest.body} />
          <div className={css.plField}>
            <label htmlFor="tamu-nama">Nama tamu</label>
            <input id="tamu-nama" value={guest.title} maxLength={80} placeholder="Nama orang atau perusahaan" disabled={!!busy} onChange={event => setGuest(value => ({ ...value, title: event.target.value }))} />
          </div>
          <div className={css.plField}>
            <label htmlFor="tamu-ucapan">Ucapan (boleh kosong)</label>
            <textarea id="tamu-ucapan" rows={2} value={guest.body} maxLength={600} disabled={!!busy} onChange={event => setGuest(value => ({ ...value, body: event.target.value }))} />
          </div>
          <div className={css.plSubmit}>
            <ConsoleButton type="submit" variant="primary" icon={<Plus size={18} aria-hidden />} disabled={!!busy || !guest.title.trim() || !list.welcomeReady}>{busy === "tambah-tamu" ? "Menambahkan…" : "Tambah sambutan"}</ConsoleButton>
          </div>
        </form>}

        {adding === "ultah" && <form className={css.plPane} onSubmit={event => { event.preventDefault(); void addBirthday(); }}>
          <p className={css.plHint}>Kartu ulang tahun Werkudara untuk satu orang. Tayang pada tanggal ulang tahunnya tahun ini; ubah harinya lewat Atur.</p>
          <TvPreview className={css.plLive} kind="ultah" title={bday.title} body={bday.body} call={bday.call} date={bday.date} photo={bdayPhoto?.shown ?? ""} />
          <input ref={newPhotoInput} className={css.plFile} type="file" accept={ACCEPT} tabIndex={-1} aria-hidden="true"
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void pickBirthdayPhoto(file); }} />
          <div className={css.plSubmit}>
            <ConsoleButton icon={<ImageUp size={18} aria-hidden />} disabled={!!busy || !list.storageReady} onClick={() => newPhotoInput.current?.click()}>{busy === "foto-baru" ? "Memotong foto…" : bdayPhoto ? "Ganti foto" : "Pilih foto"}</ConsoleButton>
            <span className={css.plHint} aria-live="polite">{bdayPhoto?.note ?? "Foto setengah badan, tegak. Orangnya dipotong dari latarnya secara otomatis di browser ini."}</span>
          </div>
          <div className={css.plField}>
            <label htmlFor="ultah-nama">Nama lengkap</label>
            <input id="ultah-nama" value={bday.title} maxLength={80} disabled={!!busy} onChange={event => setBday(value => ({ ...value, title: event.target.value }))} />
          </div>
          <div className={css.plFields}>
            <div className={css.plField}>
              <label htmlFor="ultah-panggilan">Nama panggilan</label>
              <input id="ultah-panggilan" value={bday.call} maxLength={40} placeholder="Misalnya Pak Contoh" disabled={!!busy} aria-describedby="ultah-panggilan-ket" onChange={event => setBday(value => ({ ...value, call: event.target.value }))} />
            </div>
            <div className={css.plField}>
              <label htmlFor="ultah-tanggal">Tanggal ulang tahun</label>
              <input id="ultah-tanggal" type="date" value={bday.date} disabled={!!busy} onChange={event => setBday(value => ({ ...value, date: event.target.value }))} />
            </div>
          </div>
          <p id="ultah-panggilan-ket" className={css.plHint}>Nama panggilan dipakai di tulisan &quot;Happy Birthday …&quot;. Kosongkan untuk memakai nama lengkap.</p>
          <div className={css.plField}>
            <label htmlFor="ultah-ucapan">Ucapan</label>
            <textarea id="ultah-ucapan" rows={4} value={bday.body} maxLength={600} disabled={!!busy} onChange={event => setBday(value => ({ ...value, body: event.target.value }))} />
          </div>
          <div className={css.plSubmit}>
            <ConsoleButton type="submit" variant="primary" icon={<Plus size={18} aria-hidden />} disabled={!!busy || !bday.title.trim()}>{busy === "tambah-ultah" ? "Menambahkan…" : "Tambah ucapan"}</ConsoleButton>
          </div>
        </form>}

        {adding === "teks" && <form className={css.plPane} onSubmit={event => { event.preventDefault(); void add("teks", text, () => setText({ title: "", body: "" })); }}>
          <p className={css.plHint}>Tulisan besar di tengah layar: judul dan isi.</p>
          <TvPreview className={css.plLive} kind="teks" title={text.title} body={text.body} />
          <div className={css.plField}>
            <label htmlFor="teks-judul">Judul</label>
            <input id="teks-judul" value={text.title} maxLength={80} placeholder="Misalnya Selamat datang" disabled={!!busy} onChange={event => setText(value => ({ ...value, title: event.target.value }))} />
          </div>
          <div className={css.plField}>
            <label htmlFor="teks-isi">Isi</label>
            <textarea id="teks-isi" rows={3} value={text.body} maxLength={600} disabled={!!busy} onChange={event => setText(value => ({ ...value, body: event.target.value }))} />
          </div>
          <div className={css.plSubmit}>
            <ConsoleButton type="submit" variant="primary" icon={<Plus size={18} aria-hidden />} disabled={!!busy || (!text.title.trim() && !text.body.trim())}>{busy === "tambah-teks" ? "Menambahkan…" : "Tambah teks"}</ConsoleButton>
          </div>
        </form>}

        {adding === "video" && <form className={css.plPane} onSubmit={event => { event.preventDefault(); void add("video", clip, () => setClip({ title: "", body: "" })); }}>
          <p className={css.plHint}>TV memutar video tanpa suara sampai selesai, lalu lanjut ke tayangan berikutnya. TV yang tidak kuat memutar video bisa diatur melewatinya di Layar TV.</p>
          <h3 className={css.plSub}><Play size={16} aria-hidden />Dari YouTube</h3>
          {youtubeId(clip.body) && <TvPreview className={css.plLive} kind="video" title={clip.title} body={youtubeId(clip.body) ?? ""} />}
          <div className={css.plField}>
            <label htmlFor="video-alamat">Alamat video YouTube</label>
            <input id="video-alamat" type="url" inputMode="url" value={clip.body} maxLength={300} placeholder="https://www.youtube.com/watch?v=…" disabled={!!busy} aria-describedby="video-alamat-ket"
              onChange={event => setClip(value => ({ ...value, body: event.target.value }))} />
            <p id="video-alamat-ket" className={css.plHint}>{!clip.body.trim() ? "Tempel alamat dari tombol Bagikan di YouTube." : youtubeId(clip.body) ? "Video dikenali." : "Alamat ini bukan alamat video YouTube."}</p>
          </div>
          <div className={css.plField}>
            <label htmlFor="video-nama">Nama video</label>
            <input id="video-nama" value={clip.title} maxLength={80} placeholder="Misalnya Annual Meeting 2025" disabled={!!busy} onChange={event => setClip(value => ({ ...value, title: event.target.value }))} />
          </div>
          <div className={css.plSubmit}>
            <ConsoleButton type="submit" variant="primary" icon={<Plus size={18} aria-hidden />} disabled={!!busy || !youtubeId(clip.body)}>{busy === "tambah-video" ? "Menambahkan…" : "Tambah video"}</ConsoleButton>
          </div>
          <h3 className={css.plSub}><FileVideo size={16} aria-hidden />Dari berkas video</h3>
          <p className={css.plHint}>MP4 atau WebM, paling besar 200 MB. Berkas disimpan di penyimpanan Journey, jadi TV tidak perlu membuka YouTube. Nama dan jadwalnya diatur lewat Atur setelah diunggah.</p>
          <input ref={videoInput} className={css.plFile} type="file" accept={ACCEPT_VIDEO} tabIndex={-1} aria-hidden="true"
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadVideo(file); }} />
          <div className={css.plSubmit}>
            <ConsoleButton icon={<FileVideo size={18} aria-hidden />} disabled={!!busy || !list.storageReady} onClick={() => videoInput.current?.click()}>{busy === "unggah-video" ? "Mengunggah…" : "Unggah berkas video"}</ConsoleButton>
          </div>
          {busy === "unggah-video" && progress && <p className={css.plHint} aria-live="polite">{progress}</p>}
        </form>}

        {adding === "gambar" && <div className={css.plPane}>
          <p className={css.plHint}>JPG, PNG, atau WebP; boleh beberapa sekaligus. Paling banyak {tvLimits.slides} gambar ({pictures} terpakai).</p>
          <input ref={fileInput} className={css.plFile} type="file" accept={ACCEPT} multiple tabIndex={-1} aria-hidden="true"
            onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ""; if (files.length) void upload(files); }} />
          <div className={css.plSubmit}>
            <ConsoleButton variant="primary" icon={<ImageUp size={18} aria-hidden />} disabled={!!busy || !list.storageReady || pictures >= tvLimits.slides} onClick={() => fileInput.current?.click()}>
              {busy === "unggah" ? "Mengunggah…" : "Unggah gambar"}
            </ConsoleButton>
          </div>
          {busy === "unggah" && progress && <p className={css.plHint} aria-live="polite">{progress}</p>}
        </div>}
      </div>
    </section>
  </>;
}
