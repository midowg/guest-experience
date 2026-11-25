"use client";

import type { MessageKey } from "@/lib/main-wam/i18n";
import { levelMs } from "@/lib/main-wam/kuis/rules";
import type { QuizLevel } from "@/lib/main-wam/kuis/types";
import { useT } from "@/components/main-wam/i18n";
import { cx } from "@/components/main-wam/ui";
import css from "./play.module.css";

export const levelKey = (level: QuizLevel) => `kuis.level.${level}` as MessageKey;

/**
 * Where a level sits among the four: four dots, the first `level` filled with the theme's primary. One
 * neutral look for every level (the name says which), never a colour per level. Decorative: the level's
 * name is always written beside it.
 */
export function LevelDots({ level, small = false, className }: { level: QuizLevel; small?: boolean; className?: string }) {
  return <span className={cx(css.lvDots, small && css.lvDotsSmall, className)} aria-hidden="true">
    {[1, 2, 3, 4].map(step => <i key={step} data-on={step <= level ? "" : undefined} />)}
  </span>;
}

/**
 * The level card on the phone (rancangan §4, "Pergantian level"): it changes from the level before (or
 * "Siap?" for the first question) to the new one 650 ms into the phase, a 300 ms crossfade (no 3D turn,
 * so the text stays sharp); the same level shows as it is. "Kurangi gerak": the change is immediate.
 */
export function LevelCard({ levels, index, flipped }: { levels: readonly QuizLevel[]; index: number; flipped: boolean }) {
  const t = useT();
  const level = levels[index];
  const previous = index > 0 ? levels[index - 1] : null;
  const turns = index === 0 || previous !== level;
  const face = (value: QuizLevel) => <>
    <span className={css.kicker}>{t("kuis.levelKicker")}</span>
    <span className={css.lvName}>{t(levelKey(value))}</span>
    <LevelDots level={value} />
    <span className={css.lvMeta}>{t("kuis.levelMeta", { s: levelMs(value) / 1000 })}</span>
  </>;
  const turned = !turns || flipped;
  return <div className={cx(css.levelCard, turned && css.turned)}>
    <div className={cx(css.face, css.front)} aria-hidden={turned || undefined}>
      {turns && !previous
        ? <><span className={css.kicker}>{t("kuis.introKicker", { n: levels.length })}</span><span className={css.lvName}>{t("kuis.intro")}</span><span className={css.lvMeta}>{t("kuis.introMeta")}</span></>
        : face(turns && previous ? previous : level)}
    </div>
    <div className={cx(css.face, css.back)} aria-hidden={!turned || undefined}>{face(level)}</div>
  </div>;
}
