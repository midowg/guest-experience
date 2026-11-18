import { AwardList } from "@/components/main-wam/modul/awards/AwardList";
import { Waiting } from "@/components/main-wam/modul/Waiting";
import { mainWamCan } from "@/lib/main-wam/access";
import { t } from "@/lib/main-wam/i18n";
import { nextAnnouncement, voteCard, when } from "@/lib/main-wam/modul/awards";
import { mainWamPath } from "@/lib/routes";
import { requireModulePage } from "@/lib/server/main-wam/gate";
import { readLang } from "@/lib/server/main-wam/lang";
import { awardsShown, myVotes, nomineeViews } from "@/lib/server/main-wam/modul/awards";
import { allSessions } from "@/lib/server/main-wam/read";

export const dynamic = "force-dynamic";
export const metadata = { title: "Awarding · WAM", robots: { index: false } };

/** V01 Awarding: the categories (voted or judged), the person's vote, the winner once announced. Module Voting Awarding. */
export default async function AwardsPage() {
  const { viewer } = await requireModulePage("voting", mainWamPath.awards);
  const now = new Date();
  const lang = await readLang();
  const [{ categories, approvals, migrated }, mine, sessions] = await Promise.all([awardsShown(), myVotes(viewer.id), allSessions()]);
  if (!migrated) return <Waiting />;
  const { nominees } = await nomineeViews(categories);
  const next = nextAnnouncement(categories, now);
  // "Gala Dinner & Awarding" → "Gala Dinner": the event, short enough for one line.
  const place = next?.sessionId ? sessions.data.find(session => session.id === next.sessionId)?.title.split(/ & | · /)[0] : null;
  const banner = next ? t(lang, place ? "awards.bannerAtPlace" : "awards.bannerAt", { place: place ?? "", when: when(next.at, now, lang) }) : null;
  return <AwardList now={now} banner={banner} canVote={mainWamCan(viewer, "voting")} categories={categories.map(category => {
    const card = voteCard(category, mine.has(category.id), approvals.get(category.id), now);
    return { id: category.id, title: category.title, method: category.method, card, winner: card.kind === "diumumkan" ? nominees.get(card.nomineeId) ?? null : null };
  })} />;
}
