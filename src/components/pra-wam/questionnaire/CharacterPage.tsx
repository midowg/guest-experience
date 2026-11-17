import { ArrowLeft, ListChecks } from "lucide-react";
import { rarityOf } from "@/lib/pra-wam/figures";
import type { CardView } from "@/lib/server/pra-wam/cards";
import { CardReveal } from "./CardReveal";
import { QuestionnaireApp } from "./Frame";
import cardStyles from "./card.module.css";
import styles from "./questionnaire.module.css";

/**
 * The page of my tokoh (17 Nov 2026, the owner's request): once my card is out, the questionnaire's
 * address shows only my card and who the tokoh is, full screen, in the card's colours (deep at the
 * top behind the card, light where the words are; gold for Legendary). No sections, no "done"
 * notice; my answers are one button away, on their own page.
 */
export function CharacterPage({ formId, card, nickname, hasPhoto, home, answers }: {
  formId: string; card: CardView; nickname: string; hasPhoto: boolean;
  /** Beranda, and the page of my answers. */
  home: string; answers: string;
}) {
  const legend = rarityOf(card.tier) === 4;
  const tone = legend ? "#E3A82B" : card.colors[0];
  const deep = legend ? "#5C3D0A" : card.colors[1];
  return <QuestionnaireApp>
    <div className={cardStyles.charPage} style={{ ["--stage-tone" as string]: tone, ["--tone-deep" as string]: deep, ["--glow" as string]: card.tier.color }}>
      <span className={cardStyles.charStars} aria-hidden />
      <header className={`${styles.wrap} ${cardStyles.charTop}`}>
        <a href={home}><ArrowLeft aria-hidden />Beranda</a>
        <span>Kartu tokohmu</span>
      </header>
      <main className={`${styles.wrap} ${cardStyles.charMain}`}>
        <h1 className="sr-only">Kartu tokohmu</h1>
        <CardReveal formId={formId} initial={card} nickname={nickname} hasPhoto={hasPhoto} settled />
        <a className={cardStyles.answersLink} href={answers}><ListChecks aria-hidden />Lihat jawaban kuesionermu</a>
      </main>
    </div>
  </QuestionnaireApp>;
}
