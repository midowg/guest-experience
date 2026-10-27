"use client";

import { useState } from "react";
import { CalendarDays, Check, Clock3, MapPin, Minus, Pencil, Plus, Send, UserRound, Users } from "lucide-react";
import { Button, ButtonLink, Field, Notice } from "@/components/ui";
import { guestApi } from "@/lib/routes";
import type { Dietary, EventRecord, RsvpRecord } from "@/lib/types";
import { rsvpSchema } from "@/lib/validation";
import type { VisitKey } from "@/lib/wording/visit";
import { CalendarButton } from "./CalendarSheet";
import { TimeRange } from "./InvitationHero";
import { firstErrors, rsvpIsOpen, type FieldErrors } from "./form-utils";
import { useSender } from "./GuestForms";
import { useWording } from "./language";
import styles from "./visit.module.css";

/*
 * The office visit's confirmation on one screen (board 11, screens 3a, 3b and 4): who is coming,
 * whether others come along, and any special needs. Sending is the agreement to the line above
 * the button; there is no separate consent box. Declining is a quiet second button.
 */

type Need = "vegetarian" | "allergy" | "wheelchair" | "other";
type Invitation = { name: string; token: string; short_token?: string | null; rsvp: RsvpRecord | null; party_size_max?: number };
type Words = (key: VisitKey, vars?: Record<string, string | number>) => string;

const needsOf = (rsvp: RsvpRecord | null): Need[] => [
  ...((rsvp?.dietary ?? (rsvp?.has_allergy ? ["allergy"] : [])).filter(item => item !== "other" || rsvp?.dietary_other) as Need[]),
  ...(rsvp?.access?.includes("wheelchair") ? ["wheelchair" as const] : []),
];
const initials = (name: string) => name.replace(/^(bapak|ibu|bpk\.?|bu|pak|mr\.?|mrs\.?|ms\.?)\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join("");

export function VisitRsvpForm({ event, invitation, saved, disabled, needs, partyMax, v, onSaved }: {
  event: EventRecord; invitation?: Invitation; saved: RsvpRecord | null; disabled: boolean;
  /** False until migration 202610200004: only the allergy question, as before. */
  needs: boolean;
  /** People one confirmation may cover, the guest included. */
  partyMax: number; v: Words; onSaved: (rsvp: RsvpRecord) => void;
}) {
  const { t } = useWording();
  const { pending, send } = useSender();
  const start = saved ?? invitation?.rsvp ?? null;
  const [name, setName] = useState(start?.name ?? invitation?.name ?? "");
  const [organization, setOrganization] = useState(start?.organization ?? "");
  const [phone, setPhone] = useState(start?.phone ?? "");
  // A personal guest who confirmed before sees their name as a card; "Ubah" opens the fields.
  const [editingWho, setEditingWho] = useState(!(invitation && start?.name && start.organization));
  const maxOthers = needs ? Math.max(0, Math.min(9, partyMax - 1)) : 0;
  const [others, setOthers] = useState(Math.min(maxOthers, Math.max(0, (start?.attendance === "yes" ? start.party_size ?? 1 : 1) - 1)));
  const [partyOpen, setPartyOpen] = useState(others > 0);
  const [names, setNames] = useState((start?.companion_names ?? []).join(", "));
  const [chosen, setChosen] = useState<Need[]>(start?.attendance === "yes" ? needsOf(start) : []);
  const [noNeeds, setNoNeeds] = useState(start?.attendance === "yes" && needsOf(start).length === 0);
  const [allergy, setAllergy] = useState(start?.allergy_details ?? "");
  const [other, setOther] = useState(start?.dietary_other ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const clear = () => { setErrors({}); setMessage(""); };

  const offered: Need[] = needs ? ["vegetarian", "allergy", "wheelchair", "other"] : ["allergy"];
  const needLabel: Record<Need, string> = { vegetarian: t("need.vegetarian"), allergy: t("need.allergy"), wheelchair: t("need.wheelchair"), other: t("need.other") };
  const toggle = (need: Need) => { clear(); setNoNeeds(false); setChosen(list => list.includes(need) ? list.filter(item => item !== need) : [...list, need]); };
  const companionList = () => names.split(/[,;\n]/).map(item => item.trim()).filter(Boolean);
  const party = partyOpen ? others + 1 : 1;

  function show(found: FieldErrors) {
    setErrors(found);
    if (found.name || found.organization || found.phone) setEditingWho(true);
    requestAnimationFrame(() => document.getElementById(`visit-rsvp-${Object.keys(found)[0]}`)?.focus());
  }

  async function submit(attendance: "yes" | "no") {
    if (disabled || pending) return;
    const found: FieldErrors = {};
    if (name.trim().length < 2) found.name = t("form.error.name");
    if (!organization.trim()) found.organization = t("form.error.organization");
    if (phone.trim() && !/^[+\d\s().-]{6,30}$/.test(phone.trim())) found.phone = t("form.error.fields");
    if (attendance === "yes") {
      if (chosen.includes("allergy") && !allergy.trim()) found.allergy_details = t("form.error.allergy");
      if (chosen.includes("other") && !other.trim()) found.dietary_other = t("form.error.other");
      if (partyOpen && companionList().length > others) found.companion_names = v("confirm.party.names.tooMany");
    }
    if (Object.keys(found).length) return show(found);
    if (!rsvpIsOpen(event, Date.now())) { setMessage(t("rsvp.closedNow")); return; }
    const attending = attendance === "yes";
    const dietary = chosen.filter((item): item is Dietary => item !== "wheelchair");
    const parsed = rsvpSchema.safeParse({
      name, organization, attendance, phone, email: start?.email ?? "",
      has_allergy: attending && chosen.includes("allergy"), allergy_details: allergy,
      ...(needs ? {
        party_size: attending ? party : 1, companion_names: attending && partyOpen ? companionList() : [],
        dietary, dietary_other: other,
        // Other access needs from an earlier answer stay; the chips only show the wheelchair.
        access: [...new Set([...(start?.access ?? []).filter(item => item !== "wheelchair"), ...(chosen.includes("wheelchair") ? ["wheelchair" as const] : [])])],
        access_other: start?.access_other ?? "",
        photo_opt_out: start?.photo_opt_out ?? false,
        // The hint under the number says what it is for: news of a change to this visit.
        whatsapp_consent: !!phone.trim(),
      } : {}),
      consent: true, website: "", idempotency_key: "00000000-0000-4000-8000-000000000000",
    });
    if (!parsed.success) return show(Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0] ?? "form"), issue.message])));
    const { idempotency_key: ignored, ...payload } = parsed.data;
    void ignored;
    const body = needs ? payload : { name: payload.name, organization: payload.organization, attendance: payload.attendance, phone: payload.phone, email: payload.email, has_allergy: payload.has_allergy, allergy_details: payload.allergy_details, consent: payload.consent, website: payload.website };
    const result = await send(guestApi.rsvp(event, invitation), body);
    if (!result) return;
    if (!result.ok) {
      setMessage(result.message || t("form.error.network"));
      const fields = firstErrors(result.fieldErrors);
      if (Object.keys(fields).length) show(fields);
      return;
    }
    const now = new Date().toISOString();
    onSaved({ ...(saved ?? { id: result.data?.id ?? "", event_id: event.id, created_at: now }), ...payload, updated_at: now });
  }

  const describe = (field: string, hint = false) => ({
    id: `visit-rsvp-${field}`, "aria-invalid": !!errors[field],
    "aria-describedby": [hint ? `visit-rsvp-${field}-hint` : "", errors[field] ? `visit-rsvp-${field}-error` : ""].filter(Boolean).join(" ") || undefined,
  });
  const label = (text: string, optional = false) => optional ? `${text} ${v("confirm.optional")}` : text;

  return <form className={styles.form} noValidate onSubmit={e => { e.preventDefault(); void submit("yes"); }}>
    {message && <Notice tone="error">{message}</Notice>}
    {Object.keys(errors).length > 0 && !message && <p className="sr-only" role="alert">{t("form.error.fields")}</p>}

    {editingWho ? <div className={styles.formGroup}>
      <Field name="visit-rsvp-name" label={t("field.name")} error={errors.name}>
        <input {...describe("name")} className="input" autoComplete="name" maxLength={150} placeholder={v("confirm.name.example")} value={name} onChange={e => { clear(); setName(e.target.value); }} />
      </Field>
      <Field name="visit-rsvp-organization" label={v("confirm.org")} error={errors.organization}>
        <input {...describe("organization")} className="input" autoComplete="organization" maxLength={200} placeholder={v("confirm.org.example")} value={organization} onChange={e => { clear(); setOrganization(e.target.value); }} />
      </Field>
      <Field name="visit-rsvp-phone" label={label(v("confirm.phone"), true)} error={errors.phone} hint={v("confirm.phone.hint")}>
        <input {...describe("phone", true)} className="input" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} placeholder="08xx xxxx xxxx" value={phone} onChange={e => { clear(); setPhone(e.target.value); }} />
      </Field>
    </div> : <div className={styles.who}>
      <span className={styles.whoInitials} aria-hidden="true">{initials(name) || <UserRound size={18} />}</span>
      <div className={styles.whoText}><strong>{name}</strong><span>{organization}</span></div>
      <button type="button" className={styles.linkButton} onClick={() => setEditingWho(true)}>{v("confirm.change")}<span className="sr-only"> {t("field.name")}</span></button>
    </div>}

    {maxOthers > 0 && <div className={`${styles.party} ${partyOpen ? styles.partyOpen : ""}`.trimEnd()}>
      <button type="button" className={styles.partyToggle} aria-expanded={partyOpen} aria-controls="visit-rsvp-party" onClick={() => { clear(); setPartyOpen(open => !open); if (!partyOpen && others === 0) setOthers(1); }}>
        <span className={styles.tileIcon} aria-hidden="true"><Users size={18} /></span>
        <span className={styles.partyToggleText}>{partyOpen ? v("confirm.party.open") : <>{v("confirm.party.ask")} <span>{v("confirm.optional")}</span></>}</span>
        {partyOpen ? <Minus size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
        {partyOpen && <span className="sr-only">: {v("confirm.party.close")}</span>}
      </button>
      {partyOpen && <div id="visit-rsvp-party" className={styles.partyBody}>
        <div className={styles.stepper}>
          <p id="visit-rsvp-others-label" className={styles.stepperLabel}><strong>{v("confirm.party.count")}</strong><span>{v("confirm.party.countSub")}</span></p>
          <div className={styles.stepperControls} role="group" aria-labelledby="visit-rsvp-others-label">
            <button type="button" aria-label={v("confirm.party.less")} disabled={others <= 1} onClick={() => { clear(); setOthers(n => n - 1); }}><Minus size={18} aria-hidden="true" /></button>
            <output id="visit-rsvp-party_size" aria-live="polite">{others}</output>
            <button type="button" aria-label={v("confirm.party.more")} disabled={others >= maxOthers} onClick={() => { clear(); setOthers(n => n + 1); }}><Plus size={18} aria-hidden="true" /></button>
          </div>
        </div>
        {others >= maxOthers && <p className="field-hint">{v("confirm.party.max", { n: maxOthers })}</p>}
        <Field name="visit-rsvp-companion_names" label={label(v("confirm.party.names"), true)} error={errors.companion_names} hint={v("confirm.party.names.hint")}>
          <input {...describe("companion_names", true)} className="input" maxLength={600} placeholder={v("confirm.party.names.example")} value={names} onChange={e => { clear(); setNames(e.target.value); }} />
        </Field>
      </div>}
    </div>}

    <fieldset className={styles.needs}>
      <legend>{label(v("confirm.needs"), true)}</legend>
      <div className={styles.chips}>
        {offered.map(need => <label key={need} className={`${styles.chip} ${chosen.includes(need) ? styles.chipOn : ""}`.trimEnd()}>
          <input id={`visit-rsvp-need-${need}`} type="checkbox" checked={chosen.includes(need)} onChange={() => toggle(need)} />
          {chosen.includes(need) && <Check size={15} aria-hidden="true" />}{needLabel[need]}
        </label>)}
        <label className={`${styles.chip} ${noNeeds ? styles.chipOn : ""}`.trimEnd()}>
          <input type="checkbox" checked={noNeeds} onChange={() => { clear(); setNoNeeds(on => !on); setChosen([]); }} />
          {noNeeds && <Check size={15} aria-hidden="true" />}{v("confirm.needs.none")}
        </label>
      </div>
      {chosen.includes("allergy") && <Field name="visit-rsvp-allergy_details" label={t("need.allergy.detail")} error={errors.allergy_details}>
        <input {...describe("allergy_details")} className="input" maxLength={1000} value={allergy} onChange={e => { clear(); setAllergy(e.target.value); }} />
      </Field>}
      {chosen.includes("other") && <Field name="visit-rsvp-dietary_other" label={t("need.other.detail")} error={errors.dietary_other}>
        <input {...describe("dietary_other")} className="input" maxLength={300} placeholder={v("confirm.needs.other")} value={other} onChange={e => { clear(); setOther(e.target.value); }} />
      </Field>}
    </fieldset>

    <p className={styles.note}>{v("confirm.privacy")}</p>
    <div className={styles.formActions}>
      <Button type="submit" disabled={disabled || pending}><Send size={17} aria-hidden="true" /> {pending ? t("form.sending") : v("confirm.send")}</Button>
      <button type="button" className={styles.quietButton} disabled={disabled || pending} onClick={() => void submit("no")}>{v("confirm.decline")}</button>
    </div>
    <span role="status" className="sr-only">{pending ? t("form.sending") : ""}</span>
  </form>;
}

/** After sending (screen 4): what was confirmed, and what to do next. */
export function VisitRsvpDone({ event, rsvp, personal, editable, now, v, onEdit, hasRoute }: {
  event: EventRecord; rsvp: RsvpRecord; personal: boolean; editable: boolean; now: number | null; v: Words; onEdit: () => void; hasRoute: boolean;
}) {
  const { t, date } = useWording();
  const yes = rsvp.attendance === "yes";
  const needs = [
    ...(rsvp.dietary ?? (rsvp.has_allergy ? ["allergy" as const] : [])).map(item => item === "allergy" ? `${t("need.allergy")}: ${rsvp.allergy_details}` : item === "other" ? rsvp.dietary_other ?? t("need.other") : t("need.vegetarian")),
    ...(rsvp.access ?? []).map(item => item === "wheelchair" ? t("need.wheelchair") : item === "other" ? rsvp.access_other ?? t("need.other") : item === "companion" ? t("need.companion") : t("need.interpreter")),
  ];
  return <div className={styles.done} data-rsvp-done>
    <span className={styles.doneMark} aria-hidden="true"><Check size={26} /></span>
    <div>
      <h2 className={styles.pageTitle}>{v(yes ? "done.title" : "done.no.title", { name: rsvp.name })}</h2>
      <p className={styles.pageLead}>{v(yes ? "done.lead" : "done.no.lead")}</p>
    </div>
    {yes && <ul className={styles.summary}>
      <li><CalendarDays size={18} aria-hidden="true" /> {event.starts_at ? date(event.starts_at, event.timezone) : t("hero.date.empty")}</li>
      <li><Clock3 size={18} aria-hidden="true" /> <TimeRange start={event.starts_at} end={event.ends_at} timezone={event.timezone} /></li>
      <li><Users size={18} aria-hidden="true" /> {[v("done.people", { n: Math.max(1, rsvp.party_size ?? 1) }), needs.length ? needs.join(", ") : v("done.noNeeds")].join(" · ")}</li>
    </ul>}
    {editable && <button type="button" className={styles.linkButton} onClick={onEdit}><Pencil size={15} aria-hidden="true" /> {v(personal ? "done.edit" : "done.other")}</button>}
    {yes && <div className={styles.formActions}>
      <CalendarButton event={event} now={now} />
      {hasRoute && <ButtonLink variant="secondary" href="#cara-datang" data-visit-nav><MapPin size={17} aria-hidden="true" /> {v("home.route")}</ButtonLink>}
    </div>}
  </div>;
}
