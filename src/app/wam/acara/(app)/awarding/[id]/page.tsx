import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { ScreenContent } from "@/components/main-wam/shell";
import { ActionBar, Button } from "@/components/main-wam/ui";
import { NomineePicker } from "@/components/main-wam/modul/awards/NomineePicker";
import { Result } from "@/components/main-wam/modul/Result";
import { Waiting } from "@/components/main-wam/modul/Waiting";
import { votableNominees, when } from "@/lib/main-wam/modul/awards";
import { votingState } from "@/lib/main-wam/module-state";
import { mainWamPath } from "@/lib/routes";
import { requireActionPage } from "@/lib/server/main-wam/gate";
import { serverT, readLang } from "@/lib/server/main-wam/lang";
import { awardsShown, myVotes, nomineeViews } from "@/lib/server/main-wam/modul/awards";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pilih nominasi · WAM", robots: { index: false } };

/** V02 Pilih nominasi in one voting category. Not for BOD (they approve, B06); module Voting Awarding. */
export default async function AwardCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer } = await requireActionPage("voting", mainWamPath.awardCategory(id));
  const now = new Date();
  const lang = await readLang();
  const t = await serverT();
  const [{ categories, migrated }, mine] = await Promise.all([awardsShown(), myVotes(viewer.id)]);
  if (!migrated) return <Waiting />;
  const category = categories.find(item => item.id === id && item.method === "voting");
  if (!category) notFound();
  const state = votingState(category, now);
  if (state !== "buka") {
    return <>
      <ScreenContent>
        <Result icon={<Lock />} headline title={state === "belum" ? t("awards.votingNotOpen") : t("awards.votingClosed")}
          body={state === "belum" && category.opensAt ? t("silent.opensAt", { when: when(category.opensAt, now, lang) }) : category.announceAt ? `${t("awards.announced")} ${when(category.announceAt, now, lang)}.` : undefined} />
      </ScreenContent>
      <ActionBar><Button block href={mainWamPath.awards}>{t("awards.backToAwarding")}</Button></ActionBar>
    </>;
  }
  const { nominees, owners } = await nomineeViews([category]);
  const choices = votableNominees(category.nominees, viewer.id, owners).map(nominee => nominees.get(nominee.id)!).filter(Boolean);
  return <NomineePicker now={now} current={mine.get(category.id) ?? null} nominees={choices}
    category={{ id: category.id, title: category.title, description: category.description, closesAt: category.closesAt! }} />;
}
