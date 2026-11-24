"use client";

import { Camera, Clock, Footprints, MapPin, PersonStanding, Repeat, ShieldCheck, Tag, Users } from "lucide-react";
import { useLang } from "@/components/main-wam/i18n";
import { chipsOf, type MissionItem, type RequirementIcon } from "@/lib/main-wam/misi/missions";
import type { MissionKind } from "@/lib/main-wam/misi/types";
import css from "./misi.module.css";

const ICONS = { camera: Camera, "map-pin": MapPin, users: Users, clock: Clock, "shield-check": ShieldCheck, tag: Tag, pose: PersonStanding, repeat: Repeat } as const;

export function ReqIcon({ name }: { name: RequirementIcon }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden />;
}

/** The icon of a kind of mission (a row's leading icon). */
export const kindIcon = (kind: MissionKind) => (kind === "foto" ? <Camera /> : kind === "checkin" ? <Footprints /> : <Users />);

/** The short requirement chips under a mission's title ("Foto langsung · Lokasi aktif"). */
export function ReqChips({ item }: { item: Pick<MissionItem, "kind" | "rules"> }) {
  const { lang } = useLang();
  return <span className={css.reqs}>{chipsOf(item, lang).map(chip => <span key={chip.title} className={css.req}><ReqIcon name={chip.icon} />{chip.title}</span>)}</span>;
}
