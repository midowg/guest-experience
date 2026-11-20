"use client";

import type { MessageKey } from "@/lib/main-wam/i18n";
import { levelMs } from "@/lib/main-wam/kuis/rules";
import type { QuizLevel } from "@/lib/main-wam/kuis/types";
import { useT } from "@/components/main-wam/i18n";
import { cx } from "@/components/main-wam/ui";
import css from "./play.module.css";

export const levelClass = (level: QuizLevel) => css[`lv${level}`];
export const levelKey = (level: QuizLevel) => `kuis.level.${level}` as MessageKey;

/**
 * The level card on the phone (rancangan §4, "Pergantian level"): it turns over from the level before
 * (or "Siap?" for the first question) to the new one 650 ms into the phase; the same level shows as it is.
 */
export function LevelCard({ levels, index, flipped }: { levels: readonly QuizLevel[]; index: number; flipped: boolean }) {
  const t = useT();
  const level = levels[index];
  const previous = index > 0 ? levels[index - 1] : null;
  const turns = index === 0 || previous !== level;
  const face = (value: QuizLevel) => <>
    <span className={css.kicker}>{t("kuis.levelKicker")}</span>
    <span className={css.lvName}>{t(levelKey(value))}</span>
    <span className={css.lvMeta}>{t("kuis.levelMeta", { s: levelMs(value) / 1000 })}</span>
  </>;
  return <div className={cx(css.flip, (!turns || flipped) && css.flipped)}>
    <div className={css.flipInner}>
      <div className={cx(css.face, css.front, turns && previous ? levelClass(previous) : !turns ? levelClass(level) : undefined)}>
        {turns && !previous
          ? <><span className={css.kicker}>{t("kuis.introKicker", { n: levels.length })}</span><span className={css.lvName}>{t("kuis.intro")}</span><span className={css.lvMeta}>{t("kuis.introMeta")}</span></>
          : face(turns && previous ? previous : level)}
      </div>
      <div className={cx(css.face, css.back, levelClass(level))}>{face(level)}</div>
    </div>
  </div>;
}
