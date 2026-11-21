import { Fragment } from "react";
import { SkipForward, Trophy } from "lucide-react";
import { t, type Lang } from "@/lib/main-wam/i18n";
import { mainWamPath } from "@/lib/routes";
import type { MainWamContext } from "@/lib/server/main-wam/gate";
import { quizzesForHome } from "@/lib/server/main-wam/kuis/home";
import { readLang } from "@/lib/server/main-wam/lang";
import { BracketCard, Button, Card, CardHead, EyebrowLabel, Pill, PulseDot } from "@/components/main-wam/ui";
import css from "@/components/main-wam/peserta/beranda/beranda.module.css";

/**
 * Beranda's Kuis live cards (rancangan §8a): "Kuis dimulai · Ikut" while a game is open (from the lobby to
 * the podium), and "Kendalikan kuis" for its pengendali and Admin WAM from the moment the game is made.
 * Nothing while the module is off or no game is on (one query then). Rendered by the page as a slot.
 */
export async function BerandaKuis({ context }: { context: MainWamContext }) {
  if (!context.settings.modules.kuis) return null;
  const [games, lang] = await Promise.all([quizzesForHome(context), readLang()]);
  if (!games.length) return null;
  return <>
    {games.map(game => <Fragment key={game.quizId}>
      {game.phase !== "siap" && game.phase !== "selesai" && <KuisLiveCard lang={lang} title={game.title} joined={game.joined} href={mainWamPath.quiz(game.quizId)} />}
      {game.host && <Card variant="role">
        <CardHead icon={<SkipForward />} title={t(lang, "kuis.home.host")} sub={t(lang, game.phase === "siap" ? "kuis.home.hostReady" : "kuis.home.hostLive", { title: game.title })} />
        <Button variant="secondary" block href={mainWamPath.quizControl(game.quizId)}>{t(lang, "kuis.home.hostOpen")}</Button>
      </Card>}
    </Fragment>)}
  </>;
}

/** The live-quiz card (prototipe .quizcard): gold eyebrow with the live dot, the quiz in big capitals, one line, the gold button. */
export function KuisLiveCard({ lang, title, joined, href }: { lang: Lang; title: string; joined: boolean; href: string }) {
  return <BracketCard as="article" motif="orbit" className={css.ctx}>
    <div className={css.ctxLead}>
      <EyebrowLabel tone="gold"><PulseDot />{t(lang, "kuis.home.live")}</EyebrowLabel>
      <Pill icon={<Trophy />}>{t(lang, "kuis.home.tag")}</Pill>
    </div>
    <h2 className={css.ctxTitle}>{title}</h2>
    <p className={css.ctxSub}>{t(lang, joined ? "kuis.home.joinedLine" : "kuis.home.liveLine")}</p>
    <div className={css.ctxAction}><Button block icon={<Trophy />} href={href}>{t(lang, joined ? "kuis.home.open" : "kuis.home.join")}</Button></div>
  </BracketCard>;
}
