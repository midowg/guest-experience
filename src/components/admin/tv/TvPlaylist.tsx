"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, CalendarDays, CalendarRange, DoorOpen, ExternalLink, Eye, EyeOff, ImageUp, ListOrdered, Megaphone, Pencil, Plus, Square, Trash2, Type, UserRound, X, Zap } from "lucide-react";
import { Notice } from "@/components/ui";
import { ConsoleButton, ConsoleButtonLink, PageHeader, Pill, SectionToolbar, SegmentedControl, type Crumb } from "@/components/console";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import { uploadSlide } from "@/components/admin/wam/PraWamTv";
import akun from "@/components/admin/wam/akun/akun.module.css";
import { clockLabel, wibTime } from "@/lib/pra-wam/appraisal";
import { isTemplateKind, scheduleLabel, tvItemKindHints, tvItemKindLabels, tvLimits, tvTakeoverMinutes, tvTemplateKinds, type TvItemKind } from "@/lib/pra-wam/tv";
import { praWamTvApi, tvAdminPath } from "@/lib/routes";
import type { TvAdmin, TvAdminItem } from "@/lib/server/pra-wam/tv";
import css from "./tv-playlist.module.css";

const ACCEPT = "image/jpeg,image/png,image/webp";
const SECONDS = [5, 8, 10, 15, 20, 30, 45, 60];
const icons: Record<TvItemKind, typeof Type> = { kalender_hari: CalendarDays, kalender_minggu: CalendarRange, timeline: ListOrdered, pengumuman: Megaphone, sambutan: DoorOpen, tamu: UserRound, teks: Type, gambar: ImageUp };
/** The kinds whose words the admin types: a title (a guest's name for a typed welcome) and what it says. */
const isTyped = (kind: TvItemKind) => kind === "teks" || kind === "tamu";
/** Where a row's content comes from, for the line under its name. */
const sourceOf = (kind: TvItemKind) => kind === "sambutan" ? "Dari Kunjungan Kantor" : isTemplateKind(kind) ? "Dari WAM" : kind === "tamu" ? "Sambutan tamu" : tvItemKindLabels[kind];
type Draft = { title: string; body: string; showFrom: string; showUntil: string; timeFrom: string; timeUntil: string; screenIds: string[] };
const draftOf = (item: TvAdminItem): Draft => ({
  title: item.title, body: item.body, showFrom: item.showFrom ?? "", showUntil: item.showUntil ?? "",
  timeFrom: item.timeFrom ?? "", timeUntil: item.timeUntil ?? "", screenIds: item.screenIds,
});
/** The four ways to add a row, one shown at a time. */
const adds = [{ value: "template", label: "Template" }, { value: "tamu", label: "Sambutan" }, { value: "teks", label: "Teks" }, { value: "gambar", label: "Gambar" }] as const;
type AddKind = (typeof adds)[number]["value"];

/**
 * Admin TV → Tayangan: the playlist. Every row is one thing a TV plays, in this order, over and
 * over: a template (the room calendars, Timeline, panitia's announcements, today's guests), a text,
 * a typed welcome, or a picture. The rows are one list: what a row is on the left, and on the right
 * its order, its duration and four tools with their names under them (Sekarang, Sembunyi or Tayang,
 * Ubah, Hapus). On a narrow screen the tools move under the row, in one even line. Ubah and
 * Sekarang open their form inside the row. Tambah tayangan is one card with a choice of four.
 */
export function TvPlaylist({ initial, crumbs, title }: { initial: TvAdmin; crumbs: readonly Crumb[]; title: string }) {
  const [list, setList] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [text, setText] = useState({ title: "", body: "" });
  const [guest, setGuest] = useState({ title: "", body: "" });
  /** The row whose "Tayangkan sekarang" is open, with what is picked in it (`minutes` null: until stopped). */
  const [taking, setTaking] = useState<{ id: string; minutes: number | null; screenIds: string[] } | null>(null);
  const [adding, setAdding] = useState<AddKind>("template");
  const [progress, setProgress] = useState("");
  const [confirm, confirmDialog] = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
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
  const add = (kind: TvItemKind, more: { title?: string; body?: string } = {}, after?: () => void) =>
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
      ...(isTyped(item.kind) || item.kind === "gambar" ? { title: draft.title } : {}),
      ...(isTyped(item.kind) ? { body: draft.body } : {}),
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

  const screenName = (id: string) => list.screens.find(screen => screen.id === id)?.name ?? null;
  const nameOf = (item: TvAdminItem) => isTyped(item.kind) || item.kind === "gambar" ? item.title || tvItemKindLabels[item.kind] : tvItemKindLabels[item.kind];
  const takeOver = (pick: NonNullable<typeof taking>) =>
    run("ambil-alih", praWamTvApi.takeover, { method: "POST", body: JSON.stringify({ itemId: pick.id, minutes: pick.minutes, screenIds: pick.screenIds }) }, () => setTaking(null));
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
        : <ol className={css.plList} aria-label="Tayangan, urut tayang">{items.map((item, index) => {
          const Icon = icons[item.kind];
          const name = nameOf(item);
          const take = taking?.id === item.id ? taking : null;
          const isTaking = list.takeover?.itemId === item.id;
          const when = scheduleLabel(item, screenName) || "Selalu, di semua TV";
          const note = item.kind === "sambutan" ? (list.welcomes.length ? `Hari ini: ${list.welcomes.join(", ")}` : "Tidak ada kunjungan terbit hari ini, jadi dilewati.")
            : isTyped(item.kind) ? item.body : "";
          const edit = editing?.id === item.id ? editing.draft : null;
          const change = (more: Partial<Draft>) => setEditing({ id: item.id, draft: { ...(edit ?? draftOf(item)), ...more } });
          const seconds = SECONDS.includes(item.seconds) ? SECONDS : [...SECONDS, item.seconds].sort((a, b) => a - b);
          const saving = busy === `baris-${item.id}`;
          return <li key={item.id} className={css.plRow} data-off={!item.active} data-open={!!edit || !!take}>
            <div className={css.plMain}>
              <span className={css.plOrder} aria-label={`Urutan ${index + 1}`}>{index + 1}</span>
              {item.kind === "gambar" && item.slideId
                // eslint-disable-next-line @next/next/no-img-element
                ? <img className={css.plThumb} src={praWamTvApi.slideImage(item.slideId)} alt="" loading="lazy" width={72} height={40} />
                : <span className={css.plKind} aria-hidden="true"><Icon size={22} /></span>}
              <div className={css.plText}>
                <p className={css.plName}>
                  <strong>{name}</strong>
                  {!item.active && <Pill tone="neutral">Disembunyikan</Pill>}
                  {isTaking && <Pill tone="warn">Mengambil alih</Pill>}
                </p>
                <p className={css.plMeta}>{sourceOf(item.kind)} · {when}</p>
                {note && !edit && <p className={`${css.plMeta} ${css.plNote}`}>{note}</p>}
              </div>
            </div>

            <div className={css.plTools}>
              <div className={css.plMove}>
                <button type="button" className={css.plStep} disabled={!!busy || index === 0} aria-label={`Naikkan ${name}`} title="Naikkan" onClick={() => void move(index, -1)}><ArrowUp size={18} aria-hidden /></button>
                <button type="button" className={css.plStep} disabled={!!busy || index === items.length - 1} aria-label={`Turunkan ${name}`} title="Turunkan" onClick={() => void move(index, 1)}><ArrowDown size={18} aria-hidden /></button>
                <select className={css.plSeconds} value={item.seconds} disabled={!!busy} aria-label={`Durasi ${name}`} title="Durasi tayang" onChange={event => void patch(item, { seconds: Number(event.target.value) })}>
                  {seconds.map(value => <option key={value} value={value}>{value} detik</option>)}
                </select>
              </div>
              <div className={css.plActs}>
                {list.welcomeReady && <button type="button" className={css.plAct} disabled={!!busy} aria-expanded={!!take} aria-label={`Tayangkan sekarang: ${name}`} title="Tayangkan sekarang"
                  onClick={() => { setEditing(null); setTaking(take ? null : { id: item.id, minutes: 15, screenIds: [] }); }}>{take ? <X size={18} aria-hidden /> : <Zap size={18} aria-hidden />}<span>{take ? "Tutup" : "Sekarang"}</span></button>}
                <button type="button" className={css.plAct} disabled={!!busy} aria-label={`${item.active ? "Sembunyikan" : "Tayangkan"} ${name}`} title={item.active ? "Sembunyikan dari TV" : "Tayangkan lagi"}
                  onClick={() => void patch(item, { active: !item.active })}>{item.active ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}<span>{item.active ? "Sembunyi" : "Tayang"}</span></button>
                <button type="button" className={css.plAct} disabled={!!busy} aria-expanded={!!edit} aria-label={`Ubah ${name}`} title="Ubah isi dan jadwal"
                  onClick={() => { setTaking(null); setEditing(edit ? null : { id: item.id, draft: draftOf(item) }); }}>{edit ? <X size={18} aria-hidden /> : <Pencil size={18} aria-hidden />}<span>{edit ? "Tutup" : "Ubah"}</span></button>
                <button type="button" className={`${css.plAct} ${css.plDanger}`} disabled={!!busy} aria-label={`Hapus ${name}`} title="Hapus" onClick={() => void remove(item)}><Trash2 size={18} aria-hidden /><span>Hapus</span></button>
              </div>
            </div>

            {take && <form className={css.plForm} onSubmit={event => { event.preventDefault(); void takeOver(take); }}>
              <h3>Tayangkan sekarang</h3>
              <p className={css.plHint}>{name} tayang sendirian di TV yang dipilih, menggantikan daftar tayangan, lalu TV kembali ke daftar dengan sendirinya.{item.kind === "sambutan" && !list.welcomes.length ? " Hari ini tidak ada kunjungan terbit, jadi TV akan menulis belum ada yang ditayangkan." : ""}</p>
              <div className={css.plFields}>
                <div className={css.plField}>
                  <label htmlFor={`lama-${item.id}`}>Lama</label>
                  <select id={`lama-${item.id}`} value={take.minutes ?? ""} disabled={!!busy} onChange={event => setTaking({ ...take, minutes: event.target.value ? Number(event.target.value) : null })}>
                    {tvTakeoverMinutes.map(value => <option key={value} value={value}>{value} menit</option>)}
                    <option value="">Sampai dihentikan</option>
                  </select>
                </div>
              </div>
              {list.screens.length > 0 && <fieldset className={css.plScreens} disabled={!!busy}>
                <legend>Di TV</legend>
                {list.screens.map(screen => <label key={screen.id} className={css.plCheck}>
                  <input type="checkbox" checked={take.screenIds.includes(screen.id)}
                    onChange={event => setTaking({ ...take, screenIds: event.target.checked ? [...take.screenIds, screen.id] : take.screenIds.filter(id => id !== screen.id) })} />
                  {screen.name}
                </label>)}
              </fieldset>}
              <p className={css.plHint}>{take.screenIds.length === 0 ? "Semua TV, termasuk alamat umum /tv." : "Hanya TV yang dicentang. TV lain dan alamat umum /tv tetap memutar daftar tayangan."}{list.takeover ? " Ini menggantikan tayangan yang sedang mengambil alih." : ""}</p>
              <div className={css.plSubmit}>
                <ConsoleButton type="submit" variant="primary" icon={<Zap size={18} aria-hidden />} disabled={!!busy}>{busy === "ambil-alih" ? "Memulai…" : "Mulai tayangkan"}</ConsoleButton>
                <ConsoleButton disabled={!!busy} onClick={() => setTaking(null)}>Batal</ConsoleButton>
              </div>
            </form>}

            {edit && <form className={css.plForm} onSubmit={event => { event.preventDefault(); void save(item, edit); }}>
              <h3>Ubah {name}</h3>
              {(isTyped(item.kind) || item.kind === "gambar") && <div className={css.plField}>
                <label htmlFor={`judul-${item.id}`}>{item.kind === "teks" ? "Judul" : item.kind === "tamu" ? "Nama tamu" : "Nama gambar"}</label>
                <input id={`judul-${item.id}`} value={edit.title} maxLength={80} disabled={!!busy} onChange={event => change({ title: event.target.value })} />
              </div>}
              {isTyped(item.kind) && <div className={css.plField}>
                <label htmlFor={`isi-${item.id}`}>{item.kind === "tamu" ? "Ucapan" : "Isi"}</label>
                <textarea id={`isi-${item.id}`} rows={3} value={edit.body} maxLength={600} disabled={!!busy} onChange={event => change({ body: event.target.value })} />
              </div>}
              <fieldset className={css.plGroup} disabled={!!busy}>
                <legend>Jadwal tayang</legend>
                <div className={css.plFields}>
                  <div className={css.plField}><label htmlFor={`dari-${item.id}`}>Mulai tanggal</label><input id={`dari-${item.id}`} type="date" value={edit.showFrom} onChange={event => change({ showFrom: event.target.value })} /></div>
                  <div className={css.plField}><label htmlFor={`sampai-${item.id}`}>Sampai tanggal</label><input id={`sampai-${item.id}`} type="date" value={edit.showUntil} min={edit.showFrom || undefined} onChange={event => change({ showUntil: event.target.value })} /></div>
                  <div className={css.plField}><label htmlFor={`jam-dari-${item.id}`}>Dari jam (WIB)</label><input id={`jam-dari-${item.id}`} type="time" value={edit.timeFrom} onChange={event => change({ timeFrom: event.target.value })} /></div>
                  <div className={css.plField}><label htmlFor={`jam-sampai-${item.id}`}>Sampai jam (WIB)</label><input id={`jam-sampai-${item.id}`} type="time" value={edit.timeUntil} onChange={event => change({ timeUntil: event.target.value })} /></div>
                </div>
                <p className={css.plHint}>Kosongkan untuk tayang tanpa batas. Di luar jadwalnya, tayangan dilewati dan muncul lagi dengan sendirinya.</p>
              </fieldset>
              <fieldset className={css.plScreens} disabled={!!busy}>
                <legend>Tayang di TV</legend>
                {list.screens.length === 0 ? <p className={css.plHint}>Belum ada TV beralamat sendiri, jadi tayangan ini untuk semua TV.</p>
                  : list.screens.map(screen => <label key={screen.id} className={css.plCheck}>
                    <input type="checkbox" checked={edit.screenIds.includes(screen.id)}
                      onChange={event => change({ screenIds: event.target.checked ? [...edit.screenIds, screen.id] : edit.screenIds.filter(id => id !== screen.id) })} />
                    {screen.name}
                  </label>)}
              </fieldset>
              {list.screens.length > 0 && <p className={css.plHint}>{edit.screenIds.length === 0 ? "Tidak ada yang dicentang: tayang di semua TV, termasuk alamat umum /tv." : "Hanya di TV yang dicentang. Alamat umum /tv tidak menayangkannya."}</p>}
              <div className={css.plSubmit}>
                <ConsoleButton type="submit" variant="primary" disabled={!!busy}>{saving ? "Menyimpan…" : "Simpan"}</ConsoleButton>
                <ConsoleButton disabled={!!busy} onClick={() => setEditing(null)}>Batal</ConsoleButton>
              </div>
            </form>}
          </li>;
        })}</ol>}
    </section>

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
                <span className={css.plKind} aria-hidden="true"><Icon size={22} /></span>
                <div><strong>{tvItemKindLabels[kind]}</strong><p>{tvItemKindHints[kind]}</p></div>
                <ConsoleButton icon={<Plus size={18} aria-hidden />} disabled={!!busy || (kind === "sambutan" && !list.welcomeReady)} aria-label={`Tambah ${tvItemKindLabels[kind]}`} onClick={() => void add(kind)}>{busy === `tambah-${kind}` ? "Menambahkan…" : "Tambah"}</ConsoleButton>
              </li>;
            })}</ul>}
          {(missing.includes("pengumuman") || missing.includes("sambutan")) && <p className={css.plHint}>Alamat TV terbuka: pengumuman yang tayang hanya yang dikirim ke semua peserta, dan Sambutan tamu menampilkan nama tamu di TV.</p>}
        </div>}

        {adding === "tamu" && <form className={css.plPane} onSubmit={event => { event.preventDefault(); void add("tamu", guest, () => setGuest({ title: "", body: "" })); }}>
          <p className={css.plHint}>Untuk tamu tanpa halaman Kunjungan Kantor. Tanggal dan jam tayangnya diatur lewat Ubah setelah ditambahkan.</p>
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

        {adding === "teks" && <form className={css.plPane} onSubmit={event => { event.preventDefault(); void add("teks", text, () => setText({ title: "", body: "" })); }}>
          <p className={css.plHint}>Tulisan besar di tengah layar: judul dan isi.</p>
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

        {adding === "gambar" && <div className={css.plPane}>
          <p className={css.plHint}>JPG, PNG, atau WebP; boleh beberapa sekaligus. Paling banyak {tvLimits.slides} gambar ({pictures} terpakai).</p>
          <input ref={fileInput} className={css.plFile} type="file" accept={ACCEPT} multiple tabIndex={-1} aria-hidden="true"
            onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ""; if (files.length) void upload(files); }} />
          <div className={css.plSubmit}>
            <ConsoleButton variant="primary" icon={<ImageUp size={18} aria-hidden />} disabled={!!busy || !list.storageReady || pictures >= tvLimits.slides} onClick={() => fileInput.current?.click()}>
              {busy === "unggah" ? "Mengunggah…" : "Unggah gambar"}
            </ConsoleButton>
          </div>
          {progress && <p className={css.plHint} aria-live="polite">{progress}</p>}
        </div>}
      </div>
    </section>
  </>;
}
