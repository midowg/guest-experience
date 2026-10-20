"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button, Field, Notice } from "@/components/ui";
import type { EventRecord, RsvpRecord } from "@/lib/types";
import { feedbackSchema, rsvpSchema } from "@/lib/validation";
import { feedbackErrors, feedbackIsOpen, firstErrors, postSubmission, rsvpIsOpen, submissionIdentity, type FieldErrors, type RetryIdentity } from "./form-utils";
import styles from "./guest.module.css";

function useSubmission() {
  const identity = useRef<RetryIdentity | null>(null);
  const locked = useRef(false);
  const summary = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  function fail(message: string, errors: FieldErrors = {}) {
    setErrors(errors);
    setMessage(message);
    requestAnimationFrame(() => summary.current?.focus());
  }
  async function send(url: string, payload: Record<string, unknown>, onSaved?: () => void) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setMessage("");
    setErrors({});
    try {
      identity.current = submissionIdentity(payload, identity.current, () => crypto.randomUUID());
      const result = await postSubmission(url, { ...payload, idempotency_key: identity.current.key });
      if (!result.ok) fail(result.message, firstErrors(result.fieldErrors));
      else {
        setSaved(true);
        onSaved?.();
        requestAnimationFrame(() => summary.current?.focus());
      }
    } catch {
      fail("Pengiriman belum dapat dilakukan. Gunakan browser terbaru dengan koneksi HTTPS, lalu coba kembali.");
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  // `summary` is returned separately: bundling a ref into the state object makes every
  // property read on that object count as a ref access during render.
  return { state: { pending, saved, errors, message }, summary, fail, send };
}
type SummaryRef = ReturnType<typeof useSubmission>["summary"];

function currentTime() { return new Date().getTime(); }

function Honeypot({ prefix }: { prefix: string }) {
  return <div className={styles.honeypot} aria-hidden="true"><label htmlFor={`${prefix}-website`}>Jangan isi kolom ini<input id={`${prefix}-website`} name="website" tabIndex={-1} autoComplete="off" /></label></div>;
}

function ErrorSummary({ summary, state, prefix }: { summary: SummaryRef; state: { message: string; errors: FieldErrors }; prefix: string }) {
  const { message, errors } = state;
  return <div ref={summary} tabIndex={-1} className={styles.formStatus}>
    {message && <Notice tone="error"><p>{message}</p>{Object.keys(errors).length > 0 && <ul>{Object.entries(errors).map(([key, error]) => <li key={key}><a href={`#${prefix}-${key}`}>{error}</a></li>)}</ul>}</Notice>}
  </div>;
}

export function RsvpForm({ event, disabled, onSaved, invitation }: { event: EventRecord; disabled: boolean; onSaved: () => void; invitation?: { name: string; token: string; rsvp: RsvpRecord | null } }) {
  const { state, summary, fail, send } = useSubmission();
  const { pending, saved, errors } = state;
  const [currentRsvp, setCurrentRsvp] = useState(invitation?.rsvp ?? null);
  const [attendance, setAttendance] = useState(invitation?.rsvp?.attendance ?? "yes");
  const [allergy, setAllergy] = useState(invitation?.rsvp?.has_allergy ?? false);
  const field = (name: string, label: string, control: ReactNode, hint?: string) => <Field name={`rsvp-${name}`} label={label} error={errors[name]} hint={hint}>{control}</Field>;
  const a11y = (name: string, hint = false) => ({ id: `rsvp-${name}`, "aria-invalid": !!errors[name], "aria-describedby": [hint ? `rsvp-${name}-hint` : "", errors[name] ? `rsvp-${name}-error` : ""].filter(Boolean).join(" ") || undefined });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled || pending || saved) return;
    if (!rsvpIsOpen(event, currentTime())) return fail("Konfirmasi kehadiran sudah ditutup.");
    const data = new FormData(e.currentTarget);
    const result = rsvpSchema.safeParse({ name: data.get("name"), organization: data.get("organization"), attendance: data.get("attendance"), phone: data.get("phone"), email: data.get("email"), has_allergy: data.get("has_allergy") === "yes", allergy_details: data.get("allergy_details") ?? "", consent: data.get("consent") === "yes", website: data.get("website") ?? "", idempotency_key: "00000000-0000-4000-8000-000000000000" });
    if (!result.success) return fail("Periksa kembali isian yang ditandai.", Object.fromEntries(result.error.issues.map(issue => [String(issue.path[0]), issue.message])));
    const { idempotency_key: ignored, ...payload } = result.data;
    void ignored;
    await send(invitation ? `/api/events/${encodeURIComponent(event.slug)}/i/${encodeURIComponent(invitation.token)}/rsvp` : `/api/events/${encodeURIComponent(event.slug)}/rsvp`, payload, () => {
      if (invitation) setCurrentRsvp({ ...(currentRsvp ?? { id: "", event_id: event.id, created_at: new Date().toISOString() }), ...result.data, updated_at: new Date().toISOString() });
      onSaved();
    });
  }
  if (saved) return <div ref={summary} tabIndex={-1}><Notice tone="success"><h3>Konfirmasi Anda tersimpan.</h3><p>Terima kasih. Jawaban ini merupakan RSVP, bukan pencatatan kehadiran di lokasi.</p></Notice>{invitation ? <p className={styles.privacy}>Buka kembali tautan ini untuk memuat dan memperbarui jawaban sampai batas RSVP.</p> : <p className={styles.privacy}>Jawaban tidak disimpan di browser. Setelah halaman dimuat ulang, status pengiriman tidak ditampilkan kembali.</p>}</div>;
  return <form onSubmit={submit} noValidate aria-label="Konfirmasi kehadiran" aria-busy={pending} className={styles.form}>
    <ErrorSummary summary={summary} state={state} prefix="rsvp" />
    {invitation && <Notice>{currentRsvp ? "Jawaban sebelumnya telah dimuat. Anda dapat mengubahnya sampai batas RSVP." : "Tautan ini khusus untuk undangan Anda. RSVP ini bukan check-in di lokasi."} Siapa pun yang memiliki tautan ini dapat melihat dan memperbarui jawaban; jangan bagikan sembarangan.</Notice>}
    <fieldset disabled={disabled || pending} className={styles.fields}>
      <legend className="sr-only">Data konfirmasi kehadiran</legend>
      <div className={styles.formGrid}>
        {field("name", "Nama lengkap", <input {...a11y("name")} className="input" name="name" autoComplete="name" defaultValue={invitation?.rsvp?.name ?? invitation?.name ?? ""} required minLength={2} maxLength={150} />)}
        {field("organization", "Instansi / komunitas", <input {...a11y("organization")} className="input" name="organization" autoComplete="organization" defaultValue={invitation?.rsvp?.organization ?? ""} required maxLength={200} />)}
      </div>
      <fieldset id="rsvp-attendance" className={styles.choiceGroup} aria-describedby={errors.attendance ? "rsvp-attendance-error" : undefined}>
        <legend>Apakah Anda akan hadir?</legend>
        <div className={styles.choices}><label><input type="radio" name="attendance" value="yes" checked={attendance === "yes"} onChange={() => setAttendance("yes")} /> Ya, saya akan hadir</label><label><input type="radio" name="attendance" value="no" checked={attendance === "no"} onChange={() => setAttendance("no")} /> Belum dapat hadir</label></div>
        {errors.attendance && <p id="rsvp-attendance-error" className="field-error">{errors.attendance}</p>}
      </fieldset>
      <div className={styles.formGrid}>
        {field("phone", "Nomor HP (opsional)", <input {...a11y("phone")} className="input" name="phone" type="tel" autoComplete="tel" defaultValue={invitation?.rsvp?.phone ?? ""} maxLength={30} />)}
        {field("email", "Email (opsional)", <input {...a11y("email")} className="input" name="email" type="email" autoComplete="email" defaultValue={invitation?.rsvp?.email ?? ""} maxLength={254} />)}
      </div>
      {attendance === "yes" && <>
        <fieldset id="rsvp-has_allergy" className={styles.choiceGroup}>
          <legend>Apakah ada alergi makanan?</legend>
          <div className={styles.choices}><label><input type="radio" name="has_allergy" value="no" checked={!allergy} onChange={() => setAllergy(false)} /> Tidak ada</label><label><input type="radio" name="has_allergy" value="yes" checked={allergy} onChange={() => setAllergy(true)} /> Ada</label></div>
        </fieldset>
        {allergy && field("allergy_details", "Alergi yang perlu diperhatikan", <textarea {...a11y("allergy_details", true)} className="textarea" name="allergy_details" rows={3} defaultValue={invitation?.rsvp?.allergy_details ?? ""} maxLength={1000} required />, "Sebutkan hanya informasi yang diperlukan untuk persiapan konsumsi.")}
      </>}
      <div>
        <label className={styles.consent}><input {...a11y("consent", true)} type="checkbox" name="consent" value="yes" required /><span>Saya menyetujui penggunaan data ini oleh panitia untuk koordinasi acara dan kebutuhan konsumsi.</span></label>
        <p id="rsvp-consent-hint" className={styles.privacy}>Kontak bersifat opsional. Jawaban dan informasi alergi hanya dapat dilihat panitia melalui panel admin yang dilindungi password.</p>
        {errors.consent && <p id="rsvp-consent-error" className="field-error">{errors.consent}</p>}
      </div>
      <Honeypot prefix="rsvp" />
      <Button type="submit" disabled={disabled || pending}>{pending ? "Menyimpan konfirmasi…" : currentRsvp ? "Perbarui konfirmasi" : "Kirim konfirmasi"}</Button>
    </fieldset>
    <span role="status" className="sr-only">{pending ? "Konfirmasi sedang dikirim." : ""}</span>
  </form>;
}

export function FeedbackForm({ event, disabled }: { event: EventRecord; disabled: boolean }) {
  const { state, summary, fail, send } = useSubmission();
  const { pending, saved, errors } = state;
  const questions = [...event.feedback_questions].sort((a, b) => a.sort_order - b.sort_order);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled || pending || saved) return;
    if (!feedbackIsOpen(event, currentTime())) return fail("Survei belum menerima jawaban saat ini.");
    const data = new FormData(e.currentTarget);
    const answers = questions.map(q => ({ question_id: q.id, value: String(data.get(q.id) ?? "").trim() }));
    const errors = feedbackErrors(questions, answers);
    if (Object.keys(errors).length) return fail("Periksa jawaban yang ditandai.", errors);
    const result = feedbackSchema.safeParse({ answers, website: data.get("website") ?? "", idempotency_key: "00000000-0000-4000-8000-000000000000" });
    if (!result.success) return fail("Periksa kembali jawaban Anda sebelum mengirim.");
    await send(`/api/events/${encodeURIComponent(event.slug)}/feedback`, { answers: result.data.answers, website: result.data.website });
  }
  if (saved) return <div ref={summary} tabIndex={-1}><Notice tone="success"><h3>Masukan Anda tersimpan.</h3><p>Terima kasih telah berbagi pengalaman.</p></Notice></div>;
  return <form onSubmit={submit} noValidate aria-label="Survei pengalaman tamu" aria-busy={pending} className={styles.form}>
    <ErrorSummary summary={summary} state={state} prefix="feedback" />
    <fieldset disabled={disabled || pending} className={styles.fields}>
      <legend className="sr-only">Pertanyaan pengalaman tamu</legend>
      {questions.map((q, index) => {
        const id = `feedback-${q.id}`;
        const error = errors[q.id] ?? errors[`answers.${index}.value`];
        const props = { id, name: q.id, required: q.required, "aria-invalid": !!error, "aria-describedby": error ? `${id}-error` : undefined };
        return <Field key={q.id} name={id} label={`${q.label}${q.required ? " (wajib)" : " (opsional)"}`} error={error}>
          {q.kind === "text" ? <textarea {...props} className="textarea" rows={4} maxLength={3000} /> : <select {...props} className="select" defaultValue=""><option value="">Pilih jawaban</option>{(q.kind === "rating" ? ["1", "2", "3", "4", "5"] : q.options).map(value => <option key={value} value={value}>{value}</option>)}</select>}
        </Field>;
      })}
      <Honeypot prefix="feedback" />
      <p className={styles.privacy}>Survei tidak meminta nama atau kontak dan tidak dikaitkan dengan RSVP. Hindari menulis data pribadi di jawaban Anda.</p>
      <Button type="submit" disabled={disabled || pending}>{pending ? "Menyimpan masukan…" : "Kirim masukan"}</Button>
    </fieldset>
    <span role="status" className="sr-only">{pending ? "Masukan sedang dikirim." : ""}</span>
  </form>;
}
