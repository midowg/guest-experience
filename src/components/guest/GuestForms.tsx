"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, CircleCheck, ClipboardCheck, MessageSquareHeart, Minus, Pencil, Plus, Ticket, X } from "lucide-react";
import { Button, ButtonLink, Field, Notice } from "@/components/ui";
import type { AccessNeed, Dietary, EventRecord, RsvpRecord } from "@/lib/types";
import { feedbackSchema, rsvpSchema } from "@/lib/validation";
import type { WordKey } from "@/lib/wording";
import { feedbackErrors, feedbackIsOpen, firstErrors, postSubmission, rsvpIsOpen, submissionIdentity, type FieldErrors, type RetryIdentity } from "./form-utils";
import { useWording } from "./language";
import styles from "./guest.module.css";
import { guestApi, ticketPath } from "@/lib/routes";

function currentTime() { return new Date().getTime(); }

/** Retry-safe sending: the same answers reuse one idempotency key, changed answers get a new one. */
export function useSender() {
  const identity = useRef<RetryIdentity | null>(null);
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  async function send(url: string, payload: Record<string, unknown>) {
    if (locked.current) return null;
    locked.current = true; setPending(true);
    try {
      identity.current = submissionIdentity(payload, identity.current, () => crypto.randomUUID());
      return await postSubmission(url, { ...payload, idempotency_key: identity.current.key });
    } finally { locked.current = false; setPending(false); }
  }
  return { pending, send };
}

/**
 * The form opens in a sheet: from the bottom on a phone, as a dialog on a larger screen. Esc and
 * the close button return focus to whatever opened it.
 */
export function GuestSheet({ title, step, onClose, children, footer }: { title: string; step?: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  const { t } = useWording();
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    opener.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); (opener.current as HTMLElement | null)?.focus?.(); };
  }, [onClose]);
  useEffect(() => { heading.current?.focus(); }, [step]);
  return <div className={styles.sheetLayer}>
    <div className={styles.sheetBackdrop} onClick={onClose} aria-hidden="true" />
    <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <header className={styles.sheetHeader}>
        <div>{step && <p className={styles.sheetStep}>{step}</p>}<h2 id="sheet-title" ref={heading} tabIndex={-1}>{title}</h2></div>
        <button type="button" className={styles.sheetClose} onClick={onClose} aria-label={t("button.close")}><X size={18} aria-hidden="true" /></button>
      </header>
      <div className={styles.sheetBody}>{children}</div>
      <footer className={styles.sheetFooter}>{footer}</footer>
    </div>
  </div>;
}

type Answers = {
  attendance: "yes" | "no" | null; party_size: number; companion_names: string[];
  name: string; organization: string; phone: string; email: string; whatsapp_consent: boolean;
  dietary: Dietary[]; allergy_details: string; dietary_other: string; access: AccessNeed[]; access_other: string;
  photo_opt_out: boolean; consent: boolean;
};
type Invitation = { name: string; token: string; short_token?: string | null; rsvp: RsvpRecord | null; party_size_max?: number };

function answersFrom(rsvp: RsvpRecord | null, invitee?: string): Answers {
  return {
    attendance: rsvp?.attendance ?? null, party_size: rsvp?.party_size ?? 1, companion_names: rsvp?.companion_names ?? [],
    name: rsvp?.name ?? invitee ?? "", organization: rsvp?.organization ?? "", phone: rsvp?.phone ?? "", email: rsvp?.email ?? "",
    whatsapp_consent: rsvp?.whatsapp_consent ?? false,
    dietary: rsvp?.dietary ?? (rsvp?.has_allergy ? ["allergy"] : []), allergy_details: rsvp?.allergy_details ?? "",
    dietary_other: rsvp?.dietary_other ?? "", access: rsvp?.access ?? [], access_other: rsvp?.access_other ?? "",
    photo_opt_out: rsvp?.photo_opt_out ?? false, consent: false,
  };
}

const dietaryLabels: Record<Dietary, WordKey> = { vegetarian: "need.vegetarian", allergy: "need.allergy", other: "need.other" };
const accessLabels: Record<AccessNeed, WordKey> = { wheelchair: "need.wheelchair", companion: "need.companion", sign_interpreter: "need.interpreter", other: "need.other" };
type Step = "attend" | "details" | "needs" | "review";
const stepFields: Record<Step, string[]> = {
  attend: ["attendance", "party_size", "companion_names"],
  details: ["name", "organization", "phone", "email"],
  needs: ["allergy_details", "dietary_other", "access_other", "dietary", "access"],
  review: ["consent", "form"],
};

/**
 * The RSVP card and its four-step sheet (board 10). `needs` is false until migration
 * 202610200004 exists: the needs step then asks only about food allergies, as before.
 */
export function RsvpPanel({ event, disabled, onSaved, invitation, needs = true, tickets = true }: { event: EventRecord; disabled: boolean; onSaved: (rsvp: RsvpRecord) => void; invitation?: Invitation; needs?: boolean; tickets?: boolean }) {
  const { t } = useWording();
  const { pending, send } = useSender();
  const [saved, setSaved] = useState<RsvpRecord | null>(invitation?.rsvp ?? null);
  const [justSaved, setJustSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Answers>(() => answersFrom(invitation?.rsvp ?? null, invitation?.name));
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const maxCompanions = needs && invitation ? Math.max(0, (invitation.party_size_max ?? 1) - 1) : 0;
  const steps: Step[] = answers.attendance === "no" ? ["attend", "details", "review"] : ["attend", "details", "needs", "review"];
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const set = (patch: Partial<Answers>) => { setAnswers(current => ({ ...current, ...patch })); setErrors({}); setMessage(""); };
  const toggle = <T extends string>(list: T[], value: T) => list.includes(value) ? list.filter(item => item !== value) : [...list, value];

  function start() { setAnswers(answersFrom(saved, invitation?.name)); setStepIndex(0); setErrors({}); setMessage(""); setOpen(true); }

  function stepErrors(which: Step): FieldErrors {
    const e: FieldErrors = {};
    if (which === "attend" && !answers.attendance) e.attendance = t("form.error.required");
    if (which === "details") {
      if (answers.name.trim().length < 2) e.name = t("form.error.name");
      if (!answers.organization.trim()) e.organization = t("form.error.organization");
      if (answers.phone.trim() && !/^[+\d\s().-]{6,30}$/.test(answers.phone.trim())) e.phone = t("form.error.fields");
      if (answers.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.email.trim())) e.email = t("form.error.fields");
    }
    if (which === "needs") {
      if (answers.dietary.includes("allergy") && !answers.allergy_details.trim()) e.allergy_details = t("form.error.allergy");
      if (answers.dietary.includes("other") && !answers.dietary_other.trim()) e.dietary_other = t("form.error.other");
      if (answers.access.includes("other") && !answers.access_other.trim()) e.access_other = t("form.error.other");
    }
    if (which === "review" && !answers.consent) e.consent = t("form.error.consent");
    return e;
  }
  function show(found: FieldErrors) {
    setErrors(found);
    requestAnimationFrame(() => document.getElementById(`rsvp-${Object.keys(found)[0]}`)?.focus());
  }
  function next() {
    const found = stepErrors(step);
    if (Object.keys(found).length) return show(found);
    setStepIndex(index => Math.min(index + 1, steps.length - 1));
  }
  async function submit() {
    if (disabled || pending) return;
    const found = stepErrors("review");
    if (Object.keys(found).length) return show(found);
    if (!rsvpIsOpen(event, currentTime())) { setMessage(t("rsvp.closedNow")); return; }
    const attending = answers.attendance === "yes";
    const parsed = rsvpSchema.safeParse({
      name: answers.name, organization: answers.organization, attendance: answers.attendance, phone: answers.phone, email: answers.email,
      has_allergy: attending && answers.dietary.includes("allergy"), allergy_details: answers.allergy_details,
      ...(needs ? {
        party_size: attending ? answers.party_size : 1, companion_names: answers.companion_names,
        dietary: answers.dietary, dietary_other: answers.dietary_other, access: answers.access, access_other: answers.access_other,
        photo_opt_out: answers.photo_opt_out, whatsapp_consent: !!answers.phone.trim() && answers.whatsapp_consent,
      } : {}),
      consent: answers.consent, website: "", idempotency_key: "00000000-0000-4000-8000-000000000000",
    });
    if (!parsed.success) {
      const found: FieldErrors = Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0] ?? "form"), issue.message]));
      const first = steps.findIndex(s => stepFields[s].some(field => field in found));
      if (first >= 0) setStepIndex(first);
      return show(found);
    }
    const { idempotency_key: ignored, ...payload } = parsed.data;
    void ignored;
    // Older databases only understand the allergy pair; extra keys would be ignored, not stored.
    const body = needs ? payload : { name: payload.name, organization: payload.organization, attendance: payload.attendance, phone: payload.phone, email: payload.email, has_allergy: payload.has_allergy, allergy_details: payload.allergy_details, consent: payload.consent, website: payload.website };
    const result = await send(guestApi.rsvp(event, invitation), body);
    if (!result) return;
    if (!result.ok) {
      const found = firstErrors(result.fieldErrors);
      const first = steps.findIndex(s => stepFields[s].some(field => field in found));
      if (first >= 0) setStepIndex(first);
      setMessage(result.message || t("form.error.network"));
      if (Object.keys(found).length) show(found);
      return;
    }
    const now = new Date().toISOString();
    const record: RsvpRecord = { ...(saved ?? { id: result.data?.id ?? "", event_id: event.id, created_at: now }), ...payload, updated_at: now };
    setSaved(record);
    setJustSaved(true); setOpen(false); onSaved(record);
  }

  const fieldProps = (name: string, hint = false) => ({ id: `rsvp-${name}`, "aria-invalid": !!errors[name], "aria-describedby": [hint ? `rsvp-${name}-hint` : "", errors[name] ? `rsvp-${name}-error` : ""].filter(Boolean).join(" ") || undefined });
  const input = (name: "name" | "organization" | "phone" | "email", label: WordKey, extra: { type?: string; autoComplete?: string; hint?: WordKey; maxLength: number }) =>
    <Field name={`rsvp-${name}`} label={t(label)} error={errors[name]} hint={extra.hint && t(extra.hint)}>
      <input {...fieldProps(name, !!extra.hint)} className="input" type={extra.type ?? "text"} autoComplete={extra.autoComplete} value={answers[name]} maxLength={extra.maxLength} onChange={e => set({ [name]: e.target.value })} />
    </Field>;
  const checkOption = (checked: boolean, label: string, onChange: () => void, id?: string) =>
    <label className={`${styles.checkOption} ${checked ? styles.checkOptionOn : ""}`.trimEnd()}><input id={id} type="checkbox" checked={checked} onChange={onChange} /><span>{label}</span></label>;
  const detail = (name: "allergy_details" | "dietary_other" | "access_other", label: WordKey) =>
    <Field name={`rsvp-${name}`} label={t(label)} error={errors[name]}><input {...fieldProps(name)} className="input" value={answers[name]} maxLength={name === "allergy_details" ? 1000 : 300} onChange={e => set({ [name]: e.target.value })} /></Field>;

  const needsSummary = (rsvp: Pick<Answers, "dietary" | "access" | "allergy_details" | "dietary_other" | "access_other">) => {
    const parts = [...rsvp.dietary.map(item => item === "allergy" ? `${t("need.allergy")}: ${rsvp.allergy_details}` : item === "other" ? `${t("need.other")}: ${rsvp.dietary_other}` : t(dietaryLabels[item])),
      ...rsvp.access.map(item => item === "other" ? `${t("need.access")}: ${rsvp.access_other}` : t(accessLabels[item]))];
    return parts.length ? parts.join(" · ") : t("rsvp.review.none");
  };

  const body: Record<Step, ReactNode> = {
    attend: <div className={styles.sheetStack}>
      <fieldset className={styles.optionCards} aria-describedby={errors.attendance ? "rsvp-attendance-error" : undefined}>
        <legend className="sr-only">{invitation ? t("rsvp.s1.title", { name: invitation.name }) : t("rsvp.s1.titleOpen")}</legend>
        {(["yes", "no"] as const).map(value => <label key={value} className={`${styles.optionCard} ${answers.attendance === value ? styles.optionCardOn : ""}`.trimEnd()}>
          <input id={value === "yes" ? "rsvp-attendance" : undefined} type="radio" name="rsvp-attendance" checked={answers.attendance === value} onChange={() => set({ attendance: value, ...(value === "no" ? { party_size: 1, companion_names: [] } : {}) })} />
          <span>{t(value === "yes" ? "rsvp.s1.yes" : "rsvp.s1.no")}</span>
        </label>)}
        {errors.attendance && <p id="rsvp-attendance-error" className="field-error">{errors.attendance}</p>}
      </fieldset>
      {answers.attendance === "yes" && maxCompanions > 0 && <fieldset className={styles.partyField}>
        <legend>{t("rsvp.party.label")}</legend>
        <div className={styles.partyStepper}>
          <button type="button" aria-label="−" disabled={answers.party_size <= 1} onClick={() => set({ party_size: answers.party_size - 1, companion_names: answers.companion_names.slice(0, answers.party_size - 2) })}><Minus size={18} aria-hidden="true" /></button>
          <output id="rsvp-party_size" aria-live="polite">{answers.party_size <= 1 ? t("rsvp.party.none") : t("rsvp.party.count", { n: answers.party_size - 1 })}</output>
          <button type="button" aria-label="+" disabled={answers.party_size - 1 >= maxCompanions} onClick={() => set({ party_size: answers.party_size + 1 })}><Plus size={18} aria-hidden="true" /></button>
        </div>
        <p className="field-hint">{t("rsvp.party.hint", { n: maxCompanions })}</p>
        {Array.from({ length: answers.party_size - 1 }, (_, i) => <Field key={i} name={`rsvp-companion-${i}`} label={t("rsvp.companion.name", { n: i + 1 })}>
          <input id={`rsvp-companion-${i}`} className="input" value={answers.companion_names[i] ?? ""} maxLength={150} onChange={e => { const names = [...answers.companion_names]; names[i] = e.target.value; set({ companion_names: names }); }} />
        </Field>)}
      </fieldset>}
    </div>,
    details: <div className={styles.sheetStack}>
      {invitation && <p className={styles.sheetLead}>{t("rsvp.s2.sub")}</p>}
      {input("name", "field.name", { autoComplete: "name", maxLength: 150 })}
      {input("organization", "field.organization", { autoComplete: "organization", maxLength: 200 })}
      {input("phone", "field.phone", { type: "tel", autoComplete: "tel", hint: "field.phone.hint", maxLength: 30 })}
      {needs && answers.phone.trim() && checkOption(answers.whatsapp_consent, t("field.whatsappConsent"), () => set({ whatsapp_consent: !answers.whatsapp_consent }), "rsvp-whatsapp_consent")}
      {input("email", "field.email", { type: "email", autoComplete: "email", maxLength: 254 })}
    </div>,
    needs: <div className={styles.sheetStack}>
      <p className={styles.sheetLead}>{t("rsvp.s3.sub")}</p>
      <fieldset className={styles.needGroup}>
        <legend>{t("need.food")}</legend>
        {(needs ? (["vegetarian", "allergy", "other"] as const) : (["allergy"] as const)).map(item => <div key={item}>
          {checkOption(answers.dietary.includes(item), t(dietaryLabels[item]), () => set({ dietary: toggle(answers.dietary, item) }), `rsvp-dietary-${item}`)}
          {item === "allergy" && answers.dietary.includes("allergy") && detail("allergy_details", "need.allergy.detail")}
          {item === "other" && answers.dietary.includes("other") && detail("dietary_other", "need.other.detail")}
        </div>)}
      </fieldset>
      {needs && <fieldset className={styles.needGroup}>
        <legend>{t("need.access")}</legend>
        {(["wheelchair", "companion", "sign_interpreter", "other"] as const).map(item => <div key={item}>
          {checkOption(answers.access.includes(item), t(accessLabels[item]), () => set({ access: toggle(answers.access, item) }), `rsvp-access-${item}`)}
          {item === "other" && answers.access.includes("other") && detail("access_other", "need.other.detail")}
        </div>)}
      </fieldset>}
      <Button type="button" variant="secondary" onClick={() => { set({ dietary: [], access: [], allergy_details: "", dietary_other: "", access_other: "" }); setStepIndex(steps.indexOf("review")); }}>{t("need.none")}</Button>
    </div>,
    review: <div className={styles.sheetStack}>
      <dl className={styles.reviewList}>
        <div><dt>{t("rsvp.review.attendance")}</dt><dd>{t(answers.attendance === "yes" ? "rsvp.answer.yes" : "rsvp.answer.no")}{answers.attendance === "yes" && answers.party_size > 1 && ` · ${t("rsvp.review.partySize", { n: answers.party_size })}`}</dd><button type="button" onClick={() => setStepIndex(0)}>{t("rsvp.s4.edit")}<span className="sr-only"> {t("rsvp.review.attendance")}</span></button></div>
        <div><dt>{t("rsvp.review.details")}</dt><dd>{[answers.name, answers.organization, answers.phone, answers.email].filter(Boolean).join(" · ")}</dd><button type="button" onClick={() => setStepIndex(1)}>{t("rsvp.s4.edit")}<span className="sr-only"> {t("rsvp.review.details")}</span></button></div>
        {answers.attendance === "yes" && <div><dt>{t("rsvp.review.needs")}</dt><dd>{needsSummary(answers)}</dd><button type="button" onClick={() => setStepIndex(2)}>{t("rsvp.s4.edit")}<span className="sr-only"> {t("rsvp.review.needs")}</span></button></div>}
      </dl>
      <div>
        {checkOption(answers.consent, t("rsvp.consent"), () => set({ consent: !answers.consent }), "rsvp-consent")}
        {errors.consent && <p id="rsvp-consent-error" className="field-error">{errors.consent}</p>}
      </div>
      {needs && answers.attendance === "yes" && checkOption(answers.photo_opt_out, t("rsvp.photoOptOut"), () => set({ photo_opt_out: !answers.photo_opt_out }), "rsvp-photo_opt_out")}
      <p className={styles.privacy}>{t("rsvp.privacy")}</p>
    </div>,
  };
  const titles: Record<Step, string> = {
    attend: invitation ? t("rsvp.s1.title", { name: invitation.name }) : t("rsvp.s1.titleOpen"),
    details: t("rsvp.s2.title"), needs: t("rsvp.s3.title"), review: t("rsvp.s4.title"),
  };

  const done = saved && <div className={styles.rsvpCard} data-rsvp-done>
    <span className={`${styles.rsvpCardIcon} ${styles.rsvpCardIconDone}`} aria-hidden="true"><CircleCheck size={22} /></span>
    <div className={styles.rsvpCardText}>
      <h3>{t(saved.attendance === "yes" ? "rsvp.done.yes" : "rsvp.done.no")}</h3>
      {saved.attendance === "yes" && <p>{(saved.party_size ?? 1) > 1 ? `${t("rsvp.review.partySize", { n: saved.party_size ?? 1 })} · ` : ""}{needsSummary({ dietary: saved.dietary ?? (saved.has_allergy ? ["allergy"] : []), access: saved.access ?? [], allergy_details: saved.allergy_details, dietary_other: saved.dietary_other ?? "", access_other: saved.access_other ?? "" })}</p>}
      <p className={styles.privacy}>{invitation ? t("rsvp.saved.personal") : t("rsvp.saved.open")}</p>
    </div>
    <div className={styles.rsvpDoneActions}>
      {tickets && invitation && saved.attendance === "yes" && <ButtonLink href={ticketPath(event, invitation)}><Ticket size={16} aria-hidden="true" /> {t("ticket.view")}</ButtonLink>}
      {invitation && !disabled && <Button type="button" variant="secondary" onClick={start}><Pencil size={16} aria-hidden="true" /> {t("rsvp.done.edit")}</Button>}
    </div>
  </div>;

  return <div className={styles.rsvpPanel}>
    {justSaved && <p role="status" className="sr-only">{t(saved?.attendance === "yes" ? "rsvp.done.yes" : "rsvp.done.no")}</p>}
    {done || <div className={styles.rsvpCard}>
      <span className={styles.rsvpCardIcon} aria-hidden="true"><ClipboardCheck size={22} /></span>
      <div className={styles.rsvpCardText}>
        <h3>{t("rsvp.card.title")}</h3>
        <p>{t("rsvp.card.meta")}</p>
        {invitation && <p className={styles.privacy}>{t("rsvp.personal.note")}</p>}
      </div>
      <Button type="button" onClick={start}>{t("rsvp.card.start")}</Button>
    </div>}
    {open && <GuestSheet title={titles[step]} step={t("rsvp.step", { n: stepIndex + 1, total: steps.length })} onClose={() => setOpen(false)} footer={<>
      {stepIndex > 0 && <Button type="button" variant="secondary" onClick={() => setStepIndex(stepIndex - 1)}>{t("button.back")}</Button>}
      {step === "review"
        ? <Button type="button" disabled={disabled || pending} onClick={() => void submit()}>{pending ? t("form.sending") : t("button.send")}</Button>
        : <Button type="button" onClick={next}>{t("button.next")}</Button>}
    </>}>
      {message && <Notice tone="error">{message}</Notice>}
      {Object.keys(errors).length > 0 && !message && <p className="sr-only" role="alert">{t("form.error.fields")}</p>}
      {body[step]}
      <span role="status" className="sr-only">{pending ? t("form.sending") : ""}</span>
    </GuestSheet>}
  </div>;
}

/** The anonymous survey, as a card that opens the questions in a sheet. */
export function FeedbackPanel({ event, disabled }: { event: EventRecord; disabled: boolean }) {
  const { t } = useWording();
  const { pending, send } = useSender();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const questions = [...event.feedback_questions].sort((a, b) => a.sort_order - b.sort_order);
  async function submit() {
    if (disabled || pending) return;
    if (!feedbackIsOpen(event, currentTime())) { setMessage(t("feedback.closedNow")); return; }
    const answers = questions.map(q => ({ question_id: q.id, value: (values[q.id] ?? "").trim() }));
    const found = feedbackErrors(questions, answers);
    for (const key of Object.keys(found)) found[key] = questions.find(q => q.id === key)?.kind === "rating" && values[key] ? t("feedback.rating") : t("form.error.required");
    if (Object.keys(found).length) { setErrors(found); requestAnimationFrame(() => document.getElementById(`feedback-${Object.keys(found)[0]}`)?.focus()); return; }
    const parsed = feedbackSchema.safeParse({ answers, website: "", idempotency_key: "00000000-0000-4000-8000-000000000000" });
    if (!parsed.success) { setMessage(t("form.error.fields")); return; }
    const result = await send(guestApi.feedback(event), { answers: parsed.data.answers, website: "" });
    if (!result) return;
    if (!result.ok) { setMessage(result.message || t("form.error.network")); setErrors(firstErrors(result.fieldErrors)); return; }
    setSaved(true); setOpen(false);
  }
  if (saved) return <div className={styles.rsvpCard} role="status">
    <span className={`${styles.rsvpCardIcon} ${styles.rsvpCardIconDone}`} aria-hidden="true"><Check size={22} /></span>
    <div className={styles.rsvpCardText}><h3>{t("feedback.done")}</h3></div>
  </div>;
  return <>
    <div className={styles.rsvpCard}>
      <span className={styles.rsvpCardIcon} aria-hidden="true"><MessageSquareHeart size={22} /></span>
      <div className={styles.rsvpCardText}><h3>{t("feedback.title")}</h3><p>{t("feedback.card.meta")}</p></div>
      <Button type="button" onClick={() => setOpen(true)}>{t("feedback.card.start")}</Button>
    </div>
    {open && <GuestSheet title={t("feedback.title")} onClose={() => setOpen(false)} footer={<Button type="button" disabled={disabled || pending} onClick={() => void submit()}>{pending ? t("form.sending") : t("feedback.send")}</Button>}>
      {message && <Notice tone="error">{message}</Notice>}
      <p className={styles.privacy}>{t("feedback.privacy")}</p>
      <div className={styles.sheetStack}>
        {questions.map(q => {
          const id = `feedback-${q.id}`;
          const error = errors[q.id];
          const props = { id, value: values[q.id] ?? "", onChange: (e: { target: { value: string } }) => { setValues(v => ({ ...v, [q.id]: e.target.value })); setErrors({}); }, "aria-invalid": !!error, "aria-describedby": error ? `${id}-error` : undefined };
          return <Field key={q.id} name={id} label={`${q.label} ${t(q.required ? "feedback.required" : "feedback.optional")}`} error={error}>
            {q.kind === "text" ? <textarea {...props} className="textarea" rows={4} maxLength={3000} />
              : <select {...props} className="select"><option value="">{t("feedback.choose")}</option>{(q.kind === "rating" ? ["1", "2", "3", "4", "5"] : q.options).map(value => <option key={value} value={value}>{value}</option>)}</select>}
          </Field>;
        })}
      </div>
      <span role="status" className="sr-only">{pending ? t("form.sending") : ""}</span>
    </GuestSheet>}
  </>;
}
