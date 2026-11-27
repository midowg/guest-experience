"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Cake, CalendarDays, CalendarRange, ChevronRight, DoorOpen, ExternalLink, Eye, EyeOff, ImageUp, Images, FileVideo, ListOrdered, Megaphone, Play, Plus, Sparkles, Square, Trash2, Type, UserRound, Volume2, Zap } from "lucide-react";
import { Notice } from "@/components/ui";
import { ConsoleButton, ConsoleButtonLink, FilterChips, PageHeader, Pill, type Crumb } from "@/components/console";
import { Sheet, SheetError } from "@/components/admin/wam-acara/isi/Sheet";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import { putFile, putProblem } from "@/components/pra-wam/photoUpload";
import { uploadSlide } from "@/components/admin/wam/PraWamTv";
import akun from "@/components/admin/wam/akun/akun.module.css";
import { clockLabel, wibTime } from "@/lib/pra-wam/appraisal";
import { isTemplateKind, liteNote, scheduleLabel, tvItemKindHints, tvItemKindLabels, tvLimits, tvTakeoverMinutes, tvTemplateKinds, TV_BIRTHDAY_WISH, tvVideoLength, tvVideoTypes, TV_VIDEO_BYTES, tvWelcomeDesignLabels, tvWelcomeDesigns, videoSeconds, youtubeId, youtubeWatch, type TvItemKind, type TvVideoMime, type TvWelcomeDesign } from "@/lib/pra-wam/tv";
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
/** What a row is, in a word or two, for the line under its name. */
const sourceOf = (kind: TvItemKind) => kind === "sambutan" ? "Dari Kunjungan Kantor" : isTemplateKind(kind) ? "Dari WAM" : kind === "tamu" ? "Sambutan tamu" : tvItemKindLabels[kind];
type Draft = { title: string; body: string; call: string; date: string; design: TvWelcomeDesign; seconds: number; showFrom: string; showUntil: string; timeFrom: string; timeUntil: string; screenIds: string[];
  /** A picture's: whether it runs in the photo row of a TV laid out in two rows. */
  strip: boolean;
  /** A video's: whether it plays with its sound, and its length in seconds as typed ("" = not known). */
  sound: boolean; length: string };
/** What "Tayangkan sekarang" is asked with (`minutes` null: until stopped). */
type Take = { minutes: number | null; screenIds: string[] };
const draftOf = (item: TvAdminItem): Draft => ({
  title: item.title, body: item.body, call: item.call, date: item.date, design: item.design, seconds: item.seconds, showFrom: item.showFrom ?? "", showUntil: item.showUntil ?? "",
  timeFrom: item.timeFrom ?? "", timeUntil: item.timeUntil ?? "", screenIds: item.screenIds, strip: item.strip ?? false, sound: item.sound ?? false, length: item.length ? String(item.length) : "",
});
/** What can be added, said the way someone who has never seen this page would ask for it. */
const adds = [
  { value: "template", label: "Jadwal dan info otomatis", hint: "Kalender ruang, Timeline, pengumuman, sambutan tamu, foto meeting. Isinya datang sendiri.", icon: Sparkles },
  { value: "gambar", label: "Gambar", hint: "Poster atau foto. Boleh beberapa sekaligus.", icon: ImageUp },
  { value: "video", label: "Video", hint: "Dari YouTube atau berkas video. Bisa dengan suara.", icon: Play },
  { value: "teks", label: "Tulisan", hint: "Judul dan isi, besar di tengah layar.", icon: Type },
  { value: "tamu", label: "Sambutan tamu", hint: "Selamat datang untuk tamu yang namanya Anda ketik.", icon: UserRound },
  { value: "ultah", label: "Ucapan ulang tahun", hint: "Kartu ulang tahun dengan nama dan foto.", icon: Cake },
] as const;
type AddKind = (typeof adds)[number]["value"];
type Shown = "semua" | "tayang" | "sembunyi";

/** A video file's length, as this browser reads it; null when it cannot. */
function lengthOf(file: File): Promise<number | null> {
  return new Promise(resolve => {
    let settled = false;
    const address = URL.createObjectURL(file);
    const done = (value: number | null) => { if (settled) return; settled = true; URL.revokeObjectURL(address); resolve(value); };
    try {
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.onloadedmetadata = () => done(videoSeconds(probe.duration));
      probe.onerror = () => done(null);
      probe.src = address;
    } catch { done(null); }
    window.setTimeout(() => done(null), 8_000);
  });
}

/**
 * Admin TV → Tayangan: the playlist, after docs/standar-admin.md. One row per thing a TV plays, in
 * playing order: a small picture of the slide, its name, one line that says what it is and when and
 * where it plays, and its state. The row itself opens it (a sheet: from the side on a laptop, from
 * the bottom on a phone) with its words, when and where it plays, a video's sound, and the other
 * actions (Tayangkan sekarang, Sembunyikan, Hapus). Only the two arrows that move a row stay on it.
 * One main action, Tambah tayangan: a sheet that first asks what to add, in plain words.
 */
export function TvPlaylist({ initial, crumbs, title }: { initial: TvAdmin; crumbs: readonly Crumb[]; title: string }) {
  const [list, setList] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  /** The row that is open, with what is typed in it; `take` is set while its "Tayangkan sekarang" is being asked. */
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
  /** Tambah tayangan: closed (null), asking what to add ("pilih"), or one kind's form. */
  const [adding, setAdding] = useState<AddKind | "pilih" | null>(null);
  const [shown, setShown] = useState<Shown>("semua");
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
    const body = item.kind === "gambar" ? `${name} hilang dari semua TV dan dari penyimpanan. Kalau hanya ingin berhenti menayangkannya, pilih Sembunyikan.`
      : isTemplateKind(item.kind) ? `${name} tidak lagi tayang di TV mana pun. Tayangan ini bisa ditambahkan lagi kapan saja; datanya tetap ada di sumbernya.`
      : `${name} dihapus dari daftar tayangan.`;
    if (!(await confirm({ title: "Hapus tayangan ini?", body, confirmLabel: "Hapus", danger: true }))) return;
    await run(`baris-${item.id}`, praWamTvApi.item(item.id), { method: "DELETE" }, () => setEditing(null));
  }
  function save(item: TvAdminItem, draft: Draft) {
    const length = draft.length.trim() ? Number(draft.length) : null;
    return patch(item, {
      ...(isTyped(item.kind) || item.kind === "gambar" || item.kind === "video" ? { title: draft.title } : {}),
      ...(isTyped(item.kind) ? { body: draft.body } : {}),
      seconds: draft.seconds,
      ...(isWelcome(item.kind) ? { design: draft.design } : {}),
      ...(item.kind === "ultah" ? { call: draft.call, date: draft.date || null } : {}),
      // Sent only when changed, so saving anything else never waits for the migration these are kept by.
      ...(item.kind === "gambar" && draft.strip !== (item.strip ?? false) ? { strip: draft.strip } : {}),
      ...(item.kind === "video" && draft.sound !== (item.sound ?? false) ? { sound: draft.sound } : {}),
      ...(item.kind === "video" && item.videoFile && length !== (item.length ?? null) ? { length } : {}),
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
    if (!failed.length) setAdding(null);
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
      let data = added.data ?? list, said = added.message;
      const made = data.items?.find(item => item.kind === "ultah" && !before.has(item.id));
      if (bdayPhoto && made) {
        try { data = await uploadSlide(bdayPhoto.file, made.id, bdayPhoto.cut); said = "Ucapan ulang tahun ditambahkan dengan fotonya."; }
        catch (error) { said = `Ucapan ditambahkan, tetapi fotonya belum tersimpan: ${errorMessage(error)} Unggah lagi dengan membuka ucapannya.`; }
      }
      setList(data);
      setMessage({ tone: "success", text: said });
      setBday(value => ({ ...value, title: "", call: "" }));
      if (bdayPhoto) URL.revokeObjectURL(bdayPhoto.shown);
      setBdayPhoto(null);
      setAdding(null);
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
      // The video's length, read here: the board for old TVs stays on the video for that long.
      const length = await lengthOf(file);
      const start = await adminRequest<{ key: string; uploadUrl: string; token: string }>(praWamTvApi.videoStart, { method: "POST", body: JSON.stringify(agreed) });
      const problem = putProblem(await putFile(start.data!.uploadUrl, file, agreed.mime, share => setProgress(`Mengunggah ${file.name}: ${Math.round(share * 100)}%`)));
      if (problem) throw new AdminApiError(problem);
      setProgress("Memeriksa berkas…");
      const named = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 80);
      const done = await adminRequest<TvAdmin>(praWamTvApi.videoConfirm, { method: "POST", body: JSON.stringify({ ...agreed, key: start.data!.key, token: start.data!.token, title: named, ...(length ? { length } : {}) }) });
      if (done.data) setList(done.data);
      setMessage({ tone: "success", text: `${done.message} Buka videonya di daftar untuk menyalakan suaranya.` });
      setAdding(null);
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
  const rows = items.map((item, index) => ({ item, index })).filter(({ item }) => shown === "semua" || (shown === "tayang") === item.active);
  const closeAdd = () => { if (!busy) setAdding(null); };
  const refused = message?.tone === "error" ? message.text : null;

  // The open row, for its sheet.
  const open = editing ? items.find(item => item.id === editing.id) : undefined;
  const edit = open && editing ? editing.draft : null;
  const take = open && editing ? editing.take : null;
  const change = (more: Partial<Draft>) => { if (editing) setEditing({ ...editing, draft: { ...editing.draft, ...more } }); };
  const seconds = edit && !SECONDS.includes(edit.seconds) ? [...SECONDS, edit.seconds].sort((a, b) => a - b) : SECONDS;
  const lengthBad = !!edit && !!edit.length.trim() && videoSeconds(Number(edit.length)) === null;

  return <>
    {confirmDialog}
    <PageHeader crumbs={crumbs} title={title} subtitle="Semua yang ditayangkan TV, berurutan dari atas lalu mengulang."
      actions={<>
        <ConsoleButtonLink href={tvAdminPath.preview} target="_blank" rel="noopener" icon={<ExternalLink size={18} aria-hidden />}>Lihat seperti di TV</ConsoleButtonLink>
        <ConsoleButton variant="primary" icon={<Plus size={18} aria-hidden />} onClick={() => { setMessage(null); setAdding("pilih"); }}>Tambah tayangan</ConsoleButton>
      </>} />
    <div aria-live="polite">{message && !editing && !adding && <Notice tone={message.tone}>{message.text}</Notice>}</div>
    {list.takeover && taken && <div className={css.plTaking} role="status">
      <Zap size={20} aria-hidden />
      <p><strong>{nameOf(taken)}</strong> sedang mengambil alih {takenWhere}, {list.takeover.until ? `sampai ${clockLabel(wibTime(list.takeover.until))} WIB` : "sampai dihentikan"}. Tayangan lain menunggu.</p>
      <ConsoleButton icon={<Square size={16} aria-hidden />} disabled={!!busy} onClick={() => void run("hentikan", praWamTvApi.takeover, { method: "DELETE" })}>{busy === "hentikan" ? "Menghentikan…" : "Hentikan"}</ConsoleButton>
    </div>}
    {list.items && !list.welcomeReady && <Notice tone="warning">Sambutan tamu dan Tayangkan sekarang menunggu migrasi 202611100008_pw_tv_welcome.sql. Tayangan lain berjalan seperti biasa.</Notice>}

    <section className={akun.section} aria-label="Daftar tayangan">
      <div className={css.plBar}>
        <FilterChips label="Tampilkan" value={shown} onChange={setShown} chips={[
          { value: "semua", label: "Semua", count: items.length },
          { value: "tayang", label: "Tayang", count: active },
          { value: "sembunyi", label: "Disembunyikan", count: items.length - active },
        ]} />
        <p className={css.plHint}>{shown === "semua" ? "Ketuk satu tayangan untuk mengaturnya. Panah mengubah urutan tayang." : "Urutan diubah di tampilan Semua."} Tanda <strong>TV</strong> = tayang di papan biasa, <strong>Lite</strong> = tayang juga di TV lama.</p>
      </div>
      {items.length === 0 ? <div className={css.plEmpty}>
        <p>Belum ada tayangan, jadi TV menulis &quot;Belum ada yang ditayangkan&quot;.</p>
        <ConsoleButton variant="primary" icon={<Plus size={18} aria-hidden />} onClick={() => setAdding("pilih")}>Tambah tayangan pertama</ConsoleButton>
      </div>
        : rows.length === 0 ? <p className={akun.empty}>{shown === "tayang" ? "Tidak ada tayangan yang sedang tayang." : "Tidak ada tayangan yang disembunyikan."}</p>
        : <ol className={css.plList} aria-label="Tayangan, urut tayang">{rows.map(({ item, index }) => {
          const name = nameOf(item);
          const isTaking = list.takeover?.itemId === item.id;
          const days = scheduleLabel({ ...item, screenIds: [] }, screenName) || "Setiap hari";
          const where = item.screenIds.length ? item.screenIds.map(id => screenName(id) ?? "TV yang sudah dihapus").join(", ") : "Semua TV";
          const long = item.kind === "video" ? "Sampai video selesai" : `${item.seconds} detik`;
          const line = [sourceOf(item.kind), long, where, days,
            item.kind === "gambar" && list.rowsReady && item.strip ? "Baris foto bawah" : ""].filter(Boolean).join(" · ");
          const note = item.kind === "sambutan" ? (list.welcomes.length ? `Hari ini: ${list.welcomes.join(", ")}` : "Tidak ada kunjungan terbit hari ini, jadi dilewati.")
            : item.kind === "ultah" ? [item.call && `Happy Birthday ${item.call}`, item.slideId ? "" : "Belum ada foto."].filter(Boolean).join(" · ")
            : isTyped(item.kind) ? item.body : item.kind === "video" && !item.videoFile ? youtubeWatch(item.body) : "";
          const lite = liteNote(item);
          return <li key={item.id} className={css.plRow} data-off={!item.active}>
            <span className={css.plOrder} aria-label={`Urutan ${index + 1}`}>{index + 1}</span>
            <button type="button" className={css.plOpen} aria-label={`Atur ${name}`} aria-describedby={`baris-${item.id}`} disabled={!!busy}
              onClick={() => { setMessage(null); setEditing({ id: item.id, draft: draftOf(item), take: null }); }}>
              {/* What it looks like on a TV, at a glance: the picture itself, or a drawing of the slide. */}
              <span className={css.plShot}>
                {item.kind === "gambar" && item.slideId
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={praWamTvApi.slideImage(item.slideId)} alt="" loading="lazy" width={160} height={90} />
                  : <TvPreview kind={item.kind} title={item.title} body={item.videoFile ? "" : item.body} design={item.design}
                    call={item.call} date={item.date} photo={item.kind === "ultah" && item.slideId ? praWamTvApi.slideImage(item.slideId) : ""} />}
              </span>
              <span className={css.plText} id={`baris-${item.id}`}>
                <strong className={css.plName}>{name}</strong>
                <span className={css.plLine}>{line}</span>
                {note && <span className={css.plNote}>{note}</span>}
                {/* Where it plays: the board every TV gets, and the one for old TVs (which passes some videos over). */}
                <span className={css.plChips}>
                  <span className={css.plChip} title="Tayang di papan biasa (/tv)">TV</span>
                  <span className={css.plChip} data-off={!lite.plays || undefined} title={lite.plays ? "Tayang juga di papan lite untuk TV lama (/tv/lite)" : lite.why}>{lite.plays ? "Lite" : "Tidak di lite"}</span>
                  {item.kind === "video" && item.sound && <span className={css.plChip} title="Diputar dengan suara di TV yang boleh bersuara">Bersuara</span>}
                </span>
              </span>
              <span className={css.plState}>
                {isTaking ? <Pill tone="warn">Mengambil alih</Pill> : <Pill tone={item.active ? "ok" : "neutral"}>{item.active ? "Tayang" : "Disembunyikan"}</Pill>}
                <ChevronRight size={20} aria-hidden />
              </span>
            </button>
            {shown === "semua" && <div className={css.plMove}>
              <button type="button" className={css.plStep} disabled={!!busy || index === 0} aria-label={`Naikkan ${name}`} title="Naikkan urutan" onClick={() => void move(index, -1)}><ArrowUp size={20} aria-hidden /></button>
              <button type="button" className={css.plStep} disabled={!!busy || index === items.length - 1} aria-label={`Turunkan ${name}`} title="Turunkan urutan" onClick={() => void move(index, 1)}><ArrowDown size={20} aria-hidden /></button>
            </div>}
          </li>;
        })}</ol>}
    </section>

    <input ref={photoInput} className={css.plFile} type="file" accept={ACCEPT} tabIndex={-1} aria-hidden="true"
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file && photoFor.current) void uploadPhoto(photoFor.current, file); }} />

    {/* One tayangan, opened: its words, when and where it plays, a video's sound, and the other actions. */}
    {open && edit && editing && <SheetError.Provider value={refused}>
      <Sheet title={nameOf(open)} subtitle={`${sourceOf(open.kind)} · ${open.active ? "Tayang" : "Disembunyikan"}`} busy={!!busy} onClose={() => setEditing(null)} onSubmit={() => { if (!lengthBad) void save(open, edit); }}
        footer={<>
          <ConsoleButton disabled={!!busy} onClick={() => setEditing(null)}>Batal</ConsoleButton>
          <ConsoleButton type="submit" variant="primary" disabled={!!busy || lengthBad}>{busy === `baris-${open.id}` ? "Menyimpan…" : "Simpan"}</ConsoleButton>
        </>}>
        <div className={css.plPeek}>
          {open.kind === "gambar" && open.slideId
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={praWamTvApi.slideImage(open.slideId)} alt="" width={320} height={180} />
            : <TvPreview kind={open.kind} title={edit.title} body={open.videoFile ? "" : edit.body} design={edit.design}
              call={edit.call} date={edit.date} photo={open.kind === "ultah" && open.slideId ? praWamTvApi.slideImage(open.slideId) : ""} />}
        </div>

        <fieldset className={css.plGroup} disabled={!!busy}>
          <legend>Isi</legend>
          {(isTyped(open.kind) || open.kind === "gambar" || open.kind === "video") && <div className={css.plField}>
            <label htmlFor={`judul-${open.id}`}>{open.kind === "teks" ? "Judul" : open.kind === "tamu" ? "Nama tamu" : open.kind === "ultah" ? "Nama lengkap" : open.kind === "video" ? "Nama video" : "Nama gambar"}</label>
            <input id={`judul-${open.id}`} value={edit.title} maxLength={80} onChange={event => change({ title: event.target.value })} />
          </div>}
          {open.kind === "ultah" && <div className={css.plFields}>
            <div className={css.plField}><label htmlFor={`panggilan-${open.id}`}>Nama panggilan</label><input id={`panggilan-${open.id}`} value={edit.call} maxLength={40} placeholder="Misalnya Pak Contoh" onChange={event => change({ call: event.target.value })} /></div>
            <div className={css.plField}><label htmlFor={`lahir-${open.id}`}>Tanggal ulang tahun</label><input id={`lahir-${open.id}`} type="date" value={edit.date} onChange={event => change({ date: event.target.value })} /></div>
          </div>}
          {open.kind === "ultah" && <div className={css.plSubmit}>
            <ConsoleButton icon={<ImageUp size={18} aria-hidden />} disabled={!!busy || !list.storageReady} onClick={() => { photoFor.current = open.id; photoInput.current?.click(); }}>{busy === `foto-${open.id}` ? "Memotong dan mengunggah…" : open.slideId ? "Ganti foto" : "Unggah foto"}</ConsoleButton>
            <span className={css.plHint}>Foto setengah badan, tegak. Orangnya dipotong dari latarnya secara otomatis (beberapa detik).</span>
          </div>}
          {isTyped(open.kind) && <div className={css.plField}>
            <label htmlFor={`isi-${open.id}`}>{open.kind === "tamu" || open.kind === "ultah" ? "Ucapan" : "Isi"}</label>
            <textarea id={`isi-${open.id}`} rows={3} value={edit.body} maxLength={600} onChange={event => change({ body: event.target.value })} />
          </div>}
          {isTemplateKind(open.kind) && <p className={css.plHint}>{tvItemKindHints[open.kind]}</p>}
          {isWelcome(open.kind) && <div className={css.plField}>
            <label htmlFor={`desain-${open.id}`}>Desain layar</label>
            <select id={`desain-${open.id}`} value={edit.design} onChange={event => change({ design: event.target.value as TvWelcomeDesign })}>
              {designsFor(open.kind).map(design => <option key={design} value={design}>{tvWelcomeDesignLabels[design]}</option>)}
            </select>
          </div>}
          {open.kind === "gambar" && list.rowsReady && <div className={css.plField}>
            <label htmlFor={`baris-foto-${open.id}`}>Di TV dua baris</label>
            <select id={`baris-foto-${open.id}`} value={edit.strip ? "bawah" : "atas"} onChange={event => change({ strip: event.target.value === "bawah" })}>
              <option value="atas">Bagian atas, bergantian dengan tayangan lain</option>
              <option value="bawah">Baris foto bawah, berjalan terus</option>
            </select>
            <p className={css.plHint}>Hanya berlaku di TV yang susunannya dua baris (Layar TV).</p>
          </div>}
          {open.kind === "video" ? <p className={css.plHint}>Diputar sampai selesai, lalu TV lanjut ke tayangan berikutnya. Untuk mengganti videonya, hapus tayangan ini dan tambahkan yang baru.</p>
          : <div className={css.plField}>
            <label htmlFor={`durasi-${open.id}`}>Lama tayang</label>
            <select id={`durasi-${open.id}`} value={edit.seconds} onChange={event => change({ seconds: Number(event.target.value) })}>
              {seconds.map(value => <option key={value} value={value}>{value} detik</option>)}
            </select>
          </div>}
        </fieldset>

        {open.kind === "video" && <fieldset className={css.plGroup} disabled={!!busy}>
          <legend><Volume2 size={18} aria-hidden />Suara</legend>
          <div className={css.plChoice} role="radiogroup" aria-label="Suara video">
            <label className={css.plRadio}><input type="radio" name={`suara-${open.id}`} checked={!edit.sound} onChange={() => change({ sound: false })} /><span><strong>Tanpa suara</strong>Aman untuk semua TV.</span></label>
            <label className={css.plRadio}><input type="radio" name={`suara-${open.id}`} checked={edit.sound} onChange={() => change({ sound: true })} /><span><strong>Dengan suara</strong>TV mencoba memutar suaranya.</span></label>
          </div>
          {edit.sound && <p className={css.plHint}>Sebagian TV menolak suara yang tidak diminta lewat remote. Di TV seperti itu video tetap jalan tanpa suara, dan TV menulis caranya: tekan OK di remote sekali. {list.soundReady ? "TV yang disetel senyap di Layar TV tetap tanpa suara." : ""}</p>}
          {open.videoFile ? <div className={css.plField}>
            <label htmlFor={`lama-video-${open.id}`}>Lama video (detik)</label>
            <input id={`lama-video-${open.id}`} type="number" inputMode="numeric" min={tvVideoLength.least} max={tvVideoLength.most} value={edit.length} placeholder="Misalnya 95" aria-describedby={`lama-video-ket-${open.id}`} aria-invalid={lengthBad || undefined}
              onChange={event => change({ length: event.target.value })} />
            <p id={`lama-video-ket-${open.id}`} className={css.plHint} data-bad={lengthBad || undefined}>{lengthBad ? "Isi angka antara 3 dan 1.800 detik, atau kosongkan."
              : "Hanya untuk TV lama (alamat /lite): TV itu pindah ke tayangan berikutnya setelah waktu ini. Terisi sendiri saat video diunggah. Kalau kosong, TV lama melewati video ini."}</p>
          </div> : <p className={css.plHint}>TV lama (alamat /lite) melewati video YouTube. Untuk TV lama, unggah videonya sebagai berkas.</p>}
        </fieldset>}

        <fieldset className={css.plGroup} disabled={!!busy}>
          <legend>Kapan tayang</legend>
          <div className={css.plFields}>
            <div className={css.plField}><label htmlFor={`dari-${open.id}`}>Mulai tanggal</label><input id={`dari-${open.id}`} type="date" value={edit.showFrom} onChange={event => change({ showFrom: event.target.value })} /></div>
            <div className={css.plField}><label htmlFor={`sampai-${open.id}`}>Sampai tanggal</label><input id={`sampai-${open.id}`} type="date" value={edit.showUntil} min={edit.showFrom || undefined} onChange={event => change({ showUntil: event.target.value })} /></div>
            <div className={css.plField}><label htmlFor={`jam-dari-${open.id}`}>Dari jam (WIB)</label><input id={`jam-dari-${open.id}`} type="time" value={edit.timeFrom} onChange={event => change({ timeFrom: event.target.value })} /></div>
            <div className={css.plField}><label htmlFor={`jam-sampai-${open.id}`}>Sampai jam (WIB)</label><input id={`jam-sampai-${open.id}`} type="time" value={edit.timeUntil} onChange={event => change({ timeUntil: event.target.value })} /></div>
          </div>
          <p className={css.plHint}>Kosongkan semuanya untuk tayang terus. Di luar waktunya, tayangan dilewati dan muncul lagi dengan sendirinya.</p>
        </fieldset>

        <fieldset className={css.plGroup} disabled={!!busy}>
          <legend>Di TV mana</legend>
          {list.screens.length > 0 && <div className={css.plScreens} role="group" aria-label="Tayang di TV">
            {list.screens.map(screen => <label key={screen.id} className={css.plCheck}>
              <input type="checkbox" checked={edit.screenIds.includes(screen.id)}
                onChange={event => change({ screenIds: event.target.checked ? [...edit.screenIds, screen.id] : edit.screenIds.filter(id => id !== screen.id) })} />
              {screen.name}
            </label>)}
          </div>}
          <p className={css.plHint}>{list.screens.length === 0 ? "Belum ada TV beralamat sendiri, jadi tayangan ini untuk semua TV."
            : edit.screenIds.length === 0 ? "Tidak ada yang dicentang: tayang di semua TV." : "Hanya di TV yang dicentang."}</p>
        </fieldset>

        <div className={css.plGroup} role="group" aria-label="Tindakan lain">
          <p className={css.plLegend}>Tindakan lain</p>
          <div className={css.plActions}>
            {list.welcomeReady && <ConsoleButton icon={<Zap size={18} aria-hidden />} disabled={!!busy} aria-expanded={!!take} onClick={() => setEditing({ ...editing, take: take ? null : { minutes: 15, screenIds: [] } })}>Tayangkan sekarang</ConsoleButton>}
            <ConsoleButton icon={open.active ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />} disabled={!!busy} onClick={() => void patch(open, { active: !open.active })}>{open.active ? "Sembunyikan" : "Tayangkan lagi"}</ConsoleButton>
            <ConsoleButton className={css.plDanger} icon={<Trash2 size={18} aria-hidden />} disabled={!!busy} onClick={() => void remove(open)}>Hapus</ConsoleButton>
          </div>
          {take && <div className={css.plTake} role="group" aria-label="Tayangkan sekarang">
            <p className={css.plHint}><strong>{nameOf(open)}</strong> tayang sendirian di TV yang dipilih, menggantikan daftar tayangan, lalu TV kembali ke daftar dengan sendirinya.{open.kind === "sambutan" && !list.welcomes.length ? " Hari ini tidak ada kunjungan terbit, jadi TV akan menulis belum ada yang ditayangkan." : ""}{list.takeover ? " Ini menggantikan tayangan yang sedang mengambil alih." : ""}</p>
            <div className={css.plField}>
              <label htmlFor={`lama-${open.id}`}>Lama</label>
              <select id={`lama-${open.id}`} value={take.minutes ?? ""} disabled={!!busy} onChange={event => setEditing({ ...editing, take: { ...take, minutes: event.target.value ? Number(event.target.value) : null } })}>
                {tvTakeoverMinutes.map(value => <option key={value} value={value}>{value} menit</option>)}
                <option value="">Sampai dihentikan</option>
              </select>
            </div>
            {list.screens.length > 0 && <div className={css.plScreens} role="group" aria-label="Ambil alih di TV">
              {list.screens.map(screen => <label key={screen.id} className={css.plCheck}>
                <input type="checkbox" checked={take.screenIds.includes(screen.id)} disabled={!!busy}
                  onChange={event => setEditing({ ...editing, take: { ...take, screenIds: event.target.checked ? [...take.screenIds, screen.id] : take.screenIds.filter(id => id !== screen.id) } })} />
                Hanya {screen.name}
              </label>)}
            </div>}
            <p className={css.plHint}>{take.screenIds.length === 0 ? "Semua TV." : "Hanya TV yang dicentang. TV lain tetap memutar daftar tayangan."}</p>
            <div className={css.plActions}>
              <ConsoleButton variant="primary" icon={<Zap size={18} aria-hidden />} disabled={!!busy} onClick={() => void takeOver(open, take)}>{busy === "ambil-alih" ? "Memulai…" : "Mulai tayangkan"}</ConsoleButton>
            </div>
          </div>}
        </div>
      </Sheet>
    </SheetError.Provider>}

    {/* Tambah tayangan: first what to add, in plain words; then that kind's own short form. */}
    {adding && <SheetError.Provider value={refused}>
      <Sheet title={adding === "pilih" ? "Tambah tayangan" : `Tambah ${adds.find(kind => kind.value === adding)!.label.toLowerCase()}`}
        subtitle={adding === "pilih" ? "Apa yang ingin ditampilkan di TV?" : undefined} busy={!!busy} onClose={closeAdd}
        onSubmit={adding === "tamu" ? () => void add("tamu", guest, () => { setGuest({ title: "", body: "" }); setAdding(null); })
          : adding === "ultah" ? () => void addBirthday()
          : adding === "teks" ? () => void add("teks", text, () => { setText({ title: "", body: "" }); setAdding(null); })
          : adding === "video" ? () => { if (youtubeId(clip.body)) void add("video", clip, () => { setClip({ title: "", body: "" }); setAdding(null); }); }
          : undefined}
        footer={<>
          {adding !== "pilih" && <ConsoleButton className={css.plPush} icon={<ArrowLeft size={18} aria-hidden />} disabled={!!busy} onClick={() => { setMessage(null); setAdding("pilih"); }}>Jenis lain</ConsoleButton>}
          {(adding === "pilih" || adding === "template" || adding === "gambar") && <ConsoleButton disabled={!!busy} onClick={closeAdd}>Selesai</ConsoleButton>}
          {adding === "tamu" && <ConsoleButton type="submit" variant="primary" icon={<Plus size={18} aria-hidden />} disabled={!!busy || !guest.title.trim() || !list.welcomeReady}>{busy === "tambah-tamu" ? "Menambahkan…" : "Tambah sambutan"}</ConsoleButton>}
          {adding === "ultah" && <ConsoleButton type="submit" variant="primary" icon={<Plus size={18} aria-hidden />} disabled={!!busy || !bday.title.trim()}>{busy === "tambah-ultah" ? "Menambahkan…" : "Tambah ucapan"}</ConsoleButton>}
          {adding === "teks" && <ConsoleButton type="submit" variant="primary" icon={<Plus size={18} aria-hidden />} disabled={!!busy || (!text.title.trim() && !text.body.trim())}>{busy === "tambah-teks" ? "Menambahkan…" : "Tambah tulisan"}</ConsoleButton>}
          {adding === "video" && <ConsoleButton type="submit" variant="primary" icon={<Plus size={18} aria-hidden />} disabled={!!busy || !youtubeId(clip.body)}>{busy === "tambah-video" ? "Menambahkan…" : "Tambah video"}</ConsoleButton>}
        </>}>
        {!list.storageReady && (adding === "pilih" || adding === "gambar" || adding === "video") && <Notice tone="warning">Penyimpanan berkas belum disiapkan, jadi gambar dan berkas video belum bisa diunggah. Yang lain tetap bisa.</Notice>}

        {adding === "pilih" && <ul className={css.plKinds}>
          {adds.map(kind => {
            const Icon = kind.icon;
            return <li key={kind.value}>
              <button type="button" className={css.plKindTile} onClick={() => { setMessage(null); setAdding(kind.value); }}>
                <span className={css.plKind} aria-hidden="true"><Icon size={22} /></span>
                <span><strong>{kind.label}</strong><span>{kind.hint}</span></span>
                <ChevronRight size={20} aria-hidden />
              </button>
            </li>;
          })}
        </ul>}

        {adding === "template" && <div className={css.plPane}>
          <p className={css.plHint}>Isinya datang sendiri dari WAM dan Kunjungan Kantor. Tiap jenis cukup satu.</p>
          {missing.length === 0 ? <p className={css.plDone}>Semua sudah ada di daftar.</p>
            : <ul className={css.plTemplates}>{missing.map(kind => {
              const Icon = icons[kind];
              return <li key={kind} className={css.plTemplate}>
                <TvPreview className={css.plMini} kind={kind} />
                <div><strong><Icon size={16} aria-hidden />{tvItemKindLabels[kind]}</strong><p>{tvItemKindHints[kind]}</p></div>
                <ConsoleButton icon={<Plus size={18} aria-hidden />} disabled={!!busy || (kind === "sambutan" && !list.welcomeReady)} aria-label={`Tambah ${tvItemKindLabels[kind]}`} onClick={() => void add(kind)}>{busy === `tambah-${kind}` ? "Menambahkan…" : "Tambah"}</ConsoleButton>
              </li>;
            })}</ul>}
          {(missing.includes("pengumuman") || missing.includes("sambutan")) && <p className={css.plHint}>Alamat TV terbuka untuk siapa saja: pengumuman yang tayang hanya yang dikirim ke semua peserta, dan Sambutan tamu menampilkan nama tamu di TV.</p>}
        </div>}

        {adding === "tamu" && <div className={css.plPane}>
          <p className={css.plHint}>Untuk tamu tanpa halaman Kunjungan Kantor. Tanggal dan jam tayangnya diatur setelah ditambahkan.</p>
          <TvPreview className={css.plLive} kind="tamu" title={guest.title} body={guest.body} />
          <div className={css.plField}>
            <label htmlFor="tamu-nama">Nama tamu</label>
            <input id="tamu-nama" value={guest.title} maxLength={80} placeholder="Nama orang atau perusahaan" disabled={!!busy} onChange={event => setGuest(value => ({ ...value, title: event.target.value }))} />
          </div>
          <div className={css.plField}>
            <label htmlFor="tamu-ucapan">Ucapan (boleh kosong)</label>
            <textarea id="tamu-ucapan" rows={2} value={guest.body} maxLength={600} disabled={!!busy} onChange={event => setGuest(value => ({ ...value, body: event.target.value }))} />
          </div>
        </div>}

        {adding === "ultah" && <div className={css.plPane}>
          <p className={css.plHint}>Kartu ulang tahun Werkudara untuk satu orang. Tayang pada tanggal ulang tahunnya tahun ini.</p>
          <TvPreview className={css.plLive} kind="ultah" title={bday.title} body={bday.body} call={bday.call} date={bday.date} photo={bdayPhoto?.shown ?? ""} />
          <input ref={newPhotoInput} className={css.plFile} type="file" accept={ACCEPT} tabIndex={-1} aria-hidden="true"
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void pickBirthdayPhoto(file); }} />
          <div className={css.plSubmit}>
            <ConsoleButton icon={<ImageUp size={18} aria-hidden />} disabled={!!busy || !list.storageReady} onClick={() => newPhotoInput.current?.click()}>{busy === "foto-baru" ? "Memotong foto…" : bdayPhoto ? "Ganti foto" : "Pilih foto"}</ConsoleButton>
            <span className={css.plHint} aria-live="polite">{bdayPhoto?.note ?? "Foto setengah badan, tegak. Orangnya dipotong dari latarnya secara otomatis."}</span>
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
        </div>}

        {adding === "teks" && <div className={css.plPane}>
          <TvPreview className={css.plLive} kind="teks" title={text.title} body={text.body} />
          <div className={css.plField}>
            <label htmlFor="teks-judul">Judul</label>
            <input id="teks-judul" value={text.title} maxLength={80} placeholder="Misalnya Selamat datang" disabled={!!busy} onChange={event => setText(value => ({ ...value, title: event.target.value }))} />
          </div>
          <div className={css.plField}>
            <label htmlFor="teks-isi">Isi</label>
            <textarea id="teks-isi" rows={3} value={text.body} maxLength={600} disabled={!!busy} onChange={event => setText(value => ({ ...value, body: event.target.value }))} />
          </div>
        </div>}

        {adding === "video" && <div className={css.plPane}>
          <p className={css.plHint}>TV memutar video sampai selesai, lalu lanjut ke tayangan berikutnya. Suaranya dinyalakan setelah video ditambahkan: buka videonya di daftar, lalu pilih Dengan suara.</p>
          <h3 className={css.plSub}><FileVideo size={16} aria-hidden />Dari berkas video</h3>
          <p className={css.plHint}>MP4 atau WebM, paling besar 200 MB. Cara ini juga jalan di TV lama.</p>
          <input ref={videoInput} className={css.plFile} type="file" accept={ACCEPT_VIDEO} tabIndex={-1} aria-hidden="true"
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadVideo(file); }} />
          <div className={css.plSubmit}>
            <ConsoleButton icon={<FileVideo size={18} aria-hidden />} disabled={!!busy || !list.storageReady} onClick={() => videoInput.current?.click()}>{busy === "unggah-video" ? "Mengunggah…" : "Unggah berkas video"}</ConsoleButton>
          </div>
          {busy === "unggah-video" && progress && <p className={css.plHint} aria-live="polite">{progress}</p>}
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
        </div>}

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
      </Sheet>
    </SheetError.Provider>}
  </>;
}
