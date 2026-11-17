"use client";

import { useId, useState } from "react";
import { BookOpen, ExternalLink, FileText, ImagePlus, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { buttonClass, ConsoleButton, PageHeader, Pill, type Crumb } from "@/components/console";
import { Notice } from "@/components/ui";
import { AdminApiError, adminRequest } from "@/components/admin/shared/api";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { putFile, putProblem } from "@/components/pra-wam/photoUpload";
import { fileLabel, GUIDE_FILE_BYTES, GUIDE_FILE_TYPES, guideInputSchema, STARTER_GUIDES, type GuideFileMime, type GuideInput } from "@/lib/main-wam/admin/guides";
import { guideKindLabels } from "@/lib/main-wam/admin/labels";
import { GUIDE_KINDS, type GuideKind, type MwGuide } from "@/lib/main-wam/types";
import { mainWamAdminApi } from "@/lib/routes";
import { ContentTabs, described, Field, MessageLine, NumberInput, SwitchRow, useRun, Waiting, type Message, type Problems } from "./fields";
import { Sheet, SheetError } from "./Sheet";
import css from "./isi.module.css";

type Board = { guides: MwGuide[]; links: Record<string, string>; storage: boolean; id?: string };
type SheetState = { type: "edit"; guide: MwGuide | null } | null;

/** One file to a guide: the server agrees a key and size, the browser stores it, the server checks it. */
async function uploadGuideFile(guideId: string, file: File, onProgress: (share: number) => void): Promise<Board> {
  const mime = file.type as GuideFileMime;
  if (!(mime in GUIDE_FILE_TYPES)) throw new AdminApiError("Pilih gambar (WebP, JPG, PNG) atau PDF.");
  if (file.size > GUIDE_FILE_BYTES) throw new AdminApiError("Berkas lebih dari 25 MB. Perkecil dulu, lalu unggah lagi.");
  const agreed = { guideId, mime, size: file.size };
  const start = await adminRequest<{ key: string; uploadUrl: string; token: string }>(mainWamAdminApi.guideFileStart, { method: "POST", body: JSON.stringify(agreed) });
  const problem = putProblem(await putFile(start.data!.uploadUrl, file, mime, onProgress));
  if (problem) throw new AdminApiError(problem);
  const done = await adminRequest<Board>(mainWamAdminApi.guideFileConfirm, { method: "POST", body: JSON.stringify({ ...agreed, key: start.data!.key, token: start.data!.token }) });
  return done.data!;
}

/**
 * Admin WAM → Main WAM → Panduan (agen E): Denah, Hotel & fasilitas, Dress code, Tata tertib and
 * more for Saya → Panduan: a title, short text, an image or PDF in private storage, an order, and
 * published or not. The four the handbook expects can be started in one click.
 */
export function GuidesEditor({ initial, migrated, crumbs, title }: { initial: Board; migrated: boolean; crumbs: readonly Crumb[]; title: string }) {
  const [board, setBoard] = useState(initial);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [message, setMessage] = useState<Message>(null);
  const { busy, run } = useRun(setMessage);
  const [confirm, confirmDialog] = useConfirm();
  const guides = [...board.guides].sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title, "id"));
  const send = async (url: string, method: string, body?: unknown) => adminRequest<Board>(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const apply = (answer: Board) => setBoard(current => ({ ...current, guides: answer.guides, links: answer.links, storage: answer.storage }));

  async function remove(guide: MwGuide) {
    if (!(await confirm({ title: `Hapus ${guide.title}?`, body: guide.file ? "Panduan dan berkasnya dihapus. Tombol Denah di sesi yang memakainya ikut hilang." : "Panduan ini dihapus dari aplikasi peserta.", confirmLabel: "Hapus panduan", danger: true }))) return;
    await run(`hapus-${guide.id}`, async () => { const result = await send(mainWamAdminApi.guide(guide.id), "DELETE"); apply(result.data!); return result.message; });
  }
  const starters = () => run("mulai", async () => {
    let last: Board | undefined;
    for (const [index, starter] of STARTER_GUIDES.entries()) {
      last = (await send(mainWamAdminApi.guides, "POST", { kind: starter.kind, title: starter.title, body: "", sort: index + 1, published: false })).data!;
    }
    if (last) apply(last);
    return "Empat panduan dibuat sebagai draf. Isi lalu terbitkan.";
  });

  return <SheetError.Provider value={message?.tone === "error" ? message.text : null}><div className={css.page}>
    <PageHeader crumbs={crumbs} title={title} subtitle="Isi Saya → Panduan di aplikasi peserta. Yang belum terbit hanya terlihat di sini."
      actions={<ConsoleButton variant="primary" icon={<Plus size={18} aria-hidden />} disabled={!migrated} onClick={() => setSheet({ type: "edit", guide: null })}>Tambah panduan</ConsoleButton>} />
    <ContentTabs current="panduan" />
    {!migrated && <Waiting what="Panduan" />}
    {migrated && !board.storage && <Notice tone="warning">Gambar dan PDF belum bisa diunggah karena penyimpanan berkas belum disiapkan. Teks tetap bisa diisi. Hubungi tim CoE.</Notice>}
    <MessageLine message={message} />

    {guides.length ? <ul className={css.grid} aria-label="Daftar panduan">
      {guides.map(guide => <li key={guide.id} className={`${css.item} ${guide.published ? "" : css.itemDraft}`}>
        <div className={css.itemHead}>
          <div>
            <h2 className={css.itemTitle}>{guide.title}</h2>
            <p className={css.itemSub}>{guideKindLabels[guide.kind]} · urutan {guide.sort}</p>
          </div>
          <div className={css.actions}>
            <button type="button" className={css.iconButton} onClick={() => setSheet({ type: "edit", guide })} disabled={busy !== null} aria-label={`Ubah ${guide.title}`} title="Ubah"><Pencil size={18} aria-hidden /></button>
            <button type="button" className={`${css.iconButton} ${css.iconDanger}`} onClick={() => void remove(guide)} disabled={busy !== null} aria-label={`Hapus ${guide.title}`} title="Hapus"><Trash2 size={18} aria-hidden /></button>
          </div>
        </div>
        {guide.body ? <p className={`${css.names} ${css.clamp} ${css.preLine}`}>{guide.body}</p> : <p className={css.small}>Belum ada isi.</p>}
        <div className={css.itemFoot}>
          <div className={css.chips}>
            {guide.published ? <Pill tone="ok">Terbit</Pill> : <Pill>Draf</Pill>}
            {guide.file && <Pill tone="blue">{fileLabel(guide.file)}</Pill>}
          </div>
          {guide.file && board.links[guide.id] && <a className={css.textButton} href={board.links[guide.id]} target="_blank" rel="noopener noreferrer">Lihat berkas<ExternalLink size={14} aria-hidden /><span className="sr-only"> (tab baru)</span></a>}
        </div>
      </li>)}
    </ul> : <div className={css.empty}>
      <BookOpen size={24} aria-hidden />
      <h2>{migrated ? "Belum ada panduan" : "Panduan belum bisa diisi"}</h2>
      <p>{migrated ? "Mulai dengan empat panduan yang dipakai peserta: Denah venue, Hotel & fasilitas, Dress code per hari, Tata tertib kegiatan." : "Halaman ini terbuka lagi setelah pembaruan sistem dijalankan."}</p>
      {migrated && <div className={css.emptyActions}>
        <ConsoleButton variant="primary" icon={<Sparkles size={18} aria-hidden />} disabled={busy !== null} onClick={() => void starters()}>{busy === "mulai" ? "Membuat…" : "Buat empat panduan"}</ConsoleButton>
        <ConsoleButton icon={<Plus size={18} aria-hidden />} onClick={() => setSheet({ type: "edit", guide: null })}>Tambah panduan</ConsoleButton>
      </div>}
    </div>}

    {sheet && <GuideSheet guide={sheet.guide} link={sheet.guide ? board.links[sheet.guide.id] : undefined} storage={board.storage} nextSort={guides.length ? Math.max(...guides.map(item => item.sort)) + 1 : 1}
      busy={busy} onClose={() => setSheet(null)}
      onSave={(input, removeFile) => run("simpan", async () => {
        if (sheet.guide) {
          const result = await send(mainWamAdminApi.guide(sheet.guide.id), "PUT", { ...input, removeFile });
          apply(result.data!);
          setSheet({ type: "edit", guide: result.data!.guides.find(item => item.id === sheet.guide!.id) ?? null });
          return result.message;
        }
        const result = await send(mainWamAdminApi.guides, "POST", input);
        apply(result.data!);
        // Stay open on the new guide, so its file can be added right away.
        setSheet({ type: "edit", guide: result.data!.guides.find(item => item.id === result.data!.id) ?? null });
        return `${result.message} Unggah berkasnya bila ada.`;
      })}
      onUpload={(guide, file, onProgress) => run("unggah", async () => {
        const answer = await uploadGuideFile(guide.id, file, onProgress);
        apply(answer);
        setSheet({ type: "edit", guide: answer.guides.find(item => item.id === guide.id) ?? guide });
        return "Berkas panduan tersimpan.";
      })} />}
    {confirmDialog}
  </div></SheetError.Provider>;
}

function GuideSheet({ guide, link, storage, nextSort, busy, onClose, onSave, onUpload }: {
  guide: MwGuide | null; link?: string; storage: boolean; nextSort: number; busy: string | null;
  onClose: () => void; onSave: (input: GuideInput, removeFile: boolean) => Promise<boolean>;
  onUpload: (guide: MwGuide, file: File, onProgress: (share: number) => void) => Promise<boolean>;
}) {
  const id = useId();
  const [draft, setDraft] = useState<GuideInput>(() => guide
    ? { kind: guide.kind, title: guide.title, body: guide.body, sort: guide.sort, published: guide.published }
    : { kind: "lain", title: "", body: "", sort: nextSort, published: false });
  const [problems, setProblems] = useState<Problems>({});
  const [progress, setProgress] = useState<number | null>(null);
  const [lastId, setLastId] = useState(guide?.id);
  if (lastId !== guide?.id) { setLastId(guide?.id); if (guide) setDraft({ kind: guide.kind, title: guide.title, body: guide.body, sort: guide.sort, published: guide.published }); }
  const set = (patch: Partial<GuideInput>) => { setDraft(current => ({ ...current, ...patch })); setProblems({}); };
  const saving = busy === "simpan";
  function submit(removeFile = false) {
    const checked = guideInputSchema.safeParse(draft);
    if (!checked.success) {
      const found: Problems = {};
      for (const issue of checked.error.issues) found[String(issue.path[0])] ??= issue.message;
      setProblems(found);
      return;
    }
    void onSave(checked.data, removeFile);
  }
  const image = guide?.file && guide.file.mime.startsWith("image/");
  return <Sheet title={guide ? "Ubah panduan" : "Tambah panduan"} subtitle={guide ? guide.title : "Simpan dulu, lalu unggah gambar atau PDF-nya."} busy={busy !== null} onClose={onClose} onSubmit={() => submit()}
    footer={<>
      <ConsoleButton disabled={busy !== null} onClick={onClose}>Tutup</ConsoleButton>
      <ConsoleButton type="submit" variant="primary" disabled={busy !== null}>{saving ? "Menyimpan…" : guide ? "Simpan" : "Tambah panduan"}</ConsoleButton>
    </>}>
    <Field id={`${id}-kind`} label="Jenis">
      <select className="select" id={`${id}-kind`} value={draft.kind} onChange={event => set({ kind: event.target.value as GuideKind })}>
        {GUIDE_KINDS.map(kind => <option key={kind} value={kind}>{guideKindLabels[kind]}</option>)}
      </select>
    </Field>
    <Field id={`${id}-title`} label="Judul" error={problems.title}>
      <input className="input" {...described(`${id}-title`, problems.title)} value={draft.title} maxLength={100} placeholder="mis. Denah venue" onChange={event => set({ title: event.target.value })} />
    </Field>
    <Field id={`${id}-body`} label="Isi singkat" optional hint={`${draft.body.length.toLocaleString("id-ID")} / 8.000 karakter. Teks biasa; tiap baris tampil sebagai baris.`} error={problems.body}>
      <textarea className="textarea" {...described(`${id}-body`, problems.body, true)} value={draft.body} maxLength={8000} rows={8} onChange={event => set({ body: event.target.value })} />
    </Field>
    <div className={css.pair}>
      <Field id={`${id}-sort`} label="Urutan" error={problems.sort}><NumberInput id={`${id}-sort`} integer value={draft.sort} onChange={sort => set({ sort: sort ?? 0 })} error={problems.sort} /></Field>
      <div className={css.field}><span className={css.label}>Tampil</span><SwitchRow title="Terbit" sub="Tampil di Saya → Panduan." checked={draft.published} onChange={published => set({ published })} /></div>
    </div>

    <section className={css.group} aria-labelledby={`${id}-file`}>
      <h3 id={`${id}-file`} className={css.label}>Berkas</h3>
      {!guide ? <p className={css.hint}>Berkas bisa diunggah setelah panduan disimpan.</p> : <div className={css.file}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a private file through a short-lived address */}
        {image && link ? <img className={css.thumb} src={link} alt={`Berkas ${guide.title}`} /> : <FileText size={28} aria-hidden />}
        <span className={css.fileName}>
          <strong>{guide.file ? fileLabel(guide.file) : "Belum ada berkas"}</strong>
          <small>{progress !== null && busy === "unggah" ? `Mengunggah ${Math.round(progress * 100)}%` : "Gambar (WebP, JPG, PNG) atau PDF, paling besar 25 MB."}</small>
        </span>
        {guide.file && link && <a className={css.textButton} href={link} target="_blank" rel="noopener noreferrer">Lihat<span className="sr-only"> berkas (tab baru)</span></a>}
        <label className={`${css.fileInput} ${buttonClass("secondary")}`} aria-disabled={!storage || busy !== null}>
          <ImagePlus size={16} aria-hidden />{busy === "unggah" ? "Mengunggah…" : guide.file ? "Ganti" : "Unggah"}
          <input type="file" accept="image/webp,image/png,image/jpeg,application/pdf" disabled={!storage || busy !== null} aria-label={`Unggah berkas ${guide.title}`}
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) { setProgress(0); void onUpload(guide, file, setProgress).finally(() => setProgress(null)); } }} />
        </label>
        {guide.file && <ConsoleButton disabled={busy !== null} icon={<Trash2 size={16} aria-hidden />} onClick={() => submit(true)}>Hapus berkas</ConsoleButton>}
      </div>}
    </section>
  </Sheet>;
}
