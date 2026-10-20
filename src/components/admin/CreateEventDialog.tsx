"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, Copy, FilePlus2, Flower2, GraduationCap, HandHeart, Lock, Plane, Presentation, Users, Wine, X, type LucideIcon } from "lucide-react";
import { Button, Field, Notice } from "@/components/ui";
import { eventTemplates, templateOf, templateText, type TemplateKey } from "@/lib/event-templates";
import { setupSchema, setupSectionKeys, setupTodo, type EventSetup } from "@/lib/event-setup";
import { formatDateTime, formatTime, fromZoneInput } from "@/lib/format";
import { eventTimezones, timezoneInfo } from "@/lib/timezones";
import { themeDefinition } from "@/lib/themes";
import type { EventRecord, SectionKey } from "@/lib/types";
import { AdminApiError, adminRequest, errorMessage } from "./api";
import { Check, SuggestionChips } from "./controls";
import { sectionLabels } from "./editor-model";
import { chipLabel, fieldExamples, fieldSuggestions, fillSuggestion, WERKUDARA_OFFICE } from "./suggestions";
import styles from "./admin.module.css";

const templateIcons: Record<TemplateKey, LucideIcon> = {
  "kunjungan-klien": Building2, "gala-dinner": Wine, "seminar-launching": Presentation, "annual-meeting": Users,
  nyadran: Flower2, "csr-kegiatan-sosial": HandHeart, "pelatihan-bootcamp": GraduationCap, "trip-klien": Plane,
};
const steps = ["Mulai dari", "Dasar acara", "Isi & modul", "Ringkasan"];
const soon = ["Tiket & kursi", "Check-in", "Galeri acara"];

type Start = { type: "template"; key: TemplateKey } | { type: "copy"; id: string } | { type: "blank" };
/** Survey answers as the form holds them: times as datetime-local text, the estimate as typed. */
type Draft = Omit<EventSetup, "starts_at" | "ends_at" | "rsvp_closes_at" | "guest_estimate" | "template"> & { starts_at: string; ends_at: string; rsvp_closes_at: string; guest_estimate: string };

const emptyDraft: Draft = {
  title: "", starts_at: "", ends_at: "", timezone: "Asia/Jakarta", audience: "external", language: "id", invitation_mode: "open",
  location: "werkudara", venue_name: WERKUDARA_OFFICE.venue_name, address: WERKUDARA_OFFICE.address, location_url: WERKUDARA_OFFICE.location_url,
  greeting: "", introduction: "", closing: "", modules: ["about", "agenda", "location", "rsvp", "contact"],
  guest_estimate: "", rsvp_closes_at: "", contact_name: "", contact_phone: "",
};

function draftFor(start: Start, events: EventRecord[]): Draft {
  if (start.type === "template") {
    const template = templateOf(start.key)!;
    return { ...emptyDraft, audience: template.audience, modules: template.modules.filter(isSetupKey) };
  }
  if (start.type === "copy") {
    const source = events.find(event => event.id === start.id);
    if (!source) return emptyDraft;
    const office = source.venue_name === WERKUDARA_OFFICE.venue_name && source.address === WERKUDARA_OFFICE.address;
    return {
      ...emptyDraft, timezone: source.timezone as Draft["timezone"], audience: source.audience, language: source.language, invitation_mode: source.invitation_mode,
      location: office ? "werkudara" : source.venue_name || source.address ? "other" : "later",
      venue_name: source.venue_name, address: source.address, location_url: source.location_url,
      modules: source.sections.filter(section => section.enabled).map(section => section.key).filter(isSetupKey),
    };
  }
  return emptyDraft;
}
const isSetupKey = (key: SectionKey): key is (typeof setupSectionKeys)[number] => (setupSectionKeys as readonly string[]).includes(key);

function toSetup(draft: Draft, start: Start): unknown {
  const time = (value: string) => value ? fromZoneInput(value, draft.timezone) : null;
  return {
    ...draft, template: start.type === "template" ? start.key : "blank",
    starts_at: time(draft.starts_at) ?? "", ends_at: time(draft.ends_at), rsvp_closes_at: time(draft.rsvp_closes_at),
    guest_estimate: draft.guest_estimate.trim() ? Number(draft.guest_estimate) : null,
    ...(draft.location === "later" ? { venue_name: "", address: "", location_url: "" } : {}),
  };
}

/** Survey for a new event (board 11). Text answers start empty; known answers are chips. */
export function CreateEventDialog({ events, onClose }: { events: EventRecord[]; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [start, setStart] = useState<Start | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !pending) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  const set = (patch: Partial<Draft>) => { setDraft(current => ({ ...current, ...patch })); setErrors({}); };
  const template = start?.type === "template" ? templateOf(start.key) : undefined;
  const copying = start?.type === "copy";
  const source = start?.type === "copy" ? events.find(event => event.id === start.id) : undefined;
  const fieldError = (name: string) => errors[name]?.join(" ");

  function pick(next: Start) {
    setStart(next); setDraft(draftFor(next, events)); setErrors({}); setStep(1);
  }
  /** Each step checks only its own fields; the server checks everything again. */
  function next() {
    const parsed = setupSchema.safeParse(toSetup(draft, start ?? { type: "blank" }));
    const issues: Record<string, string[]> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) (issues[issue.path.join(".")] ??= []).push(issue.message);
    if (!draft.starts_at) issues.starts_at = ["Isi tanggal dan jam mulai."];
    const own = step === 1 ? ["title", "starts_at", "ends_at", "venue_name", "address", "location_url"] : ["greeting", "introduction", "closing", "guest_estimate", "rsvp_closes_at", "contact_name", "contact_phone"];
    const mine = Object.fromEntries(Object.entries(issues).filter(([key]) => own.includes(key)));
    if (Object.keys(mine).length) { setErrors(mine); requestAnimationFrame(() => document.getElementById(`setup-${Object.keys(mine)[0]}`)?.focus()); return; }
    setStep(step + 1);
  }
  async function create() {
    if (pending || !start) return;
    setPending(true); setError("");
    try {
      const result = await adminRequest<EventRecord>("/api/admin/events", { method: "POST", body: JSON.stringify({ setup: toSetup(draft, start), ...(start.type === "copy" ? { duplicateId: start.id } : {}) }) });
      if (!result.data) throw new AdminApiError("Draf belum dapat dipastikan tersimpan. Muat ulang daftar acara.");
      router.push(`/admin/events/${result.data.id}`);
    } catch (err) {
      setPending(false);
      setError(errorMessage(err));
      if (err instanceof AdminApiError && err.fieldErrors) setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([key, value]) => [key.replace(/^setup\./, ""), value])));
    }
  }

  function input(name: keyof Draft, label: string, options: { type?: string; multiline?: boolean; hint?: string; chips?: string[]; required?: boolean; inputMode?: "numeric"; example?: string } = {}) {
    const id = `setup-${name}`;
    const value = String(draft[name] ?? "");
    const props = { id, value, onChange: (e: { target: { value: string } }) => set({ [name]: e.target.value } as Partial<Draft>), placeholder: options.type === "datetime-local" ? undefined : options.example ? `Contoh: ${fillSuggestion(options.example, draft.title)}` : name === "title" && template ? `Contoh: ${template.example}` : fieldExamples[name], "aria-invalid": !!fieldError(name), "aria-describedby": [options.hint ? `${id}-hint` : "", fieldError(name) ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined, required: options.required, inputMode: options.inputMode };
    const chips = [...new Set(options.chips ?? [])].filter(Boolean).map(text => fillSuggestion(text, draft.title));
    return <Field name={id} label={label} hint={options.hint} error={fieldError(name)}>
      {options.multiline ? <textarea {...props} className="textarea" rows={3} /> : <input {...props} className="input" type={options.type ?? "text"} />}
      {chips.length > 0 && <SuggestionChips field={label} value={value} onPick={text => set({ [name]: text } as Partial<Draft>)} options={chips.map(text => ({ label: chipLabel(text), value: text }))} />}
    </Field>;
  }
  function radios<T extends string>(name: string, legend: string, options: { value: T; label: string; description?: string }[], current: T, onPick: (value: T) => void) {
    return <fieldset className={styles.wizardChoices}>
      <legend>{legend}</legend>
      {options.map(option => <label key={option.value} className={`${styles.wizardChoice} ${current === option.value ? styles.wizardChoiceOn : ""}`.trimEnd()}>
        <input type="radio" name={name} value={option.value} checked={current === option.value} onChange={() => onPick(option.value)} />
        <span><strong>{option.label}</strong>{option.description && <span>{option.description}</span>}</span>
      </label>)}
    </fieldset>;
  }
  const sentenceChips = (field: "greeting" | "intro" | "closing", key: "greeting" | "introduction" | "closing") => [template ? templateText(template.key, field) : "", ...(fieldSuggestions[key] ?? [])];
  const toggleModule = (key: (typeof setupSectionKeys)[number], on: boolean) => set({ modules: on ? [...draft.modules, key] : draft.modules.filter(item => item !== key) });

  const body: ReactNode[] = [
    <div key="start" className="stack">
      <p className={styles.wizardLead}>Pilih templat yang paling mirip. Semua isian bisa diubah nanti; templat hanya menyiapkan bagian dan tampilan yang biasa dipakai.</p>
      <ul className={styles.templateGrid}>
        {eventTemplates.map(item => {
          const Icon = templateIcons[item.key];
          return <li key={item.key}><button type="button" className={styles.templateCard} onClick={() => pick({ type: "template", key: item.key })}>
            <span className={styles.cardIcon} aria-hidden="true"><Icon size={20} /></span>
            <span className={styles.templateText}><strong>{item.label}</strong><span>{item.description}</span>
              <span className={styles.templateMeta}>{item.audience === "internal" ? "Internal" : "Eksternal"} · tema {themeDefinition(item.theme).name}</span></span>
          </button></li>;
        })}
      </ul>
      <div className={styles.templateOthers}>
        <button type="button" className={styles.templateCard} onClick={() => pick({ type: "blank" })}>
          <span className={styles.cardIcon} aria-hidden="true"><FilePlus2 size={20} /></span>
          <span className={styles.templateText}><strong>Mulai dari draf kosong</strong><span>Tanpa isi awal. Bagian dasar aktif: tentang acara, rundown, lokasi, RSVP, kontak.</span></span>
        </button>
        {events.length > 0 && <Field name="setup-copy" label="Atau salin dari acara sebelumnya">
          <select id="setup-copy" className="input" value="" onChange={e => e.target.value && pick({ type: "copy", id: e.target.value })}>
            <option value="">Pilih acara…</option>
            {events.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}
          </select>
        </Field>}
        <p className="field-hint"><Copy size={13} aria-hidden="true" /> Salinan membawa isi, rundown, dan pengaturan. Data tamu, RSVP, dan survei tidak ikut.</p>
      </div>
    </div>,

    <div key="basic" className="stack">
      {copying && source && <Notice>Menyalin “{source.title}”. Isi nama dan tanggal baru; rundown ikut bergeser ke tanggal baru.</Notice>}
      {input("title", "Nama acara", { required: true, hint: "Tampil sebagai judul undangan." })}
      <div className={styles.grid}>
        {input("starts_at", `Mulai (${timezoneInfo[draft.timezone].label})`, { type: "datetime-local", required: true })}
        {input("ends_at", `Selesai (${timezoneInfo[draft.timezone].label})`, { type: "datetime-local", hint: "Opsional." })}
      </div>
      <Field name="setup-timezone" label="Zona waktu" hint={timezoneInfo[draft.timezone].example}>
        <select id="setup-timezone" className="input" value={draft.timezone} onChange={e => set({ timezone: e.target.value as Draft["timezone"] })} aria-describedby="setup-timezone-hint">
          {eventTimezones.map(zone => <option key={zone} value={zone}>{timezoneInfo[zone].label} · {timezoneInfo[zone].name}</option>)}
        </select>
      </Field>
      {radios("setup-location", "Lokasi", [
        { value: "werkudara", label: "Kantor Werkudara", description: WERKUDARA_OFFICE.address },
        { value: "other", label: "Tempat lain", description: "Isi nama tempat dan alamatnya." },
        { value: "later", label: "Diisi nanti", description: "Lokasi dilengkapi di editor." },
      ], draft.location, location => set(location === "werkudara" ? { location, ...WERKUDARA_OFFICE } : location === "other" && draft.location === "werkudara" ? { location, venue_name: "", address: "", location_url: "" } : { location }))}
      {draft.location === "other" && <div className="stack">
        {input("venue_name", "Nama tempat")}{input("address", "Alamat", { multiline: true })}{input("location_url", "Tautan Google Maps (opsional)", { type: "url" })}
      </div>}
      {radios("setup-audience", "Untuk siapa", [
        { value: "external", label: "Eksternal", description: "Klien, mitra, atau tamu dari luar. Ulasan Google dan ajakan kolaborasi tersedia." },
        { value: "internal", label: "Internal", description: "Tim Werkudara. Tanpa ulasan Google dan ajakan mitra." },
      ], draft.audience, audience => set({ audience }))}
      {radios("setup-language", "Bahasa halaman tamu", [
        { value: "id", label: "Bahasa Indonesia" }, { value: "id_en", label: "Dua bahasa (ID + EN)" }, { value: "en", label: "English saja" },
      ], draft.language, language => set({ language }))}
      {radios("setup-mode", "Cara mengundang", [
        { value: "open", label: "Satu tautan umum", description: "Semua tamu memakai tautan yang sama." },
        { value: "personal", label: "Tautan per tamu", description: "Nama tamu tampil di undangan; daftar tamu diisi di tab Undangan tamu." },
      ], draft.invitation_mode, invitation_mode => set({ invitation_mode }))}
    </div>,

    <div key="content" className="stack">
      <h3 className={styles.wizardSub}>Kalimat undangan</h3>
      <p className="field-hint">{copying ? "Kosongkan untuk memakai kalimat dari acara yang disalin, atau pilih kalimat lain." : "Pilih salah satu kalimat atau tulis sendiri. Bisa dikosongkan dan diisi nanti."}</p>
      {input("greeting", "Sapaan", { chips: sentenceChips("greeting", "greeting"), example: template && templateText(template.key, "greeting") })}
      {input("introduction", "Isi undangan", { multiline: true, chips: sentenceChips("intro", "introduction"), example: template && templateText(template.key, "intro") })}
      {input("closing", "Penutup", { multiline: true, chips: sentenceChips("closing", "closing"), example: template && templateText(template.key, "closing") })}
      <fieldset className={styles.wizardModules}>
        <legend>Bagian yang tampil di halaman tamu</legend>
        {setupSectionKeys.map(key => <Check key={key} label={sectionLabels[key]} checked={draft.modules.includes(key)} onChange={on => toggleModule(key, on)} />)}
        <p className={styles.soonRow}>{soon.map(label => <span key={label} className={styles.soonChip}><Lock size={12} aria-hidden="true" /> {label} · Segera</span>)}</p>
      </fieldset>
      {draft.modules.includes("rsvp") && <div className={styles.grid}>
        {input("guest_estimate", "Perkiraan jumlah tamu (opsional)", { inputMode: "numeric", hint: "Angka awal untuk konsumsi dan BEO." })}
        {input("rsvp_closes_at", `Batas RSVP (${timezoneInfo[draft.timezone].label}, opsional)`, { type: "datetime-local" })}
      </div>}
      {(draft.modules.includes("rsvp") || draft.modules.includes("contact")) && <div className={styles.grid}>
        {input("contact_name", "Nama PIC (opsional)", { hint: "Orang yang dihubungi tamu." })}
        {input("contact_phone", "Nomor WhatsApp PIC", { inputMode: "numeric" })}
      </div>}
    </div>,

    <div key="summary" className="stack">
      <dl className={styles.wizardSummary}>
        <div><dt>Mulai dari</dt><dd>{template?.label ?? (source ? `Salinan “${source.title}”` : "Draf kosong")}</dd></div>
        <div><dt>Nama acara</dt><dd>{draft.title}</dd></div>
        <div><dt>Waktu</dt><dd>{draft.starts_at && formatDateTime(fromZoneInput(draft.starts_at, draft.timezone)!, draft.timezone)}{draft.ends_at && ` – ${formatTime(fromZoneInput(draft.ends_at, draft.timezone)!, draft.timezone)} ${timezoneInfo[draft.timezone].label}`}</dd></div>
        <div><dt>Lokasi</dt><dd>{draft.location === "later" ? "Diisi nanti" : draft.venue_name || "Belum diisi"}</dd></div>
        <div><dt>Tamu</dt><dd>{draft.audience === "internal" ? "Internal" : "Eksternal"} · {draft.invitation_mode === "personal" ? "tautan per tamu" : "tautan umum"} · {draft.language === "id" ? "Bahasa Indonesia" : draft.language === "en" ? "English" : "dua bahasa"}</dd></div>
        <div><dt>Bagian tampil</dt><dd>{draft.modules.map(key => sectionLabels[key]).join(", ") || "Belum ada"}</dd></div>
        {template && <div><dt>Tampilan</dt><dd>Tema {themeDefinition(template.theme).name}</dd></div>}
      </dl>
      <div className={styles.wizardTodo}>
        <h3 className={styles.wizardSub}>Setelah ini, lengkapi</h3>
        <ul>{setupTodo({ ...(toSetup(draft, start ?? { type: "blank" }) as EventSetup) }).map(item => <li key={item}>{item}</li>)}</ul>
        <p className="field-hint">Acara dibuat sebagai draf dan belum terlihat tamu sampai dipublikasikan.</p>
      </div>
    </div>,
  ];

  return <div className={styles.panelLayer}>
    <div className={styles.panelBackdrop} onClick={() => !pending && onClose()} aria-hidden="true" />
    <div className={styles.wizard} role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <header className={styles.wizardHeader}>
        <div>
          <p className={styles.wizardStep}>Langkah {step + 1} dari {steps.length} · {steps[step]}</p>
          <h2 id="wizard-title" ref={heading} tabIndex={-1}>{step === 0 ? "Buat acara" : draft.title || template?.label || "Acara baru"}</h2>
          <ol className={styles.wizardProgress} aria-hidden="true">{steps.map((label, index) => <li key={label} className={index <= step ? styles.wizardProgressOn : undefined} />)}</ol>
        </div>
        <button type="button" className={styles.panelClose} onClick={onClose} disabled={pending} aria-label="Tutup"><X size={18} aria-hidden="true" /></button>
      </header>
      <div className={styles.wizardBody}>
        {error && <Notice tone="error">{error}</Notice>}
        {template && step > 0 && (() => { const Icon = templateIcons[template.key]; return <p className={styles.wizardTemplate}><Icon size={14} aria-hidden="true" /> Templat {template.label}</p>; })()}
        {body[step]}
      </div>
      {step > 0 && <footer className={styles.wizardFooter}>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => setStep(step - 1)}><ArrowLeft size={16} aria-hidden="true" /> Kembali</Button>
        {step < steps.length - 1 ? <Button type="button" onClick={next}>Lanjut <ArrowRight size={16} aria-hidden="true" /></Button>
          : <Button type="button" disabled={pending} onClick={create}>{pending ? "Membuat draf…" : "Buat draf acara"}</Button>}
      </footer>}
    </div>
  </div>;
}

