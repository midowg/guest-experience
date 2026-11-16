import { createElement } from "react";
import { Activity, Bike, Brain, Dumbbell, Feather, Flower2, Footprints, Goal, HeartPulse, Medal, Mountain, Music, PersonStanding, PiggyBank, Users, Waves, type LucideIcon } from "lucide-react";
import type { WbMyActivity } from "@/lib/wellbeing/app-types";
import type { DimensionId } from "@/lib/wellbeing/rules";

/** One icon per dimension (the prototype's Material Symbols, in Lucide). */
export const dimensionIcons: Record<DimensionId, LucideIcon> = {
  physical: HeartPulse, emotional: Brain, social: Users, financial: PiggyBank, spiritual: Flower2,
};

const sportRules: [RegExp, LucideIcon][] = [
  [/walk|jalan/, Footprints],
  [/run|lari|jog/, Activity],
  [/cycl|bike|sepeda|gowes/, Bike],
  [/swim|renang/, Waves],
  [/yoga|pilates|stretch/, PersonStanding],
  [/badminton|bulu|tenis|tennis|padel|squash/, Feather],
  [/zumba|aerob|senam|dance|tari/, Music],
  [/futsal|soccer|sepak|bola|football|basket|voli|volley/, Goal],
  [/hik|gunung|trek|climb/, Mountain],
  [/workout|gym|weight|fitness|strength|hiit|crossfit/, Dumbbell],
];
/** A sport's icon from its code or name (the catalogue has no icons). */
export function sportIcon(code: string, name = ""): LucideIcon {
  const text = `${code} ${name}`.toLowerCase();
  return sportRules.find(([pattern]) => pattern.test(text))?.[1] ?? Medal;
}

export function activityIcon(activity: Pick<WbMyActivity, "kind" | "typeCode" | "typeName" | "dimension" | "steps">): LucideIcon {
  if (activity.kind === "sport") return sportIcon(activity.typeCode, activity.typeName);
  if (activity.steps != null || activity.typeCode.endsWith("steps")) return Footprints;
  return dimensionIcons[activity.dimension];
}

/** Draws an icon chosen at run time (so no component is made during render). */
export function Icon({ of, size = 24, className, strokeWidth }: { of: LucideIcon; size?: number; className?: string; strokeWidth?: number }) {
  return createElement(of, { size, className, strokeWidth, "aria-hidden": true });
}
