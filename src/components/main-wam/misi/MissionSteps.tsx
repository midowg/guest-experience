"use client";

import { useMemo, useState } from "react";
import { Check, CheckCircle2, CircleX, Eye, X } from "lucide-react";
import { useLang, useT } from "@/components/main-wam/i18n";
import { Banner, Pill, SrOnly, TextField } from "@/components/main-wam/ui";
import { checkRules, ruleDisplays, type PublicRule, type RuleCheck, type TagCandidate } from "@/lib/main-wam/misi/rules";
import { orderCandidates, suggestionReason } from "@/lib/main-wam/misi/tags";
import { ReqIcon } from "./MisiParts";
import css from "./misi-steps.module.css";

type TagRule = Extract<PublicRule, { type: "tag" }>;

/** "Langkah 2 dari 3: Tag". */
export function StepLabel({ step, total, name }: { step: number; total: number; name: string }) {
  const t = useT();
  return <p className={css.stepLabel}><span>{t("misi.step.label", { n: step, total, name })}</span>
    <span className={css.stepDots} aria-hidden>{Array.from({ length: total }, (_, index) => <i key={index} className={index < step ? css.stepOn : undefined} />)}</span></p>;
}

/**
 * The Tag step: pick the friends in the photo. A search by name, the people the rule suggests first
 * (roommates, the person next to you on the train, BOD), then everyone. The rule says how many; with all
 * chosen the others wait until one is removed. Only active participants are in the list (the server
 * checks again).
 */
export function TagStep({ rule, candidates, selected, onChange }: { rule: TagRule; candidates: readonly TagCandidate[]; selected: readonly string[]; onChange: (ids: string[]) => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const { suggested, others } = useMemo(() => orderCandidates(candidates, rule.relation, query), [candidates, rule.relation, query]);
  const byId = useMemo(() => new Map(candidates.map(candidate => [candidate.id, candidate])), [candidates]);
  const full = selected.length >= rule.count;
  const who = t(`misi.tag.who.${rule.relation}` as const, { n: rule.count });
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter(other => other !== id) : full ? [...selected] : [...selected, id]);
  const row = (candidate: TagCandidate) => {
    const on = selected.includes(candidate.id);
    const reason = suggestionReason(candidate, rule.relation);
    return <li key={candidate.id}>
      <button type="button" className={css.person} aria-pressed={on} disabled={!on && full} aria-label={t("misi.tag.pick", { name: candidate.name })} onClick={() => toggle(candidate.id)}>
        <span className={css.personText}><b>{candidate.name}</b><small>{candidate.department || "–"}</small></span>
        {reason && <Pill tone="primary">{t(`misi.tag.reason.${reason}` as const)}</Pill>}
        <span className={css.personMark} aria-hidden>{on ? <Check /> : null}</span>
      </button>
    </li>;
  };
  return <div className={css.stepBody}>
    <h2 className={css.stepTitle}>{t("misi.tag.title")}</h2>
    <p className={css.stepLead}>{t("misi.tag.lead")}</p>
    <p className={css.need}><b>{rule.required ? t("misi.tag.need", { who }) : t("misi.tag.optionalNeed", { n: rule.count })}</b><span>{t("misi.tag.progress", { have: selected.length, need: rule.count })}</span></p>
    {selected.length > 0 && <ul className={css.picked} aria-label={t("misi.tag.selected")}>
      {selected.map(id => <li key={id}><button type="button" className={css.pickedChip} aria-label={t("misi.tag.remove", { name: byId.get(id)?.name ?? "" })} onClick={() => toggle(id)}>{byId.get(id)?.name ?? "?"}<X aria-hidden /></button></li>)}
    </ul>}
    {full && <p className={css.stepLead}>{t("misi.tag.full", { n: rule.count })}</p>}
    <TextField label={t("misi.tag.searchLabel")} search placeholder={t("misi.tag.search")} value={query} onChange={event => setQuery(event.target.value)} />
    {suggested.length > 0 && <section aria-label={t("misi.tag.suggested")}>
      <h3 className={css.listTitle}>{t("misi.tag.suggested")}</h3>
      <ul className={css.people}>{suggested.map(row)}</ul>
    </section>}
    <section aria-label={t("misi.tag.all")}>
      <h3 className={css.listTitle}>{t("misi.tag.all")}</h3>
      {others.length || suggested.length ? <ul className={css.people}>{others.map(row)}</ul> : <p className={css.stepLead}>{t("misi.tag.none")}</p>}
    </section>
  </div>;
}

/** The checklist of the Ringkasan step: every rule met, not met, or judged by the checker. */
export function checkOf(rules: readonly PublicRule[], input: { inside: boolean | null; tags: readonly TagCandidate[]; viewer: { id: string; department: string }; attempts: number }): { checks: RuleCheck[]; ok: boolean } {
  const { checks, ok } = checkRules(rules, { now: new Date(), inside: input.inside, tags: input.tags, submitter: input.viewer, previous: input.attempts, live: true });
  return { checks, ok };
}

export function SummaryStep({ rules, checks, tags, points }: { rules: readonly PublicRule[]; checks: readonly RuleCheck[]; tags: readonly TagCandidate[]; points: number }) {
  const t = useT();
  const { lang } = useLang();
  const shown = ruleDisplays(rules, lang);
  const unmet = checks.filter(check => check.ok === false).length;
  return <div className={css.stepBody}>
    <h2 className={css.stepTitle}>{t("misi.sum.title")}</h2>
    <p className={css.stepLead}>{t("misi.sum.lead")}</p>
    <ul className={css.checklist}>
      {shown.map(rule => {
        const check = checks.find(candidate => candidate.type === rule.type);
        const state = check?.ok === true ? "ok" : check?.ok === false ? "no" : "judged";
        const word = state === "ok" ? t("misi.sum.met") : state === "no" ? t("misi.sum.unmet") : t("misi.sum.judged");
        return <li key={rule.key} className={css.checkRow} data-state={state}>
          <span className={css.checkMark} aria-hidden>{state === "ok" ? <CheckCircle2 /> : state === "no" ? <CircleX /> : <Eye />}</span>
          <span className={css.checkText}>
            <b><ReqIcon name={rule.icon} />{rule.title}</b>
            {rule.type === "tag" && <small>{tags.length ? t("misi.sum.tagged", { names: tags.map(tag => tag.name).join(", ") }) : t("misi.sum.noTags")}</small>}
            {rule.type === "lokasi" && <small>{state === "ok" ? t("misi.sum.location.ok") : t("misi.sum.location.no")}</small>}
            {state === "no" && check?.reason && rule.type !== "lokasi" && <small>{check.reason}</small>}
          </span>
          <span className={css.checkWord}><SrOnly>{rule.title}: </SrOnly>{word}</span>
        </li>;
      })}
    </ul>
    {unmet > 0 && <Banner tone="warning">{t("misi.sum.lead")}</Banner>}
    <p className={css.stepLead}>{t("misi.sheet.how")}</p>
    <SrOnly>{t("misi.sum.send", { points })}</SrOnly>
  </div>;
}
