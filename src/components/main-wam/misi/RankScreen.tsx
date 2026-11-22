"use client";

import { Hourglass, Medal, Trophy } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { ScreenContent } from "@/components/main-wam/shell";
import { Button, EmptyState, Pill, SrOnly } from "@/components/main-wam/ui";
import { medalOf, myPlace, type RankRow } from "@/lib/main-wam/misi/rank";
import { mainWamPath } from "@/lib/routes";
import css from "./misi.module.css";

/** A sentence with **bold** parts (the dictionary marks them with double asterisks), as nodes. */
function bold(text: string) {
  return text.split("**").map((part, index) => (index % 2 ? <b key={index}>{part}</b> : part));
}

/**
 * Peringkat (prototipe SC.rank): everyone of the event ranked by points, flat rows. A row is the rank
 * (a medal for 1 to 3), the nama panggilan, the department's short form and the points; the asker's
 * own row is lit in gold and says "Kamu". Nothing else about a person is here, and the answer carries
 * no ids (rank.ts).
 */
export function RankScreen({ migrated, open, rows }: { migrated: boolean; open: boolean; rows: readonly RankRow[] }) {
  const t = useT();
  const place = myPlace(rows);
  if (!migrated) return <ScreenContent><EmptyState icon={<Hourglass />} title={t("peserta.waiting.title")}>{t("misi.waiting")}</EmptyState></ScreenContent>;
  if (!open) return <ScreenContent><EmptyState icon={<Trophy />} title={t("misi.rank.closedTitle")} action={<Button variant="secondary" href={mainWamPath.missions}>{t("misi.rank.back")}</Button>}>{t("misi.rank.closedBody")}</EmptyState></ScreenContent>;
  return <ScreenContent>
    <p className={css.rankSummary}><Medal aria-hidden /><span>{place ? bold(t("misi.rank.summary", { rank: place.rank, total: place.of, points: place.points })) : t("misi.rank.summaryNone")}</span></p>
    <section>
      <ol className={css.rank} aria-label={t("misi.rank.list")}>
        {rows.map((row, index) => {
          const medal = medalOf(row.rank);
          return <li key={index} className={row.me ? `${css.rankRow} ${css.rankMe}` : css.rankRow} aria-current={row.me ? "true" : undefined}>
            <span className={medal ? `${css.rankNo} ${css.rankMedal}` : css.rankNo}>
              {medal && <Medal aria-hidden />}<span>{row.rank}</span>
            </span>
            <span className={css.rankName}>
              <b>{row.name}{row.me && <Pill tone="primary" className={css.rankYou}>{t("misi.rank.me")}</Pill>}</b>
              {row.department && <small>{row.department}</small>}
            </span>
            <span className={css.rankPoints}>{row.points}<SrOnly> {t("misi.page.points")}</SrOnly></span>
          </li>;
        })}
      </ol>
    </section>
  </ScreenContent>;
}
