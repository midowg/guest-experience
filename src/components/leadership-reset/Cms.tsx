"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowDown, ArrowUp, ClipboardList, Copy, ExternalLink, Eye, KeyRound, LayoutDashboard, Lock, MessageCircle, Plus, RefreshCw, Save, Trash2, Undo2, UserRoundCheck,
} from "lucide-react";
import { Avatar, ConsoleButton, ConsoleButtonLink, ConsoleShell, ConsoleTheme, FilterChips, PageHeader, Pill, SearchField, SegmentedControl, StatCard, StatRow, type ConsoleNavGroup, type ConsoleTone } from "@/components/console";
import admin from "@/components/admin/admin.module.css";
import { errorMessage } from "@/components/admin/shared/api";
import { Panel } from "@/components/app-shell/Panel";
import { ToastProvider, useToast } from "@/components/app-shell/Toast";
import {
  AUDIENCES, audienceLabels, contentSchema, countByStatus, isoToWibInput, MAX_QUESTIONS, TARGET_STATUSES, targetLabels, wibInputToIso, wibInstantLabel,
  type CmsView, type FormState, type LrContent, type LrQuestion, type TargetStatus,
} from "@/lib/leadership-reset/form";
import { LEADERSHIP_RESET_SECTIONS, leadershipResetPath, type LeadershipResetSection } from "@/lib/routes";
import type { CmsApi } from "./api";
import css from "./cms.module.css";

/*
 * Refleksi Leader's small CMS (19 Nov 2026), opened by its secret link, no sign-in. Three places in
 * one client app (the frame stays, only the content changes): Ringkasan (open or closed, the link to
 * share, who has answered), Isi form (text and questions, one Simpan), and Akses (the coach's link,
 * and a new CMS link). It never shows what a leader wrote: that is for the coach only.
 */

const labels: Record<LeadershipResetSection, string> = { ringkasan: "Ringkasan", isi: "Isi form", coach: "Akses Coach" };
const stateLook: Record<FormState, { tone: ConsoleTone; label: string }> = {
  open: { tone: "ok", label: "Dibuka" }, closed: { tone: "neutral", label: "Ditutup" }, past: { tone: "warn", label: "Lewat tenggat" },
};
const statusTone: Record<TargetStatus, ConsoleTone> = { tercapai: "ok", sebagian: "warn", belum: "purple" };
const sectionOf = (value: string | null): LeadershipResetSection => (LEADERSHIP_RESET_SECTIONS as readonly string[]).includes(value ?? "") ? value as LeadershipResetSection : "ringkasan";

async function copyText(value: string) { try { await navigator.clipboard.writeText(value); return true; } catch { return false; } }

/** The invitation as the committee posts it in WhatsApp, with the form's link. */
function inviteText(content: LrContent, link: string) {
  return [
    `Menjelang Training *${content.title}*${content.tagline ? ` – "${content.tagline}"` : ""} bersama ${content.coach}, kami mengajak seluruh Leaders meluangkan waktu sejenak untuk refleksi diri.`,
    "",
    `Isi di sini (± 5 menit): ${link}`,
    ...(content.deadline ? [`Batas pengisian: ${wibInstantLabel(content.deadline)}`] : []),
    "",
    "Jawab secara jujur dan terbuka berdasarkan pengalaman masing-masing. Setelah mengirim, simpan salinan jawabannya untuk bahan diskusi saat training.",
    ...(content.closing ? ["", content.closing] : []),
  ].join("\n");
}

export function Cms(props: { cmsKey: string; initial: CmsView; api: CmsApi; hrefOf?: (section: LeadershipResetSection) => string; preview?: boolean }) {
  return <ToastProvider><CmsApp {...props} /></ToastProvider>;
}

function CmsApp({ cmsKey, initial, api, hrefOf: givenHref, preview = false }: { cmsKey: string; initial: CmsView; api: CmsApi; hrefOf?: (section: LeadershipResetSection) => string; preview?: boolean }) {
  const hrefOf = useMemo(() => givenHref ?? ((section: LeadershipResetSection) => leadershipResetPath.cms(cmsKey, section)), [givenHref, cmsKey]);
  const params = useSearchParams();
  const section = sectionOf(params.get("bagian"));
  const [view, setView] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();
  const [origin, setOrigin] = useState("");
  useEffect(() => { queueMicrotask(() => setOrigin(window.location.origin)); }, []);

  const refresh = useCallback(async (quiet = true) => {
    setRefreshing(true);
    try { setView(await api.view()); } catch (error) { if (!quiet) toast({ message: errorMessage(error), tone: "bad" }); }
    finally { setRefreshing(false); }
  }, [api, toast]);

  // New answers show up on their own: when the tab comes back, and every half minute while it is in view.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 30_000);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.clearInterval(timer); };
  }, [refresh]);

  // The menu moves without a page load.
  useEffect(() => {
    const targets = new Map(LEADERSHIP_RESET_SECTIONS.map(key => [new URL(hrefOf(key), window.location.href).href, key]));
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target) return;
      const target = targets.get(new URL(anchor.href, window.location.href).href);
      if (!target) return;
      event.preventDefault();
      window.history.pushState(null, "", hrefOf(target));
      window.scrollTo({ top: 0 });
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [hrefOf]);

  useEffect(() => { document.title = `${labels[section]} · Refleksi Leader`; }, [section]);

  const nav: ConsoleNavGroup[] = [{ label: "Refleksi Leader", items: [
    { key: "ringkasan", label: labels.ringkasan, href: hrefOf("ringkasan"), icon: <LayoutDashboard size={20} />, ...(view.responses.length ? { badge: String(view.responses.length), badgeLabel: "jawaban" } : {}) },
    { key: "isi", label: labels.isi, href: hrefOf("isi"), icon: <ClipboardList size={20} /> },
    { key: "coach", label: labels.coach, href: hrefOf("coach"), icon: <KeyRound size={20} /> },
  ] }];
  const formLink = `${origin}${leadershipResetPath.home}`;

  return <ConsoleShell theme="admin" area="Refleksi Leader" storageKey="refleksi-cms" className={admin.shell}
    person={{ name: "Panitia", sub: view.content.title }} groups={nav} current={section} pageTitle={labels[section]}
    footerLinks={[{ key: "form", label: "Buka form Leader", href: leadershipResetPath.home, icon: <Eye size={20} />, external: true }]}>
    {preview && <p className={css.preview} role="note">Pratinjau dengan data contoh: tidak ada yang disimpan.</p>}
    <div key={section} className={css.view}>
      {section === "ringkasan" && <Overview view={view} formLink={formLink} refreshing={refreshing} onRefresh={() => refresh(false)} api={api} onView={setView} />}
      {section === "isi" && <Editor view={view} api={api} onView={setView} />}
      {section === "coach" && <Access view={view} api={api} onView={setView} origin={origin} cmsKey={cmsKey} preview={preview} />}
    </div>
  </ConsoleShell>;
}

/* --- Ringkasan --- */

function Overview({ view, formLink, refreshing, onRefresh, api, onView }: { view: CmsView; formLink: string; refreshing: boolean; onRefresh: () => void; api: CmsApi; onView: (view: CmsView) => void }) {
  const toast = useToast();
  const [filter, setFilter] = useState<TargetStatus | "semua">("semua");
  const [query, setQuery] = useState("");
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState<CmsView["responses"][number] | null>(null);
  const [busy, setBusy] = useState(false);
  const counts = countByStatus(view.responses);
  const look = stateLook[view.state];
  const q = query.trim().toLowerCase();
  const rows = view.responses.filter(row => (filter === "semua" || row.targetStatus === filter) && (!q || `${row.name} ${row.team}`.toLowerCase().includes(q)));

  async function toggleOpen() {
    setToggling(true);
    try {
      const result = await api.saveForm({ content: view.content, isOpen: !view.isOpen });
      onView(result.view);
      toast({ message: result.view.isOpen ? "Form dibuka. Leader bisa mengisi lagi." : "Form ditutup. Jawaban baru tidak diterima.", tone: "ok" });
    } catch (error) { toast({ message: errorMessage(error), tone: "bad" }); }
    finally { setToggling(false); }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try { onView(await api.deleteResponse(deleting.id)); toast({ message: `Jawaban ${deleting.name} dihapus.`, tone: "ok" }); setDeleting(null); }
    catch (error) { toast({ message: errorMessage(error), tone: "bad" }); }
    finally { setBusy(false); }
  }
  const copy = async (text: string, done: string) => toast(await copyText(text) ? { message: done, tone: "ok" } : { message: "Belum bisa menyalin. Salin manual dari kotak tautan.", tone: "bad" });

  return <>
    <PageHeader title="Ringkasan" subtitle={`${view.content.title}${view.content.tagline ? ` – ${view.content.tagline}` : ""} · ${view.content.coach}`}
      actions={<ConsoleButton icon={<RefreshCw size={18} aria-hidden="true" className={refreshing ? css.spin : undefined} />} onClick={onRefresh} disabled={refreshing}>Muat ulang</ConsoleButton>} />

    <div className={css.topGrid}>
      <section className={css.panel} aria-labelledby="lr-state">
        <div className={css.panelHead}>
          <h2 id="lr-state">Status form</h2>
          <Pill tone={look.tone}>{look.label}</Pill>
        </div>
        <p className={css.muted}>
          {view.state === "open" ? "Leader bisa mengisi dan mengubah jawabannya." : view.state === "past" ? "Tenggat sudah lewat, jadi form tidak menerima jawaban. Ubah tenggat di Isi form untuk membukanya lagi." : "Leader melihat pesan bahwa form sedang ditutup."}
          {view.content.deadline && view.state === "open" && <> Tenggat: <strong>{wibInstantLabel(view.content.deadline)}</strong>.</>}
        </p>
        <ConsoleButton variant={view.isOpen ? "secondary" : "primary"} onClick={toggleOpen} disabled={toggling || !view.migrated}>
          {toggling ? "Menyimpan…" : view.isOpen ? "Tutup form" : "Buka form"}
        </ConsoleButton>
      </section>

      <section className={css.panel} aria-labelledby="lr-share">
        <div className={css.panelHead}><h2 id="lr-share">Tautan untuk Leader</h2></div>
        <div className={css.linkBox}><input readOnly value={formLink} aria-label="Tautan form" onFocus={event => event.currentTarget.select()} /></div>
        <div className={css.buttons}>
          <ConsoleButton icon={<Copy size={18} aria-hidden="true" />} onClick={() => copy(formLink, "Tautan form tersalin.")}>Salin tautan</ConsoleButton>
          <ConsoleButton icon={<MessageCircle size={18} aria-hidden="true" />} onClick={() => copy(inviteText(view.content, formLink), "Pesan ajakan tersalin. Tempel di WhatsApp.")}>Salin pesan WhatsApp</ConsoleButton>
          <ConsoleButtonLink href={leadershipResetPath.home} target="_blank" rel="noopener" icon={<ExternalLink size={18} aria-hidden="true" />}>Buka</ConsoleButtonLink>
        </div>
      </section>
    </div>

    <StatRow label="Jawaban masuk">
      <StatCard label="Sudah mengisi" value={view.responses.length} icon={<UserRoundCheck size={20} aria-hidden="true" />} tone="blue" />
      {TARGET_STATUSES.map(status => <StatCard key={status} label={targetLabels[status]} value={counts[status]} tone={statusTone[status]} />)}
    </StatRow>

    <section className={css.panel} aria-labelledby="lr-list">
      <div className={css.panelHead}>
        <h2 id="lr-list">Sudah mengisi <span className={css.count}>{view.responses.length}</span></h2>
      </div>
      <p className={css.privacyNote}><Lock size={16} aria-hidden="true" /> Isi jawaban tidak tampil di sini. Hanya Coach yang membacanya, lewat tautan Coach.</p>
      {view.responses.length > 0 && <div className={css.toolbar}>
        <SearchField label="Cari nama atau tim" placeholder="Cari nama atau tim" value={query} onChange={setQuery} />
        <FilterChips label="Capaian target" value={filter} onChange={setFilter} chips={[
          { value: "semua", label: "Semua", count: view.responses.length },
          ...TARGET_STATUSES.map(status => ({ value: status, label: targetLabels[status], count: counts[status] })),
        ]} />
      </div>}
      {view.responses.length === 0
        ? <div className={css.empty}><strong>Belum ada yang mengisi</strong><p>Bagikan tautan form ke para Leader. Nama mereka muncul di sini begitu jawaban terkirim.</p></div>
        : rows.length === 0 ? <div className={css.empty}><strong>Tidak ada yang cocok</strong><p>Ubah pencarian atau filternya.</p></div>
          : <ul className={css.rows}>{rows.map(row => <li key={row.id} className={css.row}>
            <Avatar name={row.name} size={40} />
            <div className={css.rowText}><strong>{row.name}</strong><span>{row.team}</span></div>
            <Pill tone={statusTone[row.targetStatus]}>{targetLabels[row.targetStatus]}</Pill>
            <span className={css.rowTime} title={row.updatedAt !== row.createdAt ? `Diubah ${wibInstantLabel(row.updatedAt)}` : undefined}>{wibInstantLabel(row.createdAt)}{row.updatedAt !== row.createdAt ? " · diubah" : ""}</span>
            <button type="button" className={css.iconButton} onClick={() => setDeleting(row)} aria-label={`Hapus jawaban ${row.name}`}><Trash2 size={18} aria-hidden="true" /></button>
          </li>)}</ul>}
    </section>

    <ConsoleTheme theme="admin">
      <Panel open={!!deleting} onClose={() => !busy && setDeleting(null)} variant="sheet" title="Hapus jawaban?" locked={busy}
        footer={<div className={css.buttons}>
          <ConsoleButton onClick={() => setDeleting(null)} disabled={busy}>Batal</ConsoleButton>
          <ConsoleButton variant="primary" className={css.danger} icon={<Trash2 size={18} aria-hidden="true" />} onClick={remove} disabled={busy}>{busy ? "Menghapus…" : "Hapus permanen"}</ConsoleButton>
        </div>}>
        <p className={css.muted}>Jawaban <strong>{deleting?.name}</strong> ({deleting?.team}) dihapus permanen dan tidak bisa dikembalikan. Pakai ini untuk isian uji atau yang terkirim dua kali. Leader tersebut bisa mengisi ulang selama form dibuka.</p>
      </Panel>
    </ConsoleTheme>
  </>;
}

/* --- Isi form --- */

type Issues = Record<string, string>;
function issuesOf(content: LrContent): Issues {
  const result = contentSchema.safeParse(content);
  if (result.success) return {};
  const issues: Issues = {};
  for (const issue of result.error.issues) { const path = issue.path.join("."); issues[path] ??= issue.message; }
  return issues;
}
const newQuestionId = () => `q-${Math.random().toString(36).slice(2, 8)}`;

function Editor({ view, api, onView }: { view: CmsView; api: CmsApi; onView: (view: CmsView) => void }) {
  const toast = useToast();
  const [content, setContent] = useState<LrContent>(view.content);
  const [saving, setSaving] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [base, setBase] = useState(() => JSON.stringify(view.content));
  const dirty = JSON.stringify(content) !== base;
  const issues = useMemo(() => issuesOf(content), [content]);
  const issueList = Object.values(issues);

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (patch: Partial<LrContent>) => setContent(current => ({ ...current, ...patch }));
  const setQuestion = (index: number, patch: Partial<LrQuestion>) => setContent(current => ({ ...current, questions: current.questions.map((question, at) => at === index ? { ...question, ...patch } : question) }));
  const move = (index: number, by: -1 | 1) => setContent(current => {
    const questions = [...current.questions];
    const [item] = questions.splice(index, 1);
    questions.splice(index + by, 0, item);
    return { ...current, questions };
  });
  const removeQuestion = (index: number) => setContent(current => ({ ...current, questions: current.questions.filter((_, at) => at !== index) }));
  const addQuestion = () => setContent(current => ({ ...current, questions: [...current.questions, { id: newQuestionId(), label: "", hint: "", starters: [], for: "semua", required: false, enabled: true }] }));

  async function save() {
    if (issueList.length) { setShowIssues(true); toast({ message: "Periksa isian yang ditandai merah.", tone: "bad" }); return; }
    setSaving(true);
    try {
      const result = await api.saveForm({ content, isOpen: view.isOpen });
      onView(result.view);
      setBase(JSON.stringify(result.view.content));
      setContent(result.view.content);
      setShowIssues(false);
      toast({ message: result.message || "Form tersimpan.", tone: "ok" });
    } catch (error) { toast({ message: errorMessage(error), tone: "bad" }); }
    finally { setSaving(false); }
  }
  const issue = (path: string) => showIssues ? issues[path] : undefined;

  return <>
    <PageHeader title="Isi form" subtitle="Teks dan pertanyaan yang dilihat Leader. Perubahan berlaku setelah Simpan."
      actions={<ConsoleButtonLink href={leadershipResetPath.home} target="_blank" rel="noopener" icon={<Eye size={18} aria-hidden="true" />}>Lihat form</ConsoleButtonLink>} />
    {view.responses.length > 0 && <p className={css.notice} data-tone="blue">Sudah ada {view.responses.length} jawaban. Mengubah pertanyaan tidak mengubah jawaban yang sudah masuk: Coach melihat pertanyaan seperti saat dijawab.</p>}

    <section className={css.panel} aria-labelledby="lr-opening">
      <div className={css.panelHead}><h2 id="lr-opening">Pembuka</h2></div>
      <div className={css.grid2}>
        <Field label="Judul training" error={issue("title")}><input value={content.title} maxLength={80} onChange={event => set({ title: event.target.value })} /></Field>
        <Field label="Tagline" error={issue("tagline")}><input value={content.tagline} maxLength={120} onChange={event => set({ tagline: event.target.value })} /></Field>
        <Field label="Nama coach" error={issue("coach")}><input value={content.coach} maxLength={60} onChange={event => set({ coach: event.target.value })} /></Field>
        <Field label="Tanggal training" hint="Untuk hitung mundur di form." error={issue("trainingDate")}><input type="date" value={content.trainingDate ?? ""} onChange={event => set({ trainingDate: event.target.value || null })} /></Field>
        <Field label="Tenggat pengisian (WIB)" hint="Kosongkan bila tanpa tenggat. Setelah lewat, form menolak jawaban." error={issue("deadline")}>
          <input type="datetime-local" value={isoToWibInput(content.deadline)} onChange={event => set({ deadline: wibInputToIso(event.target.value) })} />
        </Field>
        <Field label="Catatan privasi" hint="Tampil di pembuka dan sebelum kirim." error={issue("privacy")}><input value={content.privacy} maxLength={300} onChange={event => set({ privacy: event.target.value })} /></Field>
      </div>
      <Field label="Teks pembuka" error={issue("intro")}><textarea rows={4} value={content.intro} maxLength={1200} onChange={event => set({ intro: event.target.value })} /></Field>
      <Field label="Kalimat penutup" error={issue("closing")}><input value={content.closing} maxLength={200} onChange={event => set({ closing: event.target.value })} /></Field>
    </section>

    <section className={css.panel} aria-labelledby="lr-status">
      <div className={css.panelHead}><h2 id="lr-status">Capaian target</h2></div>
      <Field label="Pertanyaan capaian target" hint={`Leader memilih satu: ${TARGET_STATUSES.map(status => targetLabels[status]).join(", ")}. "Sebagian" mendapat pertanyaan untuk keduanya.`} error={issue("statusQuestion")}>
        <input value={content.statusQuestion} maxLength={200} onChange={event => set({ statusQuestion: event.target.value })} />
      </Field>
    </section>

    <section className={css.panel} aria-labelledby="lr-questions">
      <div className={css.panelHead}>
        <h2 id="lr-questions">Pertanyaan refleksi <span className={css.count}>{content.questions.filter(question => question.enabled).length} aktif</span></h2>
        <ConsoleButton icon={<Plus size={18} aria-hidden="true" />} onClick={addQuestion} disabled={content.questions.length >= MAX_QUESTIONS}>Tambah</ConsoleButton>
      </div>
      {issue("questions") && <p className={css.fieldError} role="alert">{issue("questions")}</p>}
      <ol className={css.questions}>
        {content.questions.map((question, index) => <li key={question.id} className={css.questionCard} data-off={!question.enabled || undefined}>
          <div className={css.questionHead}>
            <span className={css.questionNumber}>{index + 1}</span>
            <SegmentedControl label="Untuk siapa" value={question.for} onChange={value => setQuestion(index, { for: value })}
              options={AUDIENCES.map(audience => ({ value: audience, label: audience === "semua" ? "Semua" : audience === "belum" ? "Belum tercapai" : "Sudah tercapai" }))} />
            <div className={css.questionTools}>
              <button type="button" className={css.iconButton} onClick={() => move(index, -1)} disabled={index === 0} aria-label="Naikkan"><ArrowUp size={18} aria-hidden="true" /></button>
              <button type="button" className={css.iconButton} onClick={() => move(index, 1)} disabled={index === content.questions.length - 1} aria-label="Turunkan"><ArrowDown size={18} aria-hidden="true" /></button>
              <button type="button" className={css.iconButton} onClick={() => removeQuestion(index)} disabled={content.questions.length <= 1} aria-label={`Hapus pertanyaan ${index + 1}`}><Trash2 size={18} aria-hidden="true" /></button>
            </div>
          </div>
          <Field label="Pertanyaan" error={issue(`questions.${index}.label`)}><textarea rows={2} value={question.label} maxLength={400} onChange={event => setQuestion(index, { label: event.target.value })} /></Field>
          <Field label="Petunjuk (opsional)" error={issue(`questions.${index}.hint`)}><textarea rows={2} value={question.hint} maxLength={400} onChange={event => setQuestion(index, { hint: event.target.value })} /></Field>
          <Field label="Pemicu kalimat" hint="Satu per baris, maks. 5. Leader mengetuknya untuk mulai menulis." error={issue(`questions.${index}.starters`) ?? issue(`questions.${index}.starters.0`)}>
            <StartersInput value={question.starters} onChange={starters => setQuestion(index, { starters })} />
          </Field>
          <div className={css.toggles}>
            <Toggle checked={question.enabled} onChange={enabled => setQuestion(index, { enabled })} label="Aktif" hint={question.enabled ? `Ditanyakan ke: ${audienceLabels[question.for]}${question.for !== "semua" ? " dan Sebagian" : ""}` : "Tidak ditanyakan"} />
            <Toggle checked={question.required} onChange={required => setQuestion(index, { required })} label="Wajib dijawab" />
          </div>
        </li>)}
      </ol>
    </section>

    <div className={css.saveBar} data-show={dirty || undefined} aria-hidden={!dirty}>
      <span>{showIssues && issueList.length ? `${issueList.length} isian perlu diperbaiki` : "Ada perubahan yang belum disimpan"}</span>
      <ConsoleButton icon={<Undo2 size={18} aria-hidden="true" />} onClick={() => { setContent(JSON.parse(base) as LrContent); setShowIssues(false); }} disabled={saving} tabIndex={dirty ? 0 : -1}>Batal</ConsoleButton>
      <ConsoleButton variant="primary" icon={<Save size={18} aria-hidden="true" />} onClick={save} disabled={saving} tabIndex={dirty ? 0 : -1}>{saving ? "Menyimpan…" : "Simpan"}</ConsoleButton>
    </div>
  </>;
}

/** The starters as lines: typing keeps empty lines until the field is left. */
function StartersInput({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const [text, setText] = useState(value.join("\n"));
  return <textarea rows={3} value={text} onChange={event => { setText(event.target.value); onChange(event.target.value.split("\n").map(line => line.trim()).filter(Boolean)); }}
    onBlur={() => setText(value.join("\n"))} />;
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className={css.field} data-error={error ? true : undefined}>
    <span className={css.fieldLabel}>{label}</span>
    {children}
    {error ? <span className={css.fieldError}>{error}</span> : hint ? <span className={css.fieldHint}>{hint}</span> : null}
  </label>;
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string }) {
  return <label className={css.toggle}>
    <input type="checkbox" role="switch" checked={checked} onChange={event => onChange(event.target.checked)} />
    <span className={css.switch} aria-hidden="true" />
    <span><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
  </label>;
}

/* --- Akses --- */

function Access({ view, api, onView, origin, cmsKey, preview }: { view: CmsView; api: CmsApi; onView: (view: CmsView) => void; origin: string; cmsKey: string; preview: boolean }) {
  const toast = useToast();
  const [coachLink, setCoachLink] = useState<string | null>(null);
  const [newCms, setNewCms] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"coach" | "cms" | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = async (text: string, done: string) => toast(await copyText(text) ? { message: done, tone: "ok" } : { message: "Belum bisa menyalin. Salin manual dari kotak tautan.", tone: "bad" });

  async function makeCoach() {
    setBusy(true);
    try {
      const result = await api.newCoachKey();
      onView(result.view);
      setCoachLink(`${origin}${leadershipResetPath.coach(result.coachKey)}`);
      setConfirm(null);
      toast({ message: "Tautan Coach dibuat. Salin dan kirim sekarang: tautan ini hanya tampil sekali.", tone: "ok" });
    } catch (error) { toast({ message: errorMessage(error), tone: "bad" }); }
    finally { setBusy(false); }
  }
  async function makeCms() {
    setBusy(true);
    try {
      const result = await api.newCmsKey();
      setNewCms(`${origin}${leadershipResetPath.cms(result.cmsKey)}`);
      setConfirm(null);
    } catch (error) { toast({ message: errorMessage(error), tone: "bad" }); }
    finally { setBusy(false); }
  }
  const coachMessage = (link: string) => `Halo ${view.content.coach}, berikut tautan untuk membaca refleksi para Leader sebelum training ${view.content.title}:\n${link}\n\nTautan ini khusus untuk Anda, mohon tidak dibagikan. Di halaman tersebut jawaban bisa dibaca, dicari, dan diunduh sebagai Excel.`;

  return <>
    <PageHeader title="Akses Coach" subtitle="Siapa yang bisa membaca jawaban, dan siapa yang bisa mengelola form." />

    <section className={css.panel} aria-labelledby="lr-coach">
      <div className={css.panelHead}>
        <h2 id="lr-coach">Tautan Coach</h2>
        <Pill tone={view.coach.linked ? "ok" : "neutral"}>{view.coach.linked ? "Aktif" : "Belum dibuat"}</Pill>
      </div>
      <p className={css.muted}>Hanya pemegang tautan ini yang bisa membaca isi jawaban: membaca, mencari, mencetak, dan mengunduh Excel. Kirim ke {view.content.coach} lewat chat pribadi.</p>
      {view.coach.linked && <dl className={css.facts}>
        <div><dt>Dibuat</dt><dd>{view.coach.createdAt ? wibInstantLabel(view.coach.createdAt) : "—"}</dd></div>
        <div><dt>Terakhir dibuka</dt><dd>{view.coach.seenAt ? wibInstantLabel(view.coach.seenAt) : "Belum pernah dibuka"}</dd></div>
      </dl>}
      {coachLink && <div className={css.reveal}>
        <p><strong>Tautan Coach baru.</strong> Hanya tampil sekali ini. Kalau hilang, buat yang baru.</p>
        <div className={css.linkBox}><input readOnly value={coachLink} aria-label="Tautan Coach" onFocus={event => event.currentTarget.select()} /></div>
        <div className={css.buttons}>
          <ConsoleButton variant="primary" icon={<Copy size={18} aria-hidden="true" />} onClick={() => copy(coachLink, "Tautan Coach tersalin.")}>Salin tautan</ConsoleButton>
          <ConsoleButton icon={<MessageCircle size={18} aria-hidden="true" />} onClick={() => copy(coachMessage(coachLink), "Pesan untuk Coach tersalin.")}>Salin pesan untuk Coach</ConsoleButton>
          <ConsoleButtonLink href={coachLink} target="_blank" rel="noopener" icon={<ExternalLink size={18} aria-hidden="true" />}>Buka</ConsoleButtonLink>
        </div>
      </div>}
      <ConsoleButton variant={view.coach.linked ? "secondary" : "primary"} icon={<KeyRound size={18} aria-hidden="true" />} onClick={() => view.coach.linked ? setConfirm("coach") : makeCoach()} disabled={busy || !view.migrated}>
        {busy && confirm !== "cms" ? "Membuat…" : view.coach.linked ? "Ganti tautan Coach" : "Buat tautan Coach"}
      </ConsoleButton>
    </section>

    <section className={css.panel} aria-labelledby="lr-cms">
      <div className={css.panelHead}><h2 id="lr-cms">Tautan CMS ini</h2></div>
      <p className={css.muted}>Siapa pun yang memegang tautan CMS bisa mengubah form, menutupnya, menghapus jawaban, dan membuat tautan Coach baru. Simpan di tempat aman. Kalau tersebar, ganti di sini: tautan lama langsung tidak berlaku.</p>
      {newCms && <div className={css.reveal}>
        <p><strong>Tautan CMS baru.</strong> Tautan yang sedang Anda pakai sudah tidak berlaku. Simpan yang ini sekarang.</p>
        <div className={css.linkBox}><input readOnly value={newCms} aria-label="Tautan CMS baru" onFocus={event => event.currentTarget.select()} /></div>
        <div className={css.buttons}>
          <ConsoleButton variant="primary" icon={<Copy size={18} aria-hidden="true" />} onClick={() => copy(newCms, "Tautan CMS tersalin.")}>Salin tautan</ConsoleButton>
          {!preview && <ConsoleButtonLink href={newCms} icon={<ExternalLink size={18} aria-hidden="true" />}>Pindah ke tautan baru</ConsoleButtonLink>}
        </div>
      </div>}
      {!newCms && <ConsoleButton icon={<RefreshCw size={18} aria-hidden="true" />} onClick={() => setConfirm("cms")} disabled={busy || !view.migrated}>Ganti tautan CMS</ConsoleButton>}
      <p className={css.fieldHint}>Tautan CMS sekarang berakhiran …{cmsKey.slice(-6)}.</p>
    </section>

    <ConsoleTheme theme="admin">
      <Panel open={confirm !== null} onClose={() => !busy && setConfirm(null)} variant="sheet" locked={busy}
        title={confirm === "cms" ? "Ganti tautan CMS?" : "Ganti tautan Coach?"}
        footer={<div className={css.buttons}>
          <ConsoleButton onClick={() => setConfirm(null)} disabled={busy}>Batal</ConsoleButton>
          <ConsoleButton variant="primary" onClick={confirm === "cms" ? makeCms : makeCoach} disabled={busy}>{busy ? "Membuat…" : "Ganti tautan"}</ConsoleButton>
        </div>}>
        <p className={css.muted}>{confirm === "cms"
          ? "Tautan CMS yang sedang dipakai langsung berhenti bekerja, termasuk di perangkat panitia lain. Tautan baru tampil sekali di halaman ini."
          : `Tautan lama yang dipegang ${view.content.coach} langsung berhenti bekerja. Kirim tautan baru setelah dibuat.`}</p>
      </Panel>
    </ConsoleTheme>
  </>;
}
