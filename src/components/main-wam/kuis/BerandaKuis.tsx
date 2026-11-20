import { Fragment } from "react";
import { Gamepad2, SkipForward } from "lucide-react";
import { t } from "@/lib/main-wam/i18n";
import { mainWamPath } from "@/lib/routes";
import type { MainWamContext } from "@/lib/server/main-wam/gate";
import { quizzesForHome } from "@/lib/server/main-wam/kuis/home";
import { readLang } from "@/lib/server/main-wam/lang";
import { Button, Card, CardHead } from "@/components/main-wam/ui";

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
      {game.phase !== "siap" && game.phase !== "selesai" && <Card>
        <CardHead icon={<Gamepad2 />} title={t(lang, "kuis.home.live")} sub={t(lang, game.joined ? "kuis.home.joinedSub" : "kuis.home.liveSub", { title: game.title })} />
        <Button block icon={<Gamepad2 />} href={mainWamPath.quiz(game.quizId)}>{t(lang, game.joined ? "kuis.home.open" : "kuis.home.join")}</Button>
      </Card>}
      {game.host && <Card variant="role">
        <CardHead icon={<SkipForward />} title={t(lang, "kuis.home.host")} sub={t(lang, game.phase === "siap" ? "kuis.home.hostReady" : "kuis.home.hostLive", { title: game.title })} />
        <Button variant="secondary" block href={mainWamPath.quizControl(game.quizId)}>{t(lang, "kuis.home.hostOpen")}</Button>
      </Card>}
    </Fragment>)}
  </>;
}
