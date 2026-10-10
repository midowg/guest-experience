"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink, Field, Notice } from "@/components/ui";
import { ArrowDown, ArrowUp, ArrowUpRight, Trash2 } from "lucide-react";
import { defaultFraming } from "@/lib/hero-framing";
import { HeroPreview } from "./HeroPreview";
import { fromJakartaInput, toJakartaInput } from "@/lib/format";
import type { EventRecord, EventStatus, FeedbackQuestion } from "@/lib/types";
import { eventSchema } from "@/lib/validation";
import { AdminApiError, adminRequest, errorMessage } from "./api";
import { completeSections, heroTextPositionHints, heroTextPositionOptions, hiddenSectionReasons, moveItem, photoGuidance, prepareEvent, sectionLabels } from "./editor-model";
import { PhotoField } from "./PhotoField";
import styles from "./admin.module.css";

type TextKey = "title" | "slug" | "subtitle" | "organizer" | "greeting" | "introduction" | "closing" | "venue_name" | "address" | "location_url" | "arrival_notes" | "review_url" | "venue_image_url" | "venue_image_alt" | "venue_image_credit";
type TimeKey = "starts_at" | "ends_at" | "rsvp_closes_at" | "feedback_opens_at";
type BooleanKey = "rsvp_enabled" | "feedback_enabled" | "review_enabled";

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className={styles.toggle}>
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
    <span className={`${styles.toggleSwitch} ${checked ? styles.toggleOn : styles.toggleOff}`}>
      <span className={styles.toggleKnob} />
    </span>
    <span className={styles.toggleText}>{label}</span>
    <span className={`${styles.toggleBadge} ${checked ? styles.toggleBadgeOn : styles.toggleBadgeOff}`}>{checked ? "Aktif" : "Nonaktif"}</span>
  </label>;
}

function OrderButtons({ label, index, length, onMove }: { label: string; index: number; length: number; onMove: (direction: -1 | 1) => void }) {
  return <div className={styles.orderGroup}>
    <button type="button" className={styles.orderBtn} disabled={index === 0} aria-label={`Naikkan ${label}`} onClick={() => onMove(-1)}>
      <ArrowUp size={20} aria-hidden="true" />
      <span className={styles.orderBtnText}>Naik</span>
    </button>
    <button type="button" className={styles.orderBtn} disabled={index === length - 1} aria-label={`Turunkan ${label}`} onClick={() => onMove(1)}>
      <ArrowDown size={20} aria-hidden="true" />
      <span className={styles.orderBtnText}>Turun</span>
    </button>
  </div>;
}

export function EventEditor({ event: initialEvent }: { event: EventRecord }) {
  const router = useRouter();
  const [event, setEvent] = useState(() => completeSections(initialEvent));
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const errorSummary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => { if (error) errorSummary.current?.focus(); }, [error, errors]);
  function update<K extends keyof EventRecord>(key: K, value: EventRecord[K]) {
    setEvent(current => ({ ...current, [key]: value })); setDirty(true); setMessage("");
  }
  function described(name: string, hint?: string) { return [hint ? `${name}-hint` : "", errors[name] ? `${name}-error` : ""].filter(Boolean).join(" ") || undefined; }
  function control(name: string, label: string, value: string, onChange: (value: string) => void, options: { multiline?: boolean; hint?: string; type?: "text" | "url" | "datetime-local"; maxLength?: number } = {}) {
    const props = { id: name, value, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value), "aria-describedby": described(name, options.hint), "aria-invalid": !!errors[name], maxLength: options.maxLength };
    return <Field name={name} label={label} hint={options.hint} error={errors[name]?.join(" ")}>{options.multiline ? <textarea {...props} className="textarea" rows={4} /> : <input {...props} className="input" type={options.type || "text"} />}</Field>;
  }
  function text(key: TextKey, label: string, maxLength: number, multiline = false, hint?: string) {
    return control(key, label, event[key], value => update(key, value), { multiline, maxLength, hint, type: key.endsWith("_url") ? "url" : "text" });
  }
  function time(key: TimeKey, label: string, hint?: string) {
    return control(key, label, toJakartaInput(event[key]), value => update(key, fromJakartaInput(value) || (key === "starts_at" ? "" : null)), { type: "datetime-local", hint });
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
  function block(id: string, title: string, children: ReactNode) { return <section id={id} className={styles.block}><h2>{title}</h2>{children}</section>; }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (pending) return;
    setError(""); setErrors({}); setMessage("");
    const payload = prepareEvent(event);
    const parsed = eventSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) { const key = issue.path.join("."); (next[key] ||= []).push(issue.message); }
      setErrors(next); setError("Periksa isian berikut. Perubahan belum disimpan."); return;
    }
    if (payload.status === "published" && !window.confirm("Simpan dan publikasikan perubahan ini? Undangan akan dapat dibuka oleh siapa pun yang memiliki tautannya.")) return;
    setPending(true);
    try {
      const result = await adminRequest<EventRecord>(`/api/admin/events/${event.id}`, { method: "PUT", body: JSON.stringify(parsed.data) });
      if (!result.data) throw new Error("Missing saved event");
      setEvent(completeSections(result.data)); setDirty(false); setMessage(result.message || "Perubahan tersimpan."); router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) { setError(errorMessage(err)); if (err instanceof AdminApiError) setErrors(err.fieldErrors || {}); }
    finally { setPending(false); }
  }
  const hidden = hiddenSectionReasons(event);
  const photoHelp = <div className={styles.photoGuide}><h3>Panduan ukuran foto</h3><ul>{photoGuidance.map(line => <li key={line}>{line}</li>)}</ul></div>;
  return <form className={styles.form} onSubmit={save} noValidate aria-busy={pending}>
    <Notice>Pratinjau pembuka mengikuti isian saat ini. Preview tersimpan menampilkan versi terakhir yang disimpan. Semua waktu di editor menggunakan WIB (Asia/Jakarta). {dirty ? "Ada perubahan yang belum disimpan." : "Tidak ada perubahan lokal yang belum disimpan."}</Notice>
    {error && <div ref={errorSummary} tabIndex={-1} className={styles.errorSummary}><Notice tone="error"><p>{error}</p>{Object.keys(errors).length > 0 && <ul>{Object.entries(errors).map(([key, values]) => <li key={key}><a href={`#${key}`} onClick={e => { const field = document.getElementById(key); if (field) { e.preventDefault(); field.focus(); field.scrollIntoView({ block: "center" }); } }}>{key}: {values.join(" ")}</a></li>)}</ul>}</Notice></div>}
    {message && <Notice tone="success">{message}</Notice>}
    <fieldset disabled={pending} className={styles.fieldset}>
      {block("identity", "Identitas & undangan", <div className="stack">
        {text("title", "Judul acara", 180)}{text("subtitle", "Subjudul", 250)}
        <div className={styles.grid}>{text("slug", "Alamat singkat undangan (slug)", 100, false, "Huruf kecil, angka, dan tanda hubung. Mengubah slug membuat tautan lama tidak berlaku.")}{text("organizer", "Penyelenggara", 250)}</div>
        {text("greeting", "Sapaan", 150)}{text("introduction", "Isi undangan", 5000, true)}{text("closing", "Penutup", 2000, true)}
      </div>)}
      {block("schedule", "Waktu acara", <div className={styles.grid}>{time("starts_at", "Mulai (WIB)")}{time("ends_at", "Selesai (WIB)", "Opsional bila waktu selesai belum ditentukan.")}</div>)}
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
      {block("agenda", "Rundown", <div className="stack">
        <p>Urutan tampilan mengikuti susunan di bawah. Waktu setiap sesi tetap perlu diperiksa.</p>
        {event.agenda.map((item, index) => {
          function change(key: "title" | "description" | "starts_at" | "ends_at", value: string) { update("agenda", event.agenda.map((entry, i) => i === index ? { ...entry, [key]: value } : entry)); }
          return <div className={styles.item} key={item.id}>
            <div className={styles.itemHeader}><h3>Sesi {index + 1}</h3><OrderButtons label={`sesi ${index + 1}`} index={index} length={event.agenda.length} onMove={direction => update("agenda", moveItem(event.agenda, index, direction))} /></div>
            {control(`agenda.${index}.title`, "Judul sesi", item.title, value => change("title", value), { maxLength: 200 })}
            <div className={styles.grid}>{control(`agenda.${index}.starts_at`, "Mulai sesi (WIB)", toJakartaInput(item.starts_at), value => change("starts_at", fromJakartaInput(value) || ""), { type: "datetime-local" })}{control(`agenda.${index}.ends_at`, "Selesai sesi (WIB)", toJakartaInput(item.ends_at), value => change("ends_at", fromJakartaInput(value) || ""), { type: "datetime-local" })}</div>
            {control(`agenda.${index}.description`, "Keterangan sesi", item.description, value => change("description", value), { multiline: true, maxLength: 1500 })}
            <Button type="button" variant="danger" onClick={() => { if (window.confirm("Hapus sesi ini dari draft editor?")) update("agenda", event.agenda.filter(entry => entry.id !== item.id)); }}><Trash2 size={17} aria-hidden="true" /><span>Hapus sesi {index + 1}</span></Button>
          </div>;
        })}
        {!event.agenda.length && <p>Rundown belum tersedia.</p>}
        <Button type="button" variant="secondary" disabled={event.agenda.length >= 100} onClick={() => update("agenda", [...event.agenda, { id: crypto.randomUUID(), starts_at: "", ends_at: "", title: "", description: "", sort_order: event.agenda.length }])}>Tambah sesi</Button>
      </div>)}
      {block("venue", "Lokasi", <div className="stack">
        {text("venue_name", "Nama tempat", 200)}{text("address", "Alamat", 1000, true)}{text("location_url", "Tautan lokasi HTTPS", 8000)}{text("arrival_notes", "Petunjuk kedatangan", 2000, true)}
      </div>)}
      {block("gallery", "Galeri foto lokasi Werkudara (tampil di bawah peta)", <div className="stack">
        <p>Foto-foto di sini tampil di bagian Lokasi, di bawah tombol Maps dan petunjuk lokasi. Satu foto ditampilkan diam; dua foto atau lebih bergantian otomatis dan dapat dihentikan tamu. Baris foto yang benar-benar kosong dilewati saat menyimpan; jika sudah diisi keterangannya, tambahkan foto dengan tautan HTTPS atau hapus baris tersebut.</p>
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
      {block("sections", "Urutan & tampilan bagian", <div className="stack"><p>Sambutan dan penutup tetap berada di awal dan akhir undangan. Bagian pendukung dapat disembunyikan atau diurutkan.</p>
        {event.sections.map((section, index) => <div className={styles.sectionRow} key={section.key}><Check label={sectionLabels[section.key]} checked={section.enabled} onChange={enabled => update("sections", event.sections.map(item => item.key === section.key ? { ...item, enabled } : item))} /><OrderButtons label={sectionLabels[section.key]} index={index} length={event.sections.length} onMove={direction => update("sections", moveItem(event.sections, index, direction))} /></div>)}
      </div>)}
      {block("rsvp", "Penerimaan RSVP", <div className="stack"><p>RSVP adalah konfirmasi kehadiran tamu (dari bahasa Prancis, <i lang="fr">répondez s&apos;il vous plaît</i>). Formulir ini memungkinkan tamu mengabari panitia apakah mereka dapat hadir.</p>{toggle("rsvp_enabled", "Aktifkan penerimaan konfirmasi kehadiran")}{time("rsvp_closes_at", "Batas RSVP (WIB)", "Kosongkan jika tidak ada batas waktu. Bagian RSVP juga harus ditampilkan agar formulir terlihat.")}</div>)}
      {block("feedback_questions", "Survei feedback", <div className="stack">
        {toggle("feedback_enabled", "Aktifkan survei feedback")}{time("feedback_opens_at", "Mulai menerima feedback (WIB)", "Kosongkan agar tersedia setelah diaktifkan dan dipublikasikan.")}
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
        {text("review_url", "Tautan ulasan Google HTTPS", 8000, false, "Opsional. Tersedia untuk semua tamu tanpa menyaring skor feedback. Nonaktifkan pilihan di atas dan simpan untuk menyembunyikan tombol.")}
        {/^https:\/\/[^\s/]+/.test(event.review_url) && <ButtonLink variant="secondary" href={event.review_url} target="_blank" rel="noopener noreferrer">Periksa tautan <ArrowUpRight size={17} aria-hidden="true" /><span className="sr-only"> (tab baru)</span></ButtonLink>}
      </div>)}
      {block("publication", "Status & penyimpanan", <div className="stack">
        <Field name="status" label="Status acara" hint="Draft dan arsip tidak tampil di URL undangan publik. Semua perubahan berlaku setelah disimpan."><select className="select" id="status" aria-describedby="status-hint" value={event.status} onChange={e => update("status", e.target.value as EventStatus)}><option value="draft">Draft — belum publik</option><option value="published">Dipublikasikan — dapat dibuka melalui tautan</option><option value="archived">Diarsipkan — tidak publik</option></select></Field>
        {hidden.length > 0 && <div><h3>Bagian yang belum ditampilkan</h3><Notice tone="warning"><ul>{hidden.map(reason => <li key={reason}>{reason}</li>)}</ul></Notice></div>}
        <p>Publikasi memerlukan penyelenggara, isi undangan, nama tempat, alamat, serta tautan lokasi. Draft tidak harus melengkapi seluruh isian publikasi.</p>
        <div className={styles.actions}><Button type="submit">{pending ? "Menyimpan…" : event.status === "published" ? "Simpan & publikasikan" : "Simpan perubahan"}</Button><span className="muted">{dirty ? "Perubahan belum disimpan" : "Versi tersimpan"}</span></div>
      </div>)}
    </fieldset>
  </form>;
}
