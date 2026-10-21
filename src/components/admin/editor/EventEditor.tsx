"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink, Field, Notice } from "@/components/ui";
import { CalendarCheck, ChevronRight, CircleAlert, CircleDashed, Pencil, X, CalendarClock, CircleCheck, CircleDot, ClipboardCheck, Eye, FileText, Handshake, Image as ImageIcon, Images, Languages, LayoutList, ListChecks, ListOrdered, MapPin, MessageSquare, Palette, Phone, Rocket, Save, Shirt, Sparkles, Star, Users, type LucideIcon } from "lucide-react";
import { Check, SuggestionChips } from "@/components/admin/editor/controls";
import { chipLabel, fieldExamples, fieldPattern, fieldSuggestions, fillSuggestion } from "@/components/admin/editor/suggestions";
import { formatDate, formatTime, fromZoneInput, toZoneInput } from "@/lib/format";
import { tzLabel, zoneOf } from "@/lib/timezones";
import { themeDefinition } from "@/lib/themes";
import type { EventRecord, SectionKey, StaffMember } from "@/lib/types";
import { eventSchema } from "@/lib/validation";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import { blockOfPath, blockStatusLabels, blockStatuses, blockSummary, completeSections, editorBlocks, editorStages, type BlockStatus, prepareEvent } from "@/components/admin/editor/editor-model";
import { AfterBlock, AppearanceBlock, DayBlock, ExperienceBlock, PrepareBlock } from "@/components/admin/editor/JourneyEditor";
import { TranslationBlock } from "@/components/admin/editor/TranslationEditor";
import { moduleActive, moduleBlocks, type AdminModule } from "@/lib/admin-modules";
import type { ControlOptions, EditorKit, BooleanKey, TextKey, TimeKey } from "@/components/admin/editor/kit";
import { AgendaBlock } from "@/components/admin/editor/blocks/AgendaBlock";
import { ContactBlock } from "@/components/admin/editor/blocks/ContactBlock";
import { FeedbackBlock } from "@/components/admin/editor/blocks/FeedbackBlock";
import { HeroBlock } from "@/components/admin/editor/blocks/HeroBlock";
import { IdentityBlock } from "@/components/admin/editor/blocks/IdentityBlock";
import { PublicationBlock } from "@/components/admin/editor/blocks/PublicationBlock";
import { ReviewBlock } from "@/components/admin/editor/blocks/ReviewBlock";
import { RsvpBlock } from "@/components/admin/editor/blocks/RsvpBlock";
import { ScheduleBlock } from "@/components/admin/editor/blocks/ScheduleBlock";
import { SectionsBlock } from "@/components/admin/editor/blocks/SectionsBlock";
import { TeamBlock } from "@/components/admin/editor/blocks/TeamBlock";
import { TopicsBlock } from "@/components/admin/editor/blocks/TopicsBlock";
import { VenueBlock } from "@/components/admin/editor/blocks/VenueBlock";
import { VenueGalleryBlock } from "@/components/admin/editor/blocks/VenueGalleryBlock";
import styles from "@/components/admin/admin.module.css";
import { adminApi, adminEventPath } from "@/lib/routes";


const blockIcons: Record<string, LucideIcon> = {
  identity: FileText, appearance: Palette, schedule: CalendarClock, hero: ImageIcon, topics: ListChecks, experience: Sparkles,
  agenda: ListOrdered, venue: MapPin, gallery: Images, prepare: Shirt, language: Languages, team: Users, rsvp: ClipboardCheck, contact: Phone, day: CalendarCheck,
  feedback_questions: MessageSquare, review: Star, after: Handshake, sections: LayoutList, publication: Rocket,
};

const statusIcons: Record<BlockStatus, LucideIcon> = { error: CircleAlert, dirty: CircleDot, todo: CircleAlert, optional: CircleDashed, done: CircleCheck };

/** What still blocks publishing, each line opening the block that fixes it. */
function Readiness({ blocks, statuses, onOpen }: { blocks: typeof editorBlocks; statuses: Record<string, BlockStatus>; onOpen: (id: string, from?: HTMLElement | null) => void }) {
  const todo = blocks.filter(item => statuses[item.id] === "todo" || statuses[item.id] === "error");
  const required = blocks.filter(item => statuses[item.id] !== "optional");
  const ready = required.length - todo.length;
  return <section className={styles.readiness} aria-labelledby="kesiapan-title">
    <div className={styles.readinessHead}><h2 id="kesiapan-title">Kesiapan tayang</h2><span>{ready} dari {required.length} siap</span></div>
    <div className={styles.readinessBar} aria-hidden="true"><span style={{ width: `${required.length ? Math.round(ready / required.length * 100) : 100}%` }} /></div>
    {todo.length ? <ul className={styles.readinessList}>{todo.map(item => <li key={item.id}><button type="button" onClick={e => onOpen(item.id, e.currentTarget)}><CircleAlert size={14} aria-hidden="true" /> {item.title}: perlu dilengkapi <ChevronRight size={14} aria-hidden="true" /></button></li>)}</ul>
      : <p className={styles.readinessDone}><CircleCheck size={14} aria-hidden="true" /> Semua bagian wajib sudah lengkap.</p>}
  </section>;
}

function PanelHeader({ open, titleRef, onClose }: { open: string | null; titleRef: React.RefObject<HTMLHeadingElement | null>; onClose: () => void }) {
  const meta = editorBlocks.find(item => item.id === open);
  const Icon = (open && blockIcons[open]) || FileText;
  return <header className={styles.panelHeader}>
    <span className={styles.blockIcon} aria-hidden="true"><Icon size={20} /></span>
    <div className={styles.panelHeading}><p className={styles.blockStage}>{editorStages.find(stage => stage.key === meta?.stage)?.label}</p><h2 id="panel-title" ref={titleRef} tabIndex={-1}>{meta?.title}</h2></div>
    <button type="button" className={styles.panelClose} onClick={onClose} aria-label="Tutup panel"><X size={18} aria-hidden="true" /></button>
  </header>;
}

/**
 * `disabledModules` comes from the super admin and is empty for them. A switched-off module
 * that this event does not use is not offered at all; one it already uses stays visible with a
 * note, may be switched off, and cannot come back (the server checks the same rule on save).
 */
export function EventEditor({ event: initialEvent, disabledModules = [], superAdmin = false, origin = "", staff = [] }: { event: EventRecord; disabledModules?: AdminModule[]; superAdmin?: boolean; origin?: string; staff?: StaffMember[] }) {
  const unavailable = (key: AdminModule) => disabledModules.includes(key) && !moduleActive(initialEvent, key);
  const restricted = (key: AdminModule) => disabledModules.includes(key) && moduleActive(initialEvent, key);
  // Kind, audience, and theme come from the template; only the super admin changes them (meeting of 20 Oct).
  const blocks = editorBlocks.filter(item => (superAdmin || item.id !== "appearance") && !(Object.entries(moduleBlocks) as [AdminModule, string][]).some(([key, id]) => id === item.id && unavailable(key)));
  const restrictedBlock = (id: string) => (Object.entries(moduleBlocks) as [AdminModule, string][]).some(([key, block]) => block === id && restricted(key));
  const sectionModule: Partial<Record<string, AdminModule>> = { experience: "experience", agenda: "agenda", location: "location", prepare: "prepare", team: "team", rsvp: "rsvp", contact: "contact", feedback: "feedback" };
  const sectionUnavailable = (key: string) => { const owner = sectionModule[key]; return !!owner && unavailable(owner); };
  const router = useRouter();
  const [event, setEvent] = useState(() => completeSections(initialEvent));
  const [embedDraft, setEmbedDraft] = useState(initialEvent.location_embed_url ?? "");
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  // The block whose form is open in the panel; every block stays mounted so a field is always focusable.
  const [open, setOpen] = useState<string | null>(null);
  const [dirtyBlocks, setDirtyBlocks] = useState<Set<string>>(() => new Set());
  const errorSummary = useRef<HTMLDivElement>(null);
  const panelTitle = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => { if (error) errorSummary.current?.focus(); }, [error, errors]);
  function update<K extends keyof EventRecord>(key: K, value: EventRecord[K]) {
    setEvent(current => ({ ...current, [key]: value })); setDirty(true); setMessage("");
    const owner = blockOfPath(String(key));
    setDirtyBlocks(current => current.has(owner) ? current : new Set(current).add(owner));
  }
  function openBlock(id: string, from?: HTMLElement | null) {
    returnFocus.current = from ?? (document.activeElement as HTMLElement | null);
    setOpen(id);
  }
  function closePanel() {
    setOpen(null);
    requestAnimationFrame(() => returnFocus.current?.focus?.());
  }
  /** Open the block that owns a field, then focus the field once it is visible. */
  function openField(key: string) {
    setOpen(blockOfPath(key));
    requestAnimationFrame(() => { const field = document.getElementById(key); field?.focus(); field?.scrollIntoView?.({ block: "center" }); });
  }
  useEffect(() => { if (open) requestAnimationFrame(() => panelTitle.current?.focus()); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(null); requestAnimationFrame(() => returnFocus.current?.focus?.()); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  // Whatever publishing would still reject marks a card "Perlu dilengkapi".
  const publishIssues = useMemo(() => {
    const parsed = eventSchema.safeParse({ ...prepareEvent(event), status: "published" });
    return parsed.success ? [] : parsed.error.issues.map(issue => issue.path.join("."));
  }, [event]);
  const statuses = blockStatuses(event, errors, dirtyBlocks, publishIssues);
  const themeName = themeDefinition(event.theme?.key ?? "werkudara").name;
  // A block for a module this event does not use waits under "Bagian lain", so the main list
  // shows only what the event actually has. Opening, editing, or an error keeps it in view.
  const blockModule = Object.fromEntries((Object.entries(moduleBlocks) as [AdminModule, string][]).map(([key, id]) => [id, key])) as Record<string, AdminModule>;
  const inUse = (id: string) => !blockModule[id] || moduleActive(event, blockModule[id]) || dirtyBlocks.has(id) || statuses[id] === "error" || statuses[id] === "todo";
  const mainBlocks = blocks.filter(item => inUse(item.id));
  const extraBlocks = blocks.filter(item => !inUse(item.id));
  const formatWhen = (iso: string) => `${formatDate(iso, event.timezone)}, ${formatTime(iso, event.timezone)}`;
  function described(name: string, hint?: string) { return [hint ? `${name}-hint` : "", errors[name] ? `${name}-error` : ""].filter(Boolean).join(" ") || undefined; }
  /** Chips and example sentences come from suggestions.ts by field name, so call sites stay short. */
  function control(name: string, label: string, value: string, onChange: (value: string) => void, options: ControlOptions = {}) {
    const pattern = fieldPattern(name);
    const placeholder = options.type === "datetime-local" ? undefined : fieldExamples[pattern];
    const suggestions = (options.suggestions ?? fieldSuggestions[pattern] ?? []).map(text => fillSuggestion(text, event.title));
    const props = { id: name, value, placeholder, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value), "aria-describedby": described(name, options.hint), "aria-invalid": !!errors[name], maxLength: options.maxLength };
    return <Field name={name} label={label} hint={options.hint} error={errors[name]?.join(" ")}>
      {options.multiline ? <textarea {...props} className="textarea" rows={4} /> : <input {...props} className="input" type={options.type || "text"} />}
      {suggestions.length > 0 && <SuggestionChips field={label} value={value} onPick={onChange} options={suggestions.map(text => ({ label: chipLabel(text), value: text }))} />}
    </Field>;
  }
  function text(key: TextKey, label: string, maxLength: number, multiline = false, hint?: string) {
    return control(key, label, event[key], value => update(key, value), { multiline, maxLength, hint, type: key.endsWith("_url") ? "url" : "text" });
  }
  function time(key: TimeKey, label: string, hint?: string) {
    return control(key, label, toZoneInput(event[key], event.timezone), value => update(key, fromZoneInput(value, event.timezone) || (key === "starts_at" ? "" : null)), { type: "datetime-local", hint });
  }
  const tz = tzLabel(event.timezone);
  /** Switching zone keeps the wall-clock times the admin typed (09.00 stays 09.00), so every instant moves. */
  function changeTimezone(next: string) {
    const from = event.timezone;
    const shift = (value: string | null) => value ? fromZoneInput(toZoneInput(value, from), next) : value;
    setEvent(current => ({
      ...current, timezone: zoneOf(next),
      starts_at: shift(current.starts_at) ?? "", ends_at: shift(current.ends_at), rsvp_closes_at: shift(current.rsvp_closes_at), feedback_opens_at: shift(current.feedback_opens_at),
      agenda: current.agenda.map(item => ({ ...item, starts_at: shift(item.starts_at) ?? "", ends_at: shift(item.ends_at) ?? "" })),
    }));
    setDirty(true); setMessage("");
    setDirtyBlocks(current => new Set(current).add("schedule").add("agenda"));
  }
  function toggle(key: BooleanKey, label: string) { return <Check label={label} checked={event[key]} onChange={value => update(key, value)} />; }
  /** Radios, not a select: every choice stays visible next to the preview it changes. */
  function choices<T extends string>(name: string, legend: string, options: { value: T; label: string }[], current: T, onPick: (value: T) => void, describe?: (value: T) => string | undefined) {
    const hintId = `${name}-hint`;
    const invalid = !!errors[name];
    return <fieldset className={styles.choiceSet} aria-describedby={described(name, "hint") ?? hintId} aria-invalid={invalid || undefined}>
      <legend>{legend}</legend>
      <p id={hintId} className="field-hint">{describe?.(current) ?? "Pilihan langsung terlihat pada pratinjau di bawah."}</p>
      <div className={styles.choiceRow}>{options.map((option, index) => <label key={option.value} className={styles.choice}>
        {/* The first radio carries the group id so the error summary can focus this group. */}
        <input id={index === 0 ? name : undefined} type="radio" name={name} value={option.value} checked={current === option.value} onChange={() => onPick(option.value)} />
        <span>{option.label}</span>
      </label>)}</div>
      {invalid && <p id={`${name}-error`} className="field-error">{errors[name].join(" ")}</p>}
    </fieldset>;
  }
  /**
   * A block's form, rendered only while its panel is open. Values live in `event`, not in the DOM,
   * so nothing is lost on close; openField() opens the owning block before it focuses a field.
   */
  const sectionOfBlock: Partial<Record<string, SectionKey>> = { experience: "experience", agenda: "agenda", venue: "location", prepare: "prepare", team: "team", rsvp: "rsvp", contact: "contact", feedback_questions: "feedback" };
  function showSection(key: SectionKey) {
    update("sections", event.sections.map(section => section.key === key ? { ...section, enabled: true } : section));
    if (key === "rsvp" && !event.rsvp_enabled) update("rsvp_enabled", true);
    if (key === "feedback" && !event.feedback_enabled) update("feedback_enabled", true);
  }
  function block(id: string, title: string, children: ReactNode) {
    if (open !== id) return null;
    const stage = editorBlocks.find(item => item.id === id)?.stage ?? "prep";
    return <section id={id} data-block={id} className={`${styles.block} ${styles[`stage_${stage}`]}`} aria-label={title}>
      {sectionOfBlock[id] && !restrictedBlock(id) && !event.sections.find(section => section.key === sectionOfBlock[id])?.enabled && <div className={styles.sectionSwitch}>
        <Check label="Tampilkan bagian ini di undangan" checked={false} onChange={() => showSection(sectionOfBlock[id]!)} />
        <p className="field-hint">Bagian ini belum tampil untuk tamu. Isi dulu, lalu nyalakan; atau nyalakan sekarang.</p>
      </div>}
      {restrictedBlock(id) && <Notice tone="warning">Modul ini dinonaktifkan oleh super admin. Acara ini sudah memakainya, jadi isinya tetap ada dan masih bisa diubah atau dimatikan, tetapi setelah dimatikan tidak bisa dinyalakan lagi.</Notice>}
      {children}
    </section>;
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (pending) return;
    setError(""); setErrors({}); setMessage("");
    const payload = prepareEvent(event);
    const parsed = eventSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) { const key = issue.path.join("."); (next[key] ||= []).push(issue.message); }
      setErrors(next); setError("Periksa isian berikut. Perubahan belum disimpan.");
      const first = Object.keys(next)[0];
      if (first) openField(first);
      return;
    }
    if (payload.status === "published" && !window.confirm("Simpan dan publikasikan perubahan ini? Undangan akan dapat dibuka oleh siapa pun yang memiliki tautannya.")) return;
    setPending(true);
    try {
      const result = await adminRequest<EventRecord>(adminApi(event.id), { method: "PUT", body: JSON.stringify(parsed.data) });
      if (!result.data) throw new Error("Missing saved event");
      setEvent(completeSections(result.data)); setEmbedDraft(result.data.location_embed_url ?? ""); setDirty(false); setDirtyBlocks(new Set()); setOpen(null); setMessage(result.message || "Perubahan tersimpan."); router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) { setError(errorMessage(err)); if (err instanceof AdminApiError) setErrors(err.fieldErrors || {}); }
    finally { setPending(false); }
  }
  function card(item: (typeof editorBlocks)[number]) {
    const Icon = blockIcons[item.id] ?? FileText;
    const status = statuses[item.id];
    const StatusIcon = statusIcons[status];
    return <li key={item.id} className={`${styles.card} ${open === item.id ? styles.cardOpen : ""}`.trimEnd()}>
      <span className={styles.cardIcon} aria-hidden="true"><Icon size={18} /></span>
      <div className={styles.cardText}>
        <h3>{item.title}</h3>
        <p>{blockSummary(item.id, event, themeName, formatWhen)}</p>
        <span className={`${styles.cardStatus} ${styles[`status_${status}`]}`}><StatusIcon size={12} aria-hidden="true" /> {blockStatusLabels[status]}</span>
      </div>
      <button type="button" className={styles.cardEdit} onClick={e => openBlock(item.id, e.currentTarget)} aria-label={`Ubah ${item.title}`}><Pencil size={14} aria-hidden="true" /> Ubah</button>
    </li>;
  }
  const kit: EditorKit = { event, update, errors, control, text, time, toggle, choices, tz, unavailable, sectionUnavailable, origin, staff };
  return <form className={styles.form} onSubmit={save} noValidate aria-busy={pending}>
    {error && <div ref={errorSummary} tabIndex={-1} className={styles.errorSummary}><Notice tone="error"><p>{error}</p>{Object.keys(errors).length > 0 && <ul>{Object.entries(errors).map(([key, values]) => <li key={key}><a href={`#${key}`} onClick={e => { e.preventDefault(); openField(key); }}>{editorBlocks.find(item => item.id === blockOfPath(key))?.title}: {values.join(" ")}</a></li>)}</ul>}</Notice></div>}
    {message && <Notice tone="success">{message}</Notice>}
    <div className={styles.editorLayout}>
    <nav className={styles.editorMenu} aria-label="Daftar isi editor">
      {editorStages.map(stage => <div key={stage.key} className={`${styles.menuGroup} ${styles[`stage_${stage.key}`]}`}>
        <p className={styles.menuStage}>{stage.label}</p>
        <ul>{mainBlocks.filter(item => item.stage === stage.key).map(item => {
          const Icon = blockIcons[item.id] ?? FileText;
          const status = statuses[item.id];
          return <li key={item.id}><button type="button" onClick={e => openBlock(item.id, e.currentTarget)} aria-current={open === item.id ? "true" : undefined}>
            <Icon size={16} aria-hidden="true" /><span>{item.title}</span>
            {(status === "todo" || status === "error" || status === "dirty") && <span className={`${styles.menuDot} ${styles[`dot_${status}`]}`} title={blockStatusLabels[status]} />}
          </button></li>;
        })}</ul>
      </div>)}
    </nav>
    <div className={styles.summary}>
      <nav className={styles.stageChips} aria-label="Pintasan tahap">{editorStages.map(stage => <a key={stage.key} href={`#tahap-${stage.key}`} className={styles[`stage_${stage.key}`]}>{stage.label}</a>)}</nav>
      <Readiness blocks={blocks} statuses={statuses} onOpen={openBlock} />
      {editorStages.map(stage => <section key={stage.key} id={`tahap-${stage.key}`} className={`${styles.stageGroup} ${styles[`stage_${stage.key}`]}`} aria-labelledby={`tahap-${stage.key}-title`}>
        <h2 id={`tahap-${stage.key}-title`} className={styles.stageTitle}>{stage.label}</h2>
        <ul className={styles.cards}>{mainBlocks.filter(item => item.stage === stage.key).map(card)}</ul>
      </section>)}
      {extraBlocks.length > 0 && <details className={styles.moreBlocks}>
        <summary>Bagian lain yang bisa ditambahkan ({extraBlocks.length})</summary>
        <p className="field-hint">Bagian ini belum dipakai acara ini. Buka salah satu untuk menambahkannya ke undangan.</p>
        <ul className={styles.cards}>{extraBlocks.map(card)}</ul>
      </details>}
    </div>
    </div>
    <div className={styles.panelLayer} hidden={!open}>
      <div className={styles.panelBackdrop} onClick={closePanel} aria-hidden="true" />
      <div className={`${styles.panel} ${styles[`stage_${editorBlocks.find(item => item.id === open)?.stage ?? "prep"}`]}`} role="dialog" aria-modal="true" aria-labelledby="panel-title">
        <PanelHeader open={open} titleRef={panelTitle} onClose={closePanel} />
    <fieldset disabled={pending} className={`${styles.fieldset} ${styles.panelBody}`}>
      {block("identity", "Identitas & undangan", <IdentityBlock kit={kit} />)}
      {block("appearance", "Jenis, audiens, dan tampilan", <AppearanceBlock event={event} update={update} />)}
      {block("schedule", "Waktu acara", <ScheduleBlock kit={kit} onTimezone={changeTimezone} />)}
      {block("hero", "Foto latar pembuka", <HeroBlock kit={kit} />)}
      {block("topics", "Topik pembahasan", <TopicsBlock kit={kit} />)}
      {block("experience", "Pengalaman kunjungan", <ExperienceBlock event={event} update={update} control={control} errors={errors} />)}
      {block("agenda", "Rundown", <AgendaBlock kit={kit} />)}
      {block("venue", "Lokasi", <VenueBlock kit={kit} embedDraft={embedDraft} onEmbedDraft={setEmbedDraft} />)}
      {block("gallery", "Galeri foto lokasi Werkudara", <VenueGalleryBlock kit={kit} />)}
      {block("prepare", "Persiapan tamu", <PrepareBlock event={event} update={update} control={control} />)}
      {block("team", "Our Team", <TeamBlock kit={kit} />)}
      {block("rsvp", "Penerimaan RSVP", <RsvpBlock kit={kit} />)}
      {block("contact", "Kontak", <ContactBlock kit={kit} />)}
      {block("day", "Hari H", <DayBlock event={event} update={update} control={control} />)}
      {block("feedback_questions", "Survei feedback", <FeedbackBlock kit={kit} />)}
      {block("review", "Ulasan Google (opsional)", <ReviewBlock kit={kit} />)}
      {block("after", "Setelah acara", <AfterBlock event={event} update={update} control={control} errors={errors} collaboration={!unavailable("collaboration")} />)}
      {block("language", "Bahasa & terjemahan", <TranslationBlock event={event} update={update} control={control} />)}
      {block("sections", "Urutan & tampilan bagian", <SectionsBlock kit={kit} />)}
      {block("publication", "Status & penyimpanan", <PublicationBlock kit={kit} />)}
    </fieldset>
        <footer className={styles.panelFooter}><Button type="button" onClick={closePanel}>Selesai</Button><span className="muted">Tersimpan setelah Anda menekan Simpan perubahan.</span></footer>
      </div>
    </div>
    <div className={styles.saveBar} role="region" aria-label="Simpan perubahan">
      <span className={`${styles.saveState} ${dirty ? styles.saveStateDirty : ""}`.trimEnd()}>{dirty ? <><CircleDot size={16} aria-hidden="true" /> {dirtyBlocks.size > 1 ? `${dirtyBlocks.size} bagian belum disimpan` : "Ada perubahan yang belum disimpan"}</> : <><CircleCheck size={16} aria-hidden="true" /> Semua perubahan tersimpan</>}</span>
      <div className={styles.actions}>
        <ButtonLink href={adminEventPath(event, "preview")} variant="secondary"><Eye size={17} aria-hidden="true" /> Preview</ButtonLink>
        <Button type="submit" disabled={pending}><Save size={17} aria-hidden="true" /> {pending ? "Menyimpan…" : event.status === "published" ? "Simpan & publikasikan" : "Simpan perubahan"}</Button>
      </div>
    </div>
  </form>;
}
