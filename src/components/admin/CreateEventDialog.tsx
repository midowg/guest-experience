"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, FilePlus2, X } from "lucide-react";
import { Button, Field, Notice } from "@/components/ui";
import { eventTemplates, templateOf, type TemplateKey } from "@/lib/event-templates";
import { setupSchema, setupSectionKeys, type EventSetup } from "@/lib/event-setup";
import { fromZoneInput } from "@/lib/format";
import { eventTimezones, timezoneInfo } from "@/lib/timezones";
import { themeDefinition } from "@/lib/themes";
import type { EventRecord, SectionKey } from "@/lib/types";
import type { AdminModule } from "@/lib/admin-modules";
import { AdminApiError, adminRequest, errorMessage } from "./api";
import { TemplateMiniature } from "./TemplateMiniature";
import { fieldExamples, WERKUDARA_OFFICE } from "./suggestions";
import styles from "./admin.module.css";

type Start = { type: "template"; key: TemplateKey } | { type: "copy"; id: string } | { type: "blank" };
type Details = { title: string; starts_at: string; ends_at: string; timezone: EventSetup["timezone"]; location: EventSetup["location"]; venue_name: string; address: string; location_url: string };
const emptyDetails: Details = { title: "", starts_at: "", ends_at: "", timezone: "Asia/Jakarta", location: "werkudara", ...WERKUDARA_OFFICE };
const isSetupKey = (key: SectionKey): key is (typeof setupSectionKeys)[number] => (setupSectionKeys as readonly string[]).includes(key);

/**
 * "Buat acara" in two steps (meeting of 20 Oct): pick a ready-made template from its miniature,
 * then name, time, and place. Everything else comes from the template and is edited later.
 */
export function CreateEventDialog({ events, onClose, disabledModules = [], templates = eventTemplates.map(t => t.key), canStartBlank = false }: {
  events: EventRecord[]; onClose: () => void; disabledModules?: AdminModule[]; templates?: TemplateKey[]; canStartBlank?: boolean;
}) {
  const router = useRouter();
  const [start, setStart] = useState<Start | null>(null);
  const [details, setDetails] = useState<Details>(emptyDetails);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [start]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !pending) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  const offered = eventTemplates.filter(template => templates.includes(template.key));
  const template = start?.type === "template" ? templateOf(start.key) : undefined;
  const source = start?.type === "copy" ? events.find(event => event.id === start.id) : undefined;
  const set = (patch: Partial<Details>) => { setDetails(current => ({ ...current, ...patch })); setErrors({}); };
  const allowed = (key: SectionKey) => key === "about" || !disabledModules.includes(key as AdminModule);

  function pick(next: Start) {
    setStart(next); setErrors({}); setError("");
    if (next.type === "copy") {
      const copy = events.find(event => event.id === next.id);
      const office = copy?.venue_name === WERKUDARA_OFFICE.venue_name;
      setDetails({ ...emptyDetails, timezone: (copy?.timezone ?? "Asia/Jakarta") as Details["timezone"], location: office ? "werkudara" : copy?.venue_name ? "other" : "later", venue_name: copy?.venue_name ?? "", address: copy?.address ?? "", location_url: copy?.location_url ?? "" });
    } else setDetails(emptyDetails);
  }

  function setup(): unknown {
    const time = (value: string) => value ? fromZoneInput(value, details.timezone) : null;
    const modules = (template ? template.modules : source ? source.sections.filter(s => s.enabled).map(s => s.key) : ["about", "agenda", "location", "rsvp", "contact"] as SectionKey[]).filter(isSetupKey).filter(allowed);
    return {
      template: template?.key ?? "blank", title: details.title, starts_at: time(details.starts_at) ?? "", ends_at: time(details.ends_at), timezone: details.timezone,
      audience: template?.audience ?? source?.audience ?? "external", language: source?.language ?? "id", invitation_mode: source?.invitation_mode ?? "open",
      location: details.location, ...(details.location === "later" ? { venue_name: "", address: "", location_url: "" } : { venue_name: details.venue_name, address: details.address, location_url: details.location_url }),
      greeting: "", introduction: "", closing: "", modules, guest_estimate: null, rsvp_closes_at: null, contact_name: "", contact_phone: "",
    };
  }

  async function create() {
    if (pending || !start) return;
    const parsed = setupSchema.safeParse(setup());
    const found: Record<string, string> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) found[issue.path.join(".")] ??= issue.message;
    if (!details.starts_at) found.starts_at = "Isi tanggal dan jam mulai.";
    if (Object.keys(found).length) { setErrors(found); requestAnimationFrame(() => document.getElementById(`setup-${Object.keys(found)[0]}`)?.focus()); return; }
    setPending(true); setError("");
    try {
      const result = await adminRequest<EventRecord>("/api/admin/events", { method: "POST", body: JSON.stringify({ setup: parsed.data, ...(start.type === "copy" ? { duplicateId: start.id } : {}) }) });
      if (!result.data) throw new AdminApiError("Draf belum dapat dipastikan tersimpan. Muat ulang daftar acara.");
      router.push(`/admin/events/${result.data.id}`);
    } catch (err) {
      setPending(false); setError(errorMessage(err));
      if (err instanceof AdminApiError && err.fieldErrors) setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([key, value]) => [key.replace(/^setup\./, ""), value[0]])));
    }
  }

  function input(name: "title" | "starts_at" | "ends_at" | "venue_name" | "address" | "location_url", label: string, options: { type?: string; hint?: string; multiline?: boolean; placeholder?: string } = {}) {
    const id = `setup-${name}`;
    const props = { id, value: details[name], onChange: (e: { target: { value: string } }) => set({ [name]: e.target.value } as Partial<Details>), placeholder: options.placeholder ?? (options.type === "datetime-local" ? undefined : fieldExamples[name]), "aria-invalid": !!errors[name], "aria-describedby": [options.hint ? `${id}-hint` : "", errors[name] ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined };
    return <Field name={id} label={label} hint={options.hint} error={errors[name]}>
      {options.multiline ? <textarea {...props} className="textarea" rows={2} /> : <input {...props} className="input" type={options.type ?? "text"} />}
    </Field>;
  }
  const zone = timezoneInfo[details.timezone].label;

  return <div className={styles.panelLayer}>
    <div className={styles.panelBackdrop} onClick={() => !pending && onClose()} aria-hidden="true" />
    <div className={styles.wizard} role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <header className={styles.wizardHeader}>
        <div>
          <p className={styles.wizardStep}>Langkah {start ? 2 : 1} dari 2</p>
          <h2 id="wizard-title" ref={heading} tabIndex={-1}>{start ? "Detail acara" : "Pilih templat acara"}</h2>
        </div>
        <button type="button" className={styles.panelClose} onClick={onClose} disabled={pending} aria-label="Tutup"><X size={18} aria-hidden="true" /></button>
      </header>

      <div className={styles.wizardBody}>
        {error && <Notice tone="error">{error}</Notice>}
        {!start ? <div className="stack">
          {offered.length > 0 ? <ul className={styles.templateGallery}>
            {offered.map(item => <li key={item.key}>
              <button type="button" className={styles.templateChoice} onClick={() => pick({ type: "template", key: item.key })} aria-label={`${item.label}: ${item.description}`}>
                <TemplateMiniature template={item} />
                <span className={styles.templateChoiceText}><strong>{item.label}</strong><span>{item.description}</span><span className={styles.templateMeta}>Tampilan {themeDefinition(item.theme).name}</span></span>
              </button>
            </li>)}
          </ul> : <Notice>Belum ada templat yang tersedia. Minta super admin mengaktifkan templat, atau salin acara yang sudah ada.</Notice>}
          <div className={styles.templateOthers}>
            {events.length > 0 && <Field name="setup-copy" label="Atau salin dari acara sebelumnya" hint="Isi, rundown, dan tampilan ikut tersalin; data tamu tidak.">
              <select id="setup-copy" className="input" value="" aria-describedby="setup-copy-hint" onChange={e => e.target.value && pick({ type: "copy", id: e.target.value })}>
                <option value="">Pilih acara…</option>
                {events.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}
              </select>
            </Field>}
            {canStartBlank && <Button type="button" variant="quiet" onClick={() => pick({ type: "blank" })}><FilePlus2 size={16} aria-hidden="true" /> Mulai dari draf kosong (super admin)</Button>}
          </div>
        </div> : <div className={styles.detailsStep}>
          <div className={styles.detailsPreview}>
            {template ? <TemplateMiniature template={template} title={details.title} /> : <p className={styles.copyBadge}><Copy size={16} aria-hidden="true" /> {source ? `Salinan “${source.title}”` : "Draf kosong"}</p>}
            {template && <p className="field-hint">{template.label} · tampilan {themeDefinition(template.theme).name}</p>}
          </div>
          <div className="stack">
            {input("title", "Nama acara", { hint: "Tampil sebagai judul undangan.", placeholder: template ? `Contoh: ${template.example}` : undefined })}
            <div className={styles.grid}>
              {input("starts_at", `Mulai (${zone})`, { type: "datetime-local" })}
              {input("ends_at", `Selesai (${zone}, opsional)`, { type: "datetime-local" })}
            </div>
            <Field name="setup-timezone" label="Zona waktu">
              <select id="setup-timezone" className="input" value={details.timezone} onChange={e => set({ timezone: e.target.value as Details["timezone"] })}>
                {eventTimezones.map(key => <option key={key} value={key}>{timezoneInfo[key].label} · {timezoneInfo[key].name}</option>)}
              </select>
            </Field>
            <fieldset className={styles.wizardChoices}>
              <legend>Lokasi</legend>
              {([["werkudara", "Kantor Werkudara", WERKUDARA_OFFICE.address], ["other", "Tempat lain", "Isi nama tempat dan alamatnya."], ["later", "Diisi nanti", "Lokasi dilengkapi di editor."]] as const).map(([value, label, description]) =>
                <label key={value} className={`${styles.wizardChoice} ${details.location === value ? styles.wizardChoiceOn : ""}`.trimEnd()}>
                  <input type="radio" name="setup-location" checked={details.location === value} onChange={() => set(value === "werkudara" ? { location: value, ...WERKUDARA_OFFICE } : value === "other" && details.location === "werkudara" ? { location: value, venue_name: "", address: "", location_url: "" } : { location: value })} />
                  <span><strong>{label}</strong><span>{description}</span></span>
                </label>)}
            </fieldset>
            {details.location === "other" && <div className="stack">{input("venue_name", "Nama tempat")}{input("address", "Alamat", { multiline: true })}{input("location_url", "Tautan Google Maps (opsional)", { type: "url" })}</div>}
            <p className="field-hint">Isi undangan, rundown, dan bagian lain dilengkapi di editor setelah ini. Acara dibuat sebagai draf dan belum terlihat tamu.</p>
          </div>
        </div>}
      </div>

      {start && <footer className={styles.wizardFooter}>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => setStart(null)}><ArrowLeft size={16} aria-hidden="true" /> Ganti templat</Button>
        <Button type="button" disabled={pending} onClick={() => void create()}>{pending ? "Membuat acara…" : "Buat acara"}</Button>
      </footer>}
    </div>
  </div>;
}
