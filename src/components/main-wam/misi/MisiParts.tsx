"use client";

import { Camera, Clock, Footprints, MapPin, PersonStanding, Repeat, ShieldCheck, Tag, Users } from "lucide-react";
import { useLang, useT } from "@/components/main-wam/i18n";
import { SrOnly } from "@/components/main-wam/ui";
import { number } from "@/lib/main-wam/i18n";
import { chipsOf, type MissionItem, type RequirementIcon } from "@/lib/main-wam/misi/missions";
import type { MissionKind } from "@/lib/main-wam/misi/types";
import css from "./misi.module.css";

const ICONS = { camera: Camera, "map-pin": MapPin, users: Users, clock: Clock, "shield-check": ShieldCheck, tag: Tag, pose: PersonStanding, repeat: Repeat } as const;

export function ReqIcon({ name }: { name: RequirementIcon }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden />;
}

/** Whole numbers the way the language writes them: "3.400" (id), "3,400" (en). */
export function useNum() {
  const { lang } = useLang();
  return (value: number) => number(lang, value);
}

/** The icon of a kind of mission (a row's leading icon). */
export const kindIcon = (kind: MissionKind) => (kind === "foto" ? <Camera /> : kind === "checkin" ? <Footprints /> : <Users />);

/**
 * The short requirement chips under a mission's title ("Foto langsung · Lokasi aktif"). `max` keeps the
 * list to the most important ones and says "+N syarat lagi" for the rest (they are all in the sheet).
 */
export function ReqChips({ item, max }: { item: Pick<MissionItem, "kind" | "rules">; max?: number }) {
  const { lang } = useLang();
  const t = useT();
  const all = chipsOf(item, lang);
  const shown = max !== undefined ? all.slice(0, max) : all;
  const rest = all.length - shown.length;
  return <span className={css.reqs}>
    {shown.map(chip => <span key={chip.title} className={css.req}><ReqIcon name={chip.icon} />{chip.title}</span>)}
    {rest > 0 && <span className={css.reqMore}><span aria-hidden>+{rest}</span><SrOnly>{t("misi.row.moreSr", { n: rest })}</SrOnly></span>}
  </span>;
}
