"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink, Field, Notice } from "@/components/ui";
import { ArrowUpRight, CalendarCheck, ChevronRight, CircleAlert, CircleDashed, Pencil, X, CalendarClock, CircleCheck, CircleDot, ClipboardCheck, Eye, FileText, Handshake, Image as ImageIcon, Images, Languages, LayoutList, ListChecks, ListOrdered, MapPin, MessageSquare, Palette, Phone, Rocket, Save, Shirt, Sparkles, Star, Trash2, Users, type LucideIcon } from "lucide-react";
import { Check, OrderButtons, SuggestionChips } from "./controls";
import { chipLabel, fieldExamples, fieldPattern, fieldSuggestions, fillSuggestion, WERKUDARA_OFFICE } from "./suggestions";
import { defaultFraming } from "@/lib/hero-framing";
import { HeroPreview } from "./HeroPreview";
import { formatDate, formatTime, fromZoneInput, toZoneInput } from "@/lib/format";
import { eventTimezones, timezoneInfo, tzLabel, zoneOf } from "@/lib/timezones";
import { themeDefinition } from "@/lib/themes";
import type { EventRecord, EventStatus, FeedbackQuestion } from "@/lib/types";
import { eventSchema } from "@/lib/validation";
import { AdminApiError, adminRequest, errorMessage } from "./api";
import { blockOfPath, blockStatusLabels, blockStatuses, blockSummary, completeSections, editorBlocks, editorStages, type BlockStatus, heroTextPositionHints, heroTextPositionOptions, hiddenSectionReasons, moveItem, photoGuidance, prepareEvent, sectionLabels } from "./editor-model";
import { PhotoField } from "./PhotoField";
import { AfterBlock, AppearanceBlock, DayBlock, ExperienceBlock, PrepareBlock, RouteFields } from "./JourneyEditor";
import { TranslationBlock } from "./TranslationEditor";
import styles from "./admin.module.css";

type TextKey = "title" | "slug" | "subtitle" | "organizer" | "greeting" | "introduction" | "closing" | "venue_name" | "address" | "location_url" | "arrival_notes" | "review_url" | "review_heading" | "review_description" | "review_button_label" | "feedback_description" | "venue_image_url" | "venue_image_alt" | "venue_image_credit";
type TimeKey = "starts_at" | "ends_at" | "rsvp_closes_at" | "feedback_opens_at";
type BooleanKey = "rsvp_enabled" | "feedback_enabled" | "review_enabled";

const blockIcons: Record<string, LucideIcon> = {
  identity: FileText, appearance: Palette, schedule: CalendarClock, hero: ImageIcon, topics: ListChecks, experience: Sparkles,
  agenda: ListOrdered, venue: MapPin, gallery: Images, prepare: Shirt, language: Languages, team: Users, rsvp: ClipboardCheck, contact: Phone, day: CalendarCheck,
  feedback_questions: MessageSquare, review: Star, after: Handshake, sections: LayoutList, publication: Rocket,
};

const statusIcons: Record<BlockStatus, LucideIcon> = { error: CircleAlert, dirty: CircleDot, todo: CircleAlert, optional: CircleDashed, done: CircleCheck };

/** What still blocks publishing, each line opening the block that fixes it. */
function Readiness({ statuses, onOpen }: { statuses: Record<string, BlockStatus>; onOpen: (id: string, from?: HTMLElement | null) => void }) {
  const todo = editorBlocks.filter(item => statuses[item.id] === "todo" || statuses[item.id] === "error");
  const required = editorBlocks.filter(item => statuses[item.id] !== "optional");
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

export function EventEditor({ event: initialEvent }: { event: EventRecord }) {
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
  const formatWhen = (iso: string) => `${formatDate(iso, event.timezone)}, ${formatTime(iso, event.timezone)}`;
  function described(name: string, hint?: string) { return [hint ? `${name}-hint` : "", errors[name] ? `${name}-error` : ""].filter(Boolean).join(" ") || undefined; }
  /** Chips and example sentences come from suggestions.ts by field name, so call sites stay short. */
  function control(name: string, label: string, value: string, onChange: (value: string) => void, options: { multiline?: boolean; hint?: string; type?: "text" | "url" | "datetime-local"; maxLength?: number; suggestions?: string[] } = {}) {
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
  function updateHero(patch: Partial<EventRecord["hero"]>) { update("hero", { ...event.hero, ...patch }); }
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
  function block(id: string, title: string, children: ReactNode) {
    if (open !== id) return null;
    const stage = editorBlocks.find(item => item.id === id)?.stage ?? "prep";
    return <section id={id} data-block={id} className={`${styles.block} ${styles[`stage_${stage}`]}`} aria-label={title}>{children}</section>;
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
      const result = await adminRequest<EventRecord>(`/api/admin/events/${event.id}`, { method: "PUT", body: JSON.stringify(parsed.data) });
      if (!result.data) throw new Error("Missing saved event");
      setEvent(completeSections(result.data)); setEmbedDraft(result.data.location_embed_url ?? ""); setDirty(false); setDirtyBlocks(new Set()); setOpen(null); setMessage(result.message || "Perubahan tersimpan."); router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) { setError(errorMessage(err)); if (err instanceof AdminApiError) setErrors(err.fieldErrors || {}); }
    finally { setPending(false); }
  }
  const hidden = hiddenSectionReasons(event);
  const photoHelp = <div className={styles.photoGuide}><h3>Panduan ukuran foto</h3><ul>{photoGuidance.map(line => <li key={line}>{line}</li>)}</ul></div>;
  return <form className={styles.form} onSubmit={save} noValidate aria-busy={pending}>
    {error && <div ref={errorSummary} tabIndex={-1} className={styles.errorSummary}><Notice tone="error"><p>{error}</p>{Object.keys(errors).length > 0 && <ul>{Object.entries(errors).map(([key, values]) => <li key={key}><a href={`#${key}`} onClick={e => { e.preventDefault(); openField(key); }}>{editorBlocks.find(item => item.id === blockOfPath(key))?.title}: {values.join(" ")}</a></li>)}</ul>}</Notice></div>}
    {message && <Notice tone="success">{message}</Notice>}
    <div className={styles.editorLayout}>
    <nav className={styles.editorMenu} aria-label="Daftar isi editor">
      {editorStages.map(stage => <div key={stage.key} className={`${styles.menuGroup} ${styles[`stage_${stage.key}`]}`}>
        <p className={styles.menuStage}>{stage.label}</p>
        <ul>{editorBlocks.filter(item => item.stage === stage.key).map(item => {
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
      <Readiness statuses={statuses} onOpen={openBlock} />
      {editorStages.map(stage => <section key={stage.key} id={`tahap-${stage.key}`} className={`${styles.stageGroup} ${styles[`stage_${stage.key}`]}`} aria-labelledby={`tahap-${stage.key}-title`}>
        <h2 id={`tahap-${stage.key}-title`} className={styles.stageTitle}>{stage.label}</h2>
        <ul className={styles.cards}>{editorBlocks.filter(item => item.stage === stage.key).map(item => {
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
        })}</ul>
      </section>)}
    </div>
    </div>
    <div className={styles.panelLayer} hidden={!open}>
      <div className={styles.panelBackdrop} onClick={closePanel} aria-hidden="true" />
      <div className={`${styles.panel} ${styles[`stage_${editorBlocks.find(item => item.id === open)?.stage ?? "prep"}`]}`} role="dialog" aria-modal="true" aria-labelledby="panel-title">
        <PanelHeader open={open} titleRef={panelTitle} onClose={closePanel} />
    <fieldset disabled={pending} className={`${styles.fieldset} ${styles.panelBody}`}>
      {block("identity", "Identitas & undangan", <div className="stack">
        {text("title", "Judul acara", 180)}{text("subtitle", "Subjudul", 250)}
        <div className={styles.grid}>{text("slug", "Alamat singkat undangan (slug)", 100, false, "Huruf kecil, angka, dan tanda hubung. Mengubah slug membuat tautan lama tidak berlaku.")}{text("organizer", "Penyelenggara", 250)}</div>
        {text("greeting", "Sapaan", 150)}{text("introduction", "Isi undangan", 5000, true)}{text("closing", "Penutup", 2000, true)}
        {choices("invitation_mode", "Cara mengundang", [{ value: "open", label: "Tautan umum" }, { value: "personal", label: "Tautan per tamu" }], event.invitation_mode, value => update("invitation_mode", value), value => value === "personal" ? "RSVP hanya lewat tautan per tamu; halaman umum tetap dapat dibaca." : "Formulir RSVP tersedia di halaman umum bila diaktifkan.")}
        {event.invitation_mode === "personal" && <Notice tone="warning">Panel admin belum memakai login. Siapa pun yang dapat membuka domain ini dapat melihat daftar tamu dan tautannya, serta menggunakan tautan untuk mengubah RSVP. Tautan personal bukan verifikasi identitas.</Notice>}
        <ButtonLink href={`/admin/events/${event.id}/invitations`} variant="secondary">Kelola undangan tamu</ButtonLink>
      </div>)}
      {block("appearance", "Jenis, audiens, dan tampilan", <AppearanceBlock event={event} update={update} />)}
      {block("schedule", "Waktu acara", <div className="stack">
        <Field name="timezone" label="Zona waktu" hint={timezoneInfo[zoneOf(event.timezone)].example}>
          <select id="timezone" className="input" value={zoneOf(event.timezone)} onChange={e => changeTimezone(e.target.value)} aria-describedby="timezone-hint">
            {eventTimezones.map(zone => <option key={zone} value={zone}>{timezoneInfo[zone].label} · {timezoneInfo[zone].name} (UTC{timezoneInfo[zone].offset})</option>)}
          </select>
        </Field>
        <div className={styles.grid}>{time("starts_at", `Mulai (${tz})`)}{time("ends_at", `Selesai (${tz})`, "Opsional bila waktu selesai belum ditentukan.")}</div>
        <p className="muted">Semua waktu acara, rundown, batas RSVP, dan survei memakai zona ini. Mengganti zona mempertahankan jam yang sudah diketik.</p>
      </div>)}
      {block("hero", "Foto latar pembuka", <div className="stack">
        <p>Foto latar adalah gambar pembuka undangan, dan satu-satunya foto yang memiliki pilihan posisi teks. Foto lokasi di galeri tidak memakai pilihan ini. Atur posisi dan zoom foto secara terpisah untuk HP dan desktop melalui pratinjau asli di bawah.</p>
        <PhotoField
          name="hero.url"
          label="Foto latar (opsional)"
          value={event.hero.url}
          srcset={event.hero.srcset}
          onChange={value => updateHero({ ...value, framing: defaultFraming() })}
          error={errors["hero.url"]?.join(" ")}
        />
        {choices("hero.text_position", "Posisi teks pembuka", heroTextPositionOptions, event.hero.text_position, text_position => updateHero({ text_position }), value => heroTextPositionHints[value])}
        {/* prepareEvent normally prevents this; a server-side field error still needs a focus target. */}
        {errors["hero.srcset"] && <p id="hero.srcset" tabIndex={-1} className="field-error">{errors["hero.srcset"].join(" ")}</p>}
        <HeroPreview event={event} onChange={updateHero} />
        {photoHelp}
      </div>)}
      {block("topics", "Topik pembahasan", <div className="stack">
        {!event.topics.length && <p>Belum ada topik. Tambahkan hanya materi yang telah disetujui.</p>}
        {event.topics.map((topic, index) => <div className={styles.item} key={index}>
          <div className={styles.itemHeader}><h3>Topik {index + 1}</h3><OrderButtons label={`topik ${index + 1}`} index={index} length={event.topics.length} onMove={direction => update("topics", moveItem(event.topics, index, direction))} /></div>
          {control(`topics.${index}.title`, "Judul topik", topic.title, value => update("topics", event.topics.map((item, i) => i === index ? { ...item, title: value } : item)), { maxLength: 200 })}
          {control(`topics.${index}.description`, "Penjelasan topik", topic.description, value => update("topics", event.topics.map((item, i) => i === index ? { ...item, description: value } : item)), { multiline: true, maxLength: 1500 })}
          <Button type="button" variant="danger" onClick={() => { if (window.confirm("Hapus topik ini dari draft editor?")) update("topics", event.topics.filter((_, i) => i !== index)); }}><Trash2 size={17} aria-hidden="true" /><span>Hapus topik {index + 1}</span></Button>
        </div>)}
        <Button type="button" variant="secondary" disabled={event.topics.length >= 20} onClick={() => update("topics", [...event.topics, { title: "", description: "" }])}>Tambah topik</Button>
      </div>)}
      {block("experience", "Pengalaman kunjungan", <ExperienceBlock event={event} update={update} control={control} errors={errors} />)}
      {block("agenda", "Rundown", <div className="stack">
        <p>Urutan tampilan mengikuti susunan di bawah. Waktu setiap sesi tetap perlu diperiksa.</p>
        {event.agenda.map((item, index) => {
          function change(key: "title" | "description" | "starts_at" | "ends_at", value: string) { update("agenda", event.agenda.map((entry, i) => i === index ? { ...entry, [key]: value } : entry)); }
          return <div className={styles.item} key={item.id}>
            <div className={styles.itemHeader}><h3>Sesi {index + 1}</h3><OrderButtons label={`sesi ${index + 1}`} index={index} length={event.agenda.length} onMove={direction => update("agenda", moveItem(event.agenda, index, direction))} /></div>
            {control(`agenda.${index}.title`, "Judul sesi", item.title, value => change("title", value), { maxLength: 200 })}
            <div className={styles.grid}>{control(`agenda.${index}.starts_at`, `Mulai sesi (${tz})`, toZoneInput(item.starts_at, event.timezone), value => change("starts_at", fromZoneInput(value, event.timezone) || ""), { type: "datetime-local" })}{control(`agenda.${index}.ends_at`, `Selesai sesi (${tz})`, toZoneInput(item.ends_at, event.timezone), value => change("ends_at", fromZoneInput(value, event.timezone) || ""), { type: "datetime-local" })}</div>
            {control(`agenda.${index}.description`, "Keterangan sesi", item.description, value => change("description", value), { multiline: true, maxLength: 1500 })}
            <Button type="button" variant="danger" onClick={() => { if (window.confirm("Hapus sesi ini dari draft editor?")) update("agenda", event.agenda.filter(entry => entry.id !== item.id)); }}><Trash2 size={17} aria-hidden="true" /><span>Hapus sesi {index + 1}</span></Button>
          </div>;
        })}
        {!event.agenda.length && <p>Rundown belum tersedia.</p>}
        <Button type="button" variant="secondary" disabled={event.agenda.length >= 100} onClick={() => update("agenda", [...event.agenda, { id: crypto.randomUUID(), starts_at: "", ends_at: "", title: "", description: "", sort_order: event.agenda.length }])}>Tambah sesi</Button>
      </div>)}
      {block("venue", "Lokasi", <div className="stack">
        {choices("location_display", "Tampilan lokasi", [{ value: "manual", label: "Alamat & tombol" }, { value: "embed", label: "Peta sematan Google" }], event.location_display, value => update("location_display", value), value => value === "embed" ? "Peta Google tampil tanpa kartu alamat dan tombol dari undangan. Google dapat tetap menampilkan informasi lokasinya sendiri." : "Nama tempat, alamat, petunjuk, dan tombol Maps tampil seperti semula.")}
        {event.location_display === "manual" ? <>
          {(event.venue_name !== WERKUDARA_OFFICE.venue_name || event.address !== WERKUDARA_OFFICE.address) && <div className={styles.chips}>
            <button type="button" className={styles.chip} onClick={() => { update("venue_name", WERKUDARA_OFFICE.venue_name); update("address", WERKUDARA_OFFICE.address); update("location_url", WERKUDARA_OFFICE.location_url); }}>
              <MapPin size={14} aria-hidden="true" /> Pakai alamat kantor Werkudara
            </button>
          </div>}
          {text("venue_name", "Nama tempat", 200)}{text("address", "Alamat", 1000, true)}{text("location_url", "Tautan lokasi Maps", 8000)}{text("arrival_notes", "Petunjuk kedatangan (opsional)", 2000, true)}
        </> : <div className="stack">
          <p>Buka Google Maps, pilih lokasinya, klik Bagikan (Share), pilih Sematkan peta (Embed a map), lalu Salin HTML dan tempel di sini.</p>
          {control("location_embed_url", "Kode sematan Google Maps", embedDraft, value => { setEmbedDraft(value); update("location_embed_url", value); }, { multiline: true, maxLength: 10000, hint: "Tempel kode iframe lengkap dari Google Maps atau URL sematannya. Yang disimpan hanya URL peta, bukan kode HTML." })}
        </div>}
        <RouteFields event={event} update={update} control={control} errors={errors} />
      </div>)}
      {block("gallery", "Galeri foto lokasi Werkudara", <div className="stack">
        <p>Foto-foto di sini tampil di bagian Lokasi, di bawah informasi alamat atau peta sematan. Satu foto ditampilkan diam; dua foto atau lebih bergantian otomatis dan dapat dihentikan tamu. Baris foto yang benar-benar kosong dilewati saat menyimpan; jika sudah diisi keterangannya, tambahkan foto dengan tautan HTTPS atau hapus baris tersebut.</p>
        {event.gallery.map((image, index) => <div className={styles.item} key={image.id}>
          <div className={styles.itemHeader}><h3>Foto lokasi {index + 1}</h3><OrderButtons label={`foto lokasi ${index + 1}`} index={index} length={event.gallery.length} onMove={direction => update("gallery", moveItem(event.gallery, index, direction))} /></div>
          <PhotoField name={`gallery.${index}.url`} label="Foto lokasi" value={image.url} srcset={image.srcset} onChange={value => update("gallery", event.gallery.map((item, i) => i === index ? { ...item, url: value.url, srcset: value.srcset } : item))} error={errors[`gallery.${index}.url`]?.join(" ")} />
          {control(`gallery.${index}.caption`, "Keterangan foto (opsional)", image.caption, value => update("gallery", event.gallery.map((item, i) => i === index ? { ...item, caption: value } : item)), { maxLength: 300, hint: "Tampil sebagai teks di bawah foto. Boleh dikosongkan." })}
          <Button type="button" variant="danger" onClick={() => { if (window.confirm("Hapus foto ini dari draft editor?")) update("gallery", event.gallery.filter((_, i) => i !== index)); }}><Trash2 size={17} aria-hidden="true" /><span>Hapus foto lokasi {index + 1}</span></Button>
        </div>)}
        {!event.gallery.length && <p>Belum ada foto lokasi. Undangan tetap tampil tanpa gambar.</p>}
        <Button type="button" variant="secondary" disabled={event.gallery.length >= 12} onClick={() => update("gallery", [...event.gallery, { id: crypto.randomUUID(), url: "", alt: "", caption: "", sort_order: event.gallery.length, srcset: [] }])}>Tambah foto lokasi</Button>
        {photoHelp}
      </div>)}
      {block("prepare", "Persiapan tamu", <PrepareBlock event={event} update={update} control={control} />)}
      {block("team", "Our Team", <div className="stack">
        <p>Bagian ini memakai teks tetap tentang lingkungan kerja Werkudara yang inklusif. Aktifkan dan atur urutannya di bawah. Foto tim opsional; unggah hanya foto yang boleh ditampilkan publik. Panel admin belum memakai login.</p>
        <PhotoField name="team_image.url" label="Foto tim (opsional)" value={event.team_image.url} srcset={event.team_image.srcset} onChange={value => update("team_image", { ...event.team_image, ...value, alt: value.url ? event.team_image.alt : "" })} error={errors["team_image.url"]?.join(" ")} />
        {control("team_image.alt", "Deskripsi foto tim", event.team_image.alt, value => update("team_image", { ...event.team_image, alt: value }), { maxLength: 300, hint: "Wajib bila foto diisi. Jelaskan isi foto untuk pembaca layar." })}
        {photoHelp}
      </div>)}
      {block("rsvp", "Penerimaan RSVP", <div className="stack"><p>RSVP adalah konfirmasi kehadiran tamu (dari bahasa Prancis, <i lang="fr">répondez s&apos;il vous plaît</i>). Formulir ini memungkinkan tamu mengabari panitia apakah mereka dapat hadir.</p>{toggle("rsvp_enabled", "Aktifkan penerimaan konfirmasi kehadiran")}{time("rsvp_closes_at", `Batas RSVP (${tz})`, "Kosongkan jika tidak ada batas waktu. Bagian RSVP juga harus ditampilkan agar formulir terlihat.")}{control("guest_estimate", "Perkiraan jumlah tamu (opsional)", event.guest_estimate === null ? "" : String(event.guest_estimate), value => { const digits = value.replace(/\D/g, "").slice(0, 4); update("guest_estimate", digits ? Number(digits) : null); }, { hint: "Angka awal untuk konsumsi dan BEO, sebelum RSVP masuk." })}</div>)}
      {block("contact", "Kontak", <div className="stack">
        <p>Isi nama dan nomor untuk menampilkan bagian kontak tersendiri setelah konfirmasi. Aktifkan juga bagian Kontak pada pengaturan tampilan. Kontak tetap tersedia meskipun RSVP ditutup.</p>
        {control("contact.heading", "Judul pengantar kontak (opsional)", event.contact.heading, value => update("contact", { ...event.contact, heading: value }), { maxLength: 200, hint: "Contoh: Any questions before your visit? Kosongkan untuk tampilan lama." })}
        {control("contact.description", "Deskripsi kontak (opsional)", event.contact.description, value => update("contact", { ...event.contact, description: value }), { multiline: true, maxLength: 1000, hint: "Misalnya bantuan arah, akses, atau informasi kunjungan." })}
        {control("contact.name", "Nama PIC", event.contact.name, value => update("contact", { ...event.contact, name: value }), { maxLength: 150 })}
        {control("contact.role", "Jabatan PIC (opsional)", event.contact.role, value => update("contact", { ...event.contact, role: value }), { maxLength: 150 })}
        {control("contact.organization", "Organisasi PIC (opsional)", event.contact.organization, value => update("contact", { ...event.contact, organization: value }), { maxLength: 200 })}
        {control("contact.phone", "Nomor PIC", event.contact.phone, value => update("contact", { ...event.contact, phone: value }), { maxLength: 30, hint: "Cukup isi nomor HP 08, misalnya 0812 3456 7890. WhatsApp otomatis memakai kode 62; telepon tetap memakai 0. Kosongkan nama dan nomor untuk menyembunyikan kontak." })}
        {choices("contact.channel", "Cara menghubungi PIC", [{ value: "whatsapp", label: "WhatsApp" }, { value: "phone", label: "Telepon" }], event.contact.channel, value => update("contact", { ...event.contact, channel: value }), value => value === "whatsapp" ? "Tombol membuka percakapan WhatsApp." : "Tombol membuka aplikasi telepon.")}
      </div>)}
      {block("day", "Hari H", <DayBlock event={event} update={update} control={control} />)}
      {block("feedback_questions", "Survei feedback", <div className="stack">
        {toggle("feedback_enabled", "Aktifkan survei feedback")}{time("feedback_opens_at", `Mulai menerima feedback (${tz})`, "Kosongkan agar tersedia setelah diaktifkan dan dipublikasikan.")}
        {text("feedback_description", "Pengantar survei (opsional)", 1000, true, "Kosongkan untuk memakai pengantar yang sekarang. Survei aplikasi bukan pesan WhatsApp.")}
        <Notice>Gunakan pertanyaan yang telah disetujui GA. Jangan mengganti makna atau jenis pertanyaan yang telah menerima jawaban; buat acara duplikat untuk survei baru. Server dapat menolak perubahan pertanyaan yang sudah digunakan.</Notice>
        {event.feedback_questions.map((question, index) => {
          function change<K extends keyof FeedbackQuestion>(key: K, value: FeedbackQuestion[K]) { update("feedback_questions", event.feedback_questions.map(item => item.id === question.id ? { ...item, [key]: value } : item)); }
          return <div className={styles.item} key={question.id}>
            <div className={styles.itemHeader}><h3>Pertanyaan {index + 1}</h3><OrderButtons label={`pertanyaan ${index + 1}`} index={index} length={event.feedback_questions.length} onMove={direction => update("feedback_questions", moveItem(event.feedback_questions, index, direction))} /></div>
            {control(`feedback_questions.${index}.label`, "Teks pertanyaan", question.label, value => change("label", value), { maxLength: 500 })}
            <Field name={`feedback_questions.${index}.kind`} label="Jenis jawaban"><select className="select" id={`feedback_questions.${index}.kind`} value={question.kind} onChange={e => change("kind", e.target.value as FeedbackQuestion["kind"])}><option value="text">Teks bebas</option><option value="rating">Rating 1–5</option><option value="choice">Pilihan tunggal</option></select></Field>
            <Check label="Wajib dijawab" checked={question.required} onChange={value => change("required", value)} />
            {question.kind === "choice" && control(`feedback_questions.${index}.options`, "Pilihan jawaban", question.options.join("\n"), value => change("options", value.split("\n")), { multiline: true, hint: "Satu pilihan per baris, minimal 2 pilihan berbeda; maksimal 20 pilihan (200 karakter per pilihan)." })}
            <Button type="button" variant="danger" onClick={() => { if (window.confirm("Hapus pertanyaan ini dari draft editor? Pertanyaan yang telah menerima jawaban dapat dilindungi server.")) update("feedback_questions", event.feedback_questions.filter(item => item.id !== question.id)); }}><Trash2 size={17} aria-hidden="true" /><span>Hapus pertanyaan {index + 1}</span></Button>
          </div>;
        })}
        {!event.feedback_questions.length && <p>Belum ada pertanyaan. Survei harus dinonaktifkan sebelum publikasi sampai pertanyaan tersedia.</p>}
        <Button type="button" variant="secondary" disabled={event.feedback_questions.length >= 30} onClick={() => update("feedback_questions", [...event.feedback_questions, { id: crypto.randomUUID(), label: "", kind: "text", required: false, options: [], sort_order: event.feedback_questions.length }])}>Tambah pertanyaan</Button>
      </div>)}
      {block("review", "Ulasan Google (opsional)", <div className="stack">
        <p>Menampilkan tombol “Bagikan ulasan Anda” di penutup undangan, menuju halaman ulasan Google Werkudara. Berbeda dari survei feedback: ulasan disimpan oleh Google, dapat tampil publik di Google, dan tidak masuk ke panel ini. Google dapat meminta tamu masuk ke akun Google.</p>
        <ol><li>Buka profil bisnis Google Werkudara yang Anda kelola, lalu pilih “Minta ulasan” atau bagikan tautan ulasan.</li><li>Salin tautan resmi dan tempel di bawah. Gunakan “Periksa tautan” untuk memastikan tujuan benar.</li><li>Aktifkan pilihan berikut, lalu simpan dan publikasikan acara. Tombol muncul di bagian penutup undangan.</li></ol>
        {toggle("review_enabled", "Tampilkan tombol ulasan Google")}
        {text("review_heading", "Judul ulasan (opsional)", 200, false, "Kosongkan untuk tidak menampilkan judul tambahan.")}
        {text("review_description", "Deskripsi ulasan (opsional)", 1000, true, "Contoh: Jika berkenan, bagikan pengalaman Anda melalui Google Review. Ulasan di Google dapat tampil publik.")}
        {text("review_button_label", "Teks tombol ulasan (opsional)", 100, false, "Kosongkan untuk memakai Bagikan ulasan Anda.")}
        {text("review_url", "Tautan ulasan Google HTTPS", 8000, false, "Opsional. Tersedia untuk semua tamu tanpa menyaring skor feedback. Nonaktifkan pilihan di atas dan simpan untuk menyembunyikan tombol.")}
        {/^https:\/\/[^\s/]+/.test(event.review_url) && <ButtonLink variant="secondary" href={event.review_url} target="_blank" rel="noopener noreferrer">Periksa tautan <ArrowUpRight size={17} aria-hidden="true" /><span className="sr-only"> (tab baru)</span></ButtonLink>}
      </div>)}
      {block("after", "Setelah acara", <AfterBlock event={event} update={update} control={control} errors={errors} />)}
      {block("language", "Bahasa & terjemahan", <TranslationBlock event={event} update={update} control={control} />)}
      {block("sections", "Urutan & tampilan bagian", <div className="stack"><p>Sambutan dan penutup tetap berada di awal dan akhir undangan. Bagian pendukung dapat disembunyikan atau diurutkan.</p>
        {event.sections.map((section, index) => <div className={styles.sectionRow} key={section.key}><Check label={sectionLabels[section.key]} checked={section.enabled} onChange={enabled => update("sections", event.sections.map(item => item.key === section.key ? { ...item, enabled } : item))} /><OrderButtons label={sectionLabels[section.key]} index={index} length={event.sections.length} onMove={direction => update("sections", moveItem(event.sections, index, direction))} /></div>)}
      </div>)}
      {block("publication", "Status & penyimpanan", <div className="stack">
        <Field name="status" label="Status acara" hint="Draft dan arsip tidak tampil di URL undangan publik. Semua perubahan berlaku setelah disimpan."><select className="select" id="status" aria-describedby="status-hint" value={event.status} onChange={e => update("status", e.target.value as EventStatus)}><option value="draft">Draft — belum publik</option><option value="published">Dipublikasikan — dapat dibuka melalui tautan</option><option value="archived">Diarsipkan — tidak publik</option></select></Field>
        {hidden.length > 0 && <div><h3>Bagian yang belum ditampilkan</h3><Notice tone="warning"><ul>{hidden.map(reason => <li key={reason}>{reason}</li>)}</ul></Notice></div>}
        <p>Publikasi memerlukan penyelenggara dan isi undangan. Mode alamat memerlukan nama tempat, alamat, dan tautan Maps; mode sematan memerlukan kode peta Google yang valid.</p>
      </div>)}
    </fieldset>
        <footer className={styles.panelFooter}><Button type="button" onClick={closePanel}>Selesai</Button><span className="muted">Tersimpan setelah Anda menekan Simpan perubahan.</span></footer>
      </div>
    </div>
    <div className={styles.saveBar} role="region" aria-label="Simpan perubahan">
      <span className={`${styles.saveState} ${dirty ? styles.saveStateDirty : ""}`.trimEnd()}>{dirty ? <><CircleDot size={16} aria-hidden="true" /> {dirtyBlocks.size > 1 ? `${dirtyBlocks.size} bagian belum disimpan` : "Ada perubahan yang belum disimpan"}</> : <><CircleCheck size={16} aria-hidden="true" /> Semua perubahan tersimpan</>}</span>
      <div className={styles.actions}>
        <ButtonLink href={`/admin/events/${event.id}/preview`} variant="secondary"><Eye size={17} aria-hidden="true" /> Preview</ButtonLink>
        <Button type="submit" disabled={pending}><Save size={17} aria-hidden="true" /> {pending ? "Menyimpan…" : event.status === "published" ? "Simpan & publikasikan" : "Simpan perubahan"}</Button>
      </div>
    </div>
  </form>;
}
