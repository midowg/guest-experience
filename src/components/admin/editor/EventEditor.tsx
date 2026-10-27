"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Notice } from "@/components/ui";
import { BookOpen, CalendarCheck, CalendarClock, CircleCheck, CircleDot, ClipboardCheck, Eye, FileText, Frame, HandHeart, Handshake, HeartHandshake, Image as ImageIcon, Images, Landmark, Languages, LayoutList, ListChecks, ListOrdered, MapPin, Menu, MessageSquare, Palette, Pencil, Phone, Rocket, Save, Send, Shirt, Smartphone, Sparkles, Star, Trash2, Users, X, type LucideIcon } from "lucide-react";
import { Check, SuggestionChips } from "@/components/admin/editor/controls";
import { chipLabel, fieldExamples, fieldPattern, fieldSuggestions, fillSuggestion } from "@/components/admin/editor/suggestions";
import { fromZoneInput, toZoneInput } from "@/lib/format";
import { tzLabel, zoneOf } from "@/lib/timezones";
import type { EventPhase, EventRecord, SectionKey, StaffMember } from "@/lib/types";
import { eventSchema } from "@/lib/validation";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import { blockOfPath, blockStatusLabels, blockStatuses, blocksFor, completeSections, prepareEvent, stagesFor } from "@/components/admin/editor/editor-model";
import { AfterBlock, AppearanceBlock, DayBlock, ExperienceBlock, PrepareBlock } from "@/components/admin/editor/JourneyEditor";
import { TranslationBlock } from "@/components/admin/editor/TranslationEditor";
import { blockAllowed, moduleActive, moduleBlocks, type AdminModule } from "@/lib/admin-modules";
import type { GuidePart } from "@/lib/guide";
import type { ControlOptions, EditorKit, BooleanKey, TextKey, TimeKey } from "@/components/admin/editor/kit";
import { AgendaBlock } from "@/components/admin/editor/blocks/AgendaBlock";
import { ContactBlock } from "@/components/admin/editor/blocks/ContactBlock";
import { FeedbackBlock } from "@/components/admin/editor/blocks/FeedbackBlock";
import { GuideBlock, withGuidePart } from "@/components/admin/editor/blocks/GuideBlock";
import { HeroBlock } from "@/components/admin/editor/blocks/HeroBlock";
import { IdentityBlock } from "@/components/admin/editor/blocks/IdentityBlock";
import { PosterBlock } from "@/components/admin/editor/blocks/PosterBlock";
import { DonationDisplayBlock, DonationItemsBlock, DonationNewsBlock, DonationPaymentBlock, DonationRecipientsBlock } from "@/components/admin/editor/blocks/DonationBlock";
import { PublicationBlock } from "@/components/admin/editor/blocks/PublicationBlock";
import { POSTER_LABEL, type PosterDesign } from "@/lib/poster";
import { posterPresets, presetPoster } from "@/lib/poster-presets";
import { ReviewBlock } from "@/components/admin/editor/blocks/ReviewBlock";
import { RsvpBlock } from "@/components/admin/editor/blocks/RsvpBlock";
import { ScheduleBlock } from "@/components/admin/editor/blocks/ScheduleBlock";
import { SectionsBlock } from "@/components/admin/editor/blocks/SectionsBlock";
import { TeamBlock } from "@/components/admin/editor/blocks/TeamBlock";
import { TopicsBlock } from "@/components/admin/editor/blocks/TopicsBlock";
import { VenueBlock } from "@/components/admin/editor/blocks/VenueBlock";
import { VenueGalleryBlock } from "@/components/admin/editor/blocks/VenueGalleryBlock";
import styles from "@/components/admin/admin.module.css";
import e from "./editor.module.css";
import n from "./block-numbers.module.css";
import { BlockChips } from "@/components/admin/editor/BlockChips";
import { PhonePreview, type PreviewDevice } from "@/components/admin/editor/PhonePreview";
import { areaOfBlock, blockOfArea, phaseOfBlock } from "@/lib/live-preview";
import { absolute, adminApi, eventPath } from "@/lib/routes";


/** Shorter names for the chips, so more of them fit with their names on one row. */
const chipNames: Record<string, string> = { experience: "Pengalaman", venue: "Lokasi", prepare: "Persiapan", team: "Tim", rsvp: "RSVP", contact: "Kontak", feedback_questions: "Feedback", review: "Ulasan", poster: "Poster", guide: "Bab", "donation-items": "Bantuan", "donation-pay": "Rekening", "donation-recipients": "Penerima", "donation-show": "Tampilan", "donation-news": "Kabar" };
const blockIcons: Record<string, LucideIcon> = {
  delete: Trash2, identity: FileText, appearance: Palette, schedule: CalendarClock, hero: ImageIcon, topics: ListChecks, experience: Sparkles,
  agenda: ListOrdered, venue: MapPin, gallery: Images, prepare: Shirt, language: Languages, team: Users, rsvp: ClipboardCheck, contact: Phone, day: CalendarCheck,
  feedback_questions: MessageSquare, review: Star, after: Handshake, sections: LayoutList, publication: Rocket, poster: Frame, guide: BookOpen, "donation-items": HandHeart, "donation-pay": Landmark, "donation-recipients": HeartHandshake, "donation-show": Eye, "donation-news": Send,
};


const WIDE = "(min-width: 72rem)";
/** Whether the menu is a sidebar (wide screen) or a drawer. Without matchMedia it is a drawer. */
function useWideScreen() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(WIDE);
    const sync = () => setWide(query.matches);
    // The server cannot know the screen; the first render is the phone layout, then this corrects it.
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return wide;
}

/**
 * `disabledModules` comes from the super admin and is empty for them. A switched-off module
 * that this event does not use is not offered at all; one it already uses stays visible with a
 * note, may be switched off, and cannot come back (the server checks the same rule on save).
 */
export function EventEditor({ event: initialEvent, disabledModules = [], superAdmin = false, origin = "", staff = [], posterDesigns = [], previewSrc, dangerZone }: { event: EventRecord; disabledModules?: AdminModule[]; superAdmin?: boolean; origin?: string; staff?: StaffMember[]; posterDesigns?: PosterDesign[]; previewSrc?: string; dangerZone?: ReactNode }) {
  const unavailable = (key: AdminModule) => disabledModules.includes(key) && !moduleActive(initialEvent, key);
  const restricted = (key: AdminModule) => disabledModules.includes(key) && moduleActive(initialEvent, key);
  // Kind, audience, and theme come from the template; only the super admin changes them (meeting of 20 Oct).
  const card = initialEvent.event_kind === "kartu";
  const guide = initialEvent.event_kind === "eguide";
  // Each kind offers only the blocks that fit it (kindModules / kindBlocks in src/lib/admin-modules.ts).
  // Each kind reads its own menu (Friday Sharing renames and regroups); everything below uses these two.
  const editorBlocks = blocksFor(initialEvent.event_kind);
  const editorStages = stagesFor(initialEvent.event_kind);
  const blocks = editorBlocks.filter(item => (superAdmin || item.id !== "appearance") && blockAllowed(initialEvent.event_kind, item.id) && !(Object.entries(moduleBlocks) as [AdminModule, string][]).some(([key, id]) => id === item.id && unavailable(key)));
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
  // One block's form is always open next to the phone preview; it starts with the event's basics.
  const [open, setOpen] = useState<string>(card ? "poster" : guide ? "guide" : "identity");
  const [phase, setPhase] = useState<EventPhase>("before");
  // On a phone the form and the preview take turns on screen.
  const [view, setView] = useState<"form" | "preview">("form");
  // The phone is what most guests see; the web view is a second look.
  const [device, setDevice] = useState<PreviewDevice>("mobile");
  // The block menu: a drawer behind ☰ on phone and tablet, a sidebar that ☰ hides on a wide screen.
  const wide = useWideScreen();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const menuShown = wide ? !sidebarHidden : drawerOpen;
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (key: KeyboardEvent) => { if (key.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);
  const [dirtyBlocks, setDirtyBlocks] = useState<Set<string>>(() => new Set());
  const errorSummary = useRef<HTMLDivElement>(null);
  const blockTitle = useRef<HTMLHeadingElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => { if (error) errorSummary.current?.focus(); }, [error, errors]);
  function update<K extends keyof EventRecord>(key: K, value: EventRecord[K]) {
    setEvent(current => ({ ...current, [key]: value })); setDirty(true); setMessage("");
    // Friday Sharing keeps its settings in one field across several blocks: the open one is the one changed.
    const owner = key === "donation" && open.startsWith("donation-") ? open : blockOfPath(String(key));
    setDirtyBlocks(current => current.has(owner) ? current : new Set(current).add(owner));
  }
  /** Switch the form to another block; the preview follows with the matching part and phase. */
  function openBlock(id: string) {
    setOpen(id); setPhase(phaseOfBlock(id)); setView("form"); setDrawerOpen(false);
    requestAnimationFrame(() => {
      const title = blockTitle.current;
      if (!title) return;
      title.focus({ preventScroll: true });
      // Bring the block's title (and its on/off switch) into view below the sticky header and toolbar.
      const below = (toolbar.current?.getBoundingClientRect().bottom ?? 110) + 12;
      const top = title.getBoundingClientRect().top;
      if (top < below || top > window.innerHeight - 120) window.scrollTo({ top: Math.max(0, window.scrollY + top - below), behavior: "smooth" });
    });
  }
  /** Open the block that owns a field, then focus the field once it is visible. */
  function openField(key: string) {
    setOpen(blockOfPath(key)); setView("form");
    requestAnimationFrame(() => { const field = document.getElementById(key); field?.focus(); field?.scrollIntoView?.({ block: "center" }); });
  }
  // Whatever publishing would still reject marks a card "Perlu dilengkapi".
  const publishIssues = useMemo(() => {
    const parsed = eventSchema.safeParse({ ...prepareEvent(event), status: "published" });
    return parsed.success ? [] : parsed.error.issues.map(issue => issue.path.join("."));
  }, [event]);
  const statuses = blockStatuses(event, errors, dirtyBlocks, publishIssues);
  // A block for a module this event does not use waits under "Bagian lain", so the main list
  // shows only what the event actually has. Opening, editing, or an error keeps it in view.
  const blockModule = Object.fromEntries((Object.entries(moduleBlocks) as [AdminModule, string][]).map(([key, id]) => [id, key])) as Record<string, AdminModule>;
  const inUse = (id: string) => !blockModule[id] || moduleActive(event, blockModule[id]) || dirtyBlocks.has(id) || statuses[id] === "error" || statuses[id] === "todo";
  const mainBlocks = blocks.filter(item => inUse(item.id));
  const extraBlocks = blocks.filter(item => !inUse(item.id));
  function described(name: string, hint?: string) { return [hint ? `${name}-hint` : "", errors[name] ? `${name}-error` : ""].filter(Boolean).join(" ") || undefined; }
  /** Chips and example sentences come from suggestions.ts by field name, so call sites stay short. */
  function control(name: string, label: string, value: string, onChange: (value: string) => void, options: ControlOptions = {}) {
    const pattern = fieldPattern(name);
    const placeholder = options.type === "datetime-local" ? undefined : options.placeholder ?? fieldExamples[pattern];
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
  /**
   * The on/off switch of a block that is a part of the guest page, or null for blocks that are
   * always there. RSVP and the survey also open and close with it, so there is one switch, not two.
   */
  function blockSwitch(id: string): { on: boolean; set: (on: boolean) => void } | null {
    if (id === "review") return { on: event.review_enabled, set: on => update("review_enabled", on) };
    // Switched on for the first time, Studio Poster starts from the first design.
    if (id === "poster" && event.event_kind === "kartu") return null;
    if (id === "donation-items") return { on: event.donation.enabled, set: on => update("donation", { ...event.donation, enabled: on }) };
    if (id === "poster") return { on: event.poster.enabled, set: on => update("poster", on && !event.poster.fields.length ? presetPoster(posterPresets[0].key, event) : { ...event.poster, enabled: on }) };
    const key = sectionOfBlock[id];
    if (!key) return null;
    // In an E-Guide a part is shown by being in the book, so the switch puts it in or takes it out.
    if (guide) {
      const part = key as GuidePart;
      return { on: !!event.sections.find(section => section.key === key)?.enabled, set: next => { const changed = withGuidePart(event, part, next); update("guide", changed.guide); update("sections", changed.sections); } };
    }
    const shown = !!event.sections.find(section => section.key === key)?.enabled;
    const on = shown && (key !== "rsvp" || event.rsvp_enabled) && (key !== "feedback" || event.feedback_enabled);
    return {
      on,
      set: next => {
        update("sections", event.sections.map(section => section.key === key ? { ...section, enabled: next } : section));
        if (key === "rsvp") update("rsvp_enabled", next);
        if (key === "feedback") update("feedback_enabled", next);
      },
    };
  }
  function block(id: string, title: string, children: ReactNode) {
    if (open !== id) return null;
    const stage = editorBlocks.find(item => item.id === id)?.stage ?? "prep";
    return <section id={id} data-block={id} className={`${styles.block} ${styles[`stage_${stage}`]}`} aria-label={title}>
      {blockSwitch(id)?.on === false && <p className={e.offNote}>Bagian ini belum tampil untuk tamu. Isi dulu, lalu nyalakan switch di kanan atas.</p>}
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
    if (payload.status === "published" && !window.confirm(`Simpan dan publikasikan perubahan ini? ${guide ? "E-Guide" : "Undangan"} akan dapat dibuka oleh siapa pun yang memiliki tautannya.`)) return;
    setPending(true);
    try {
      const result = await adminRequest<EventRecord>(adminApi(event.id), { method: "PUT", body: JSON.stringify(parsed.data) });
      if (!result.data) throw new Error("Missing saved event");
      setEvent(completeSections(result.data)); setEmbedDraft(result.data.location_embed_url ?? ""); setDirty(false); setDirtyBlocks(new Set()); setMessage(result.message || "Perubahan tersimpan."); router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) { setError(errorMessage(err)); if (err instanceof AdminApiError) setErrors(err.fieldErrors || {}); }
    finally { setPending(false); }
  }
  // The switched-on modules, numbered in menu order: the chips, the menu and the open header share it.
  const numbered = editorStages.flatMap(stage => mainBlocks.filter(item => item.stage === stage.key && blockSwitch(item.id)?.on));
  const numberOf = new Map(numbered.map((item, index) => [item.id, index + 1]));
  const openMeta = editorBlocks.find(item => item.id === open);
  const openTitle = open === "delete" ? "Hapus acara" : openMeta?.title ?? "";
  function menuItem(item: (typeof editorBlocks)[number]) {
    const Icon = blockIcons[item.id] ?? FileText;
    const status = statuses[item.id];
    const number = numberOf.get(item.id);
    return <li key={item.id}><button type="button" onClick={() => openBlock(item.id)} aria-current={open === item.id ? "true" : undefined}>
      {number ? <b className={n.menuNumber} aria-hidden="true">{number}</b> : <Icon size={16} aria-hidden="true" />}<span>{item.title}</span>
      {blockSwitch(item.id)?.on && <span className={e.onBadge} title="Tampil di undangan">Aktif</span>}
      {(status === "todo" || status === "error" || status === "dirty") && <span className={`${e.dot} ${e[`dot_${status}`]}`} title={blockStatusLabels[status]} />}
    </button></li>;
  }
  const kit: EditorKit = { event, update, errors, control, text, time, toggle, choices, tz, unavailable, sectionUnavailable, origin, staff, posterDesigns, superAdmin };
  return <form className={`${styles.form} ${e.editor}`} onSubmit={save} noValidate aria-busy={pending}>
    {error && <div ref={errorSummary} tabIndex={-1} className={styles.errorSummary}><Notice tone="error"><p>{error}</p>{Object.keys(errors).length > 0 && <ul>{Object.entries(errors).map(([key, values]) => <li key={key}><a href={`#${key}`} onClick={e => { e.preventDefault(); openField(key); }}>{editorBlocks.find(item => item.id === blockOfPath(key))?.title}: {values.join(" ")}</a></li>)}</ul>}</Notice></div>}
    {message && <Notice tone="success">{message}</Notice>}
    {/*
      One bar above the editor holds what is used all the time: ☰ for the block menu, form or
      preview (phone), and Simpan. It sticks under the header and covers nothing.
    */}
    <div ref={toolbar} className={`${e.toolbar} ${n.toolbar}`} role="region" aria-label="Simpan perubahan">
      {/* The usual ☰: a square icon button, with the open part named beside it as plain text. */}
      <button type="button" className={e.menuToggle} aria-controls="editor-menu" aria-expanded={menuShown} aria-label={wide ? (sidebarHidden ? "Tampilkan menu bagian" : "Sembunyikan menu bagian") : "Buka menu bagian"} title={wide ? (sidebarHidden ? "Tampilkan menu" : "Sembunyikan menu") : "Menu bagian"} onClick={() => wide ? setSidebarHidden(hidden => !hidden) : setDrawerOpen(true)}>
        <Menu size={20} aria-hidden="true" />
      </button>
      {numbered.length > 0 && <BlockChips current={open} onOpen={openBlock} chips={numbered.map(item => {
        const status = statuses[item.id];
        const flagged = status === "todo" || status === "error" || status === "dirty" ? status : undefined;
        return { id: item.id, title: item.title, short: chipNames[item.id] ?? item.title, status: flagged, statusLabel: flagged && blockStatusLabels[flagged] };
      })} />}
      {!wide && <p className={e.currentBlock} aria-hidden="true">{openTitle}</p>}
      {!card && <div className={e.viewSwitch} role="group" aria-label="Tampilan">
        <button type="button" aria-pressed={view === "form"} aria-label="Isi" onClick={() => setView("form")}><Pencil size={15} aria-hidden="true" /> <span className={e.btnText}>Isi</span></button>
        <button type="button" aria-pressed={view === "preview"} aria-label="Lihat" onClick={() => setView("preview")}><Smartphone size={15} aria-hidden="true" /> <span className={e.btnText}>Lihat</span></button>
      </div>}
      <span className={`${e.saveState} ${dirty ? e.saveStateDirty : ""}`.trimEnd()} role="status">{dirty ? <><CircleDot size={16} aria-hidden="true" /> {dirtyBlocks.size > 1 ? `${dirtyBlocks.size} bagian belum disimpan` : "Ada perubahan yang belum disimpan"}</> : <><CircleCheck size={16} aria-hidden="true" /> Semua perubahan tersimpan</>}</span>
      <Button type="submit" variant={dirty ? "primary" : "secondary"} className={e.saveButton} disabled={pending} aria-label={event.status === "published" ? "Simpan & publikasikan" : "Simpan perubahan"}>
        {pending ? "Menyimpan…" : dirty ? <><Save size={17} aria-hidden="true" /> Simpan{event.status === "published" && <span className={e.wideOnly}>&nbsp;&amp; publikasikan</span>}</> : <><CircleCheck size={17} aria-hidden="true" /> <span className={e.btnText}>Tersimpan</span></>}
      </Button>
    </div>
    {/* A card has no invitation to preview: its block shows the card itself. */}
    <div className={e.layout} data-view={card ? "form" : view} data-device={device} data-card={card || undefined} data-menu={sidebarHidden ? "hidden" : undefined}>
      {drawerOpen && <button type="button" className={e.menuBackdrop} aria-label="Tutup menu" onClick={() => setDrawerOpen(false)} />}
      <nav id="editor-menu" className={e.menu} aria-label="Bagian acara" data-open={drawerOpen || undefined}>
        <div className={e.menuHead}>
          <strong>Bagian acara</strong>
          <button type="button" aria-label="Tutup menu" onClick={() => setDrawerOpen(false)}><X size={18} aria-hidden="true" /></button>
        </div>
        {editorStages.map(stage => {
          const items = mainBlocks.filter(item => item.stage === stage.key);
          return items.length > 0 && <div key={stage.key} className={e.menuGroup}>
            <p className={e.menuStage}>{stage.label}</p>
            <ul>{items.map(menuItem)}</ul>
          </div>;
        })}
        {extraBlocks.length > 0 && <details className={e.menuMore}>
          <summary>Bagian lain ({extraBlocks.length})</summary>
          <p className="field-hint">Belum dipakai acara ini. Buka untuk menambahkannya.</p>
          <ul>{extraBlocks.map(menuItem)}</ul>
        </details>}
        {dangerZone && <ul className={e.menuDanger}><li><button type="button" onClick={() => openBlock("delete")} aria-current={open === "delete" ? "true" : undefined}><Trash2 size={16} aria-hidden="true" /><span>Hapus acara</span></button></li></ul>}
      </nav>
      <section className={e.formPane} aria-labelledby="block-title">
        <header className={`${e.formHeader} ${n.header}`}>
          {numberOf.has(open)
            ? <span className={n.number} aria-hidden="true">{numberOf.get(open)}</span>
            : <span className={e.formIcon} aria-hidden="true">{(() => { const Icon = blockIcons[open] ?? FileText; return <Icon size={20} />; })()}</span>}
          <div>
            <p className={e.formStage}>{open === "delete" ? "Pengaturan" : editorStages.find(stage => stage.key === openMeta?.stage)?.label}</p>
            <h2 id="block-title" ref={blockTitle} tabIndex={-1}>{openTitle}</h2>
          </div>
          {(() => {
            const toggle = blockSwitch(open);
            if (!toggle) return null;
            // A module the super admin switched off may be turned off here, never back on.
            const locked = !toggle.on && restrictedBlock(open);
            return <label className={e.blockSwitch} data-on={toggle.on || undefined}>
              <span>{toggle.on ? "Tampil" : "Tidak tampil"}</span>
              <input type="checkbox" role="switch" checked={toggle.on} disabled={locked || pending} onChange={change => toggle.set(change.target.checked)} aria-label={`Tampilkan ${openMeta?.title ?? "bagian ini"} di undangan`} />
            </label>;
          })()}
        </header>
    {open === "delete" ? <div className={e.formBody}>{dangerZone}</div> :
    <fieldset disabled={pending} className={`${styles.fieldset} ${e.formBody}`}>
      {block("identity", "Identitas & undangan", <IdentityBlock kit={kit} />)}
      {block("appearance", "Jenis, audiens, dan tampilan", <AppearanceBlock event={event} update={update} />)}
      {block("schedule", "Waktu acara", <ScheduleBlock kit={kit} onTimezone={changeTimezone} />)}
      {block("hero", "Foto latar pembuka", <HeroBlock kit={kit} />)}
      {block("guide", "Bab panduan", <GuideBlock kit={kit} />)}
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
      {block("poster", POSTER_LABEL, <PosterBlock kit={kit} />)}
      {block("donation-items", "Pilihan bantuan", <DonationItemsBlock kit={kit} />)}
      {block("donation-pay", "Rekening & QRIS", <DonationPaymentBlock kit={kit} />)}
      {block("donation-recipients", "Penerima bantuan", <DonationRecipientsBlock kit={kit} />)}
      {block("donation-show", "Yang tampil di halaman", <DonationDisplayBlock kit={kit} />)}
      {block("donation-news", "Kabar penyerahan", <DonationNewsBlock kit={kit} />)}
      {block("feedback_questions", "Survei feedback", <FeedbackBlock kit={kit} />)}
      {block("review", "Ulasan Google (opsional)", <ReviewBlock kit={kit} />)}
      {block("after", "Setelah acara", <AfterBlock event={event} update={update} control={control} errors={errors} collaboration={!unavailable("collaboration")} origin={origin} />)}
      {block("language", "Bahasa & terjemahan", <TranslationBlock event={event} update={update} control={control} />)}
      {block("sections", "Urutan & tampilan bagian", <SectionsBlock kit={kit} />)}
      {block("publication", "Status & penyimpanan", <PublicationBlock kit={kit} />)}
    </fieldset>}
      </section>
      {!card && <aside className={e.previewPane} aria-label="Pratinjau undangan">
        <PhonePreview event={event} phase={phase} onPhase={setPhase} device={device} onDevice={setDevice} address={absolute(origin, eventPath(event)).replace(/^https?:\/\//, "")} focus={areaOfBlock(open)} onFocusArea={area => openBlock(blocks.some(item => item.id === blockOfArea[area]) ? blockOfArea[area] : guide ? "guide" : blockOfArea[area])} src={previewSrc} />
      </aside>}
    </div>
  </form>;
}
