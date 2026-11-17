import { Trophy } from "lucide-react";
import { ScreenContent, Stack } from "@/components/main-wam/shell";
import { Avatar, Banner, Button, Card, EmptyState, Pill, PhotoFill, StatusPill, TextLink } from "@/components/main-wam/ui";
import { methodLabel, when, type NomineeView, type VoteCard } from "@/lib/main-wam/modul/awards";
import type { AwardMethod } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import css from "../modul.module.css";

export type AwardCardData = { id: string; title: string; method: AwardMethod; card: VoteCard; winner: NomineeView | null };

/** "Sari · HRGA", "Foto Dimas", "CoE". */
export const nomineeName = (nominee: Pick<NomineeView, "kind" | "name" | "department">) =>
  nominee.kind === "foto" ? `Foto ${nominee.name}` : [nominee.name, nominee.department].filter(Boolean).join(" · ");

function Foot({ category, canVote, now }: { category: AwardCardData; canVote: boolean; now: Date }) {
  const { card } = category;
  switch (card.kind) {
    case "pilih": return <div className={css.cardFoot}>
      <Pill tone="active" dot>{`Sampai ${when(card.closesAt, now)}`}</Pill>
      {canVote && <Button size="m" href={mainWamPath.awardCategory(category.id)}>Pilih</Button>}
    </div>;
    case "terkirim": return <div className={css.cardFoot}>
      <StatusPill status="sent" />
      {canVote && <TextLink href={mainWamPath.awardCategory(category.id)}>Ubah</TextLink>}
    </div>;
    case "belum": return <div className={css.cardFoot}><Pill>{card.opensAt ? `Dibuka ${when(card.opensAt, now)}` : "Belum dibuka"}</Pill></div>;
    case "ditutup": return <div className={css.cardFoot}><Pill>{card.announceAt && Date.parse(card.announceAt) > now.getTime() ? `Diumumkan ${when(card.announceAt, now)}` : "Ditutup"}</Pill></div>;
    case "juri": return null;
    case "diumumkan": {
      const winner = category.winner;
      if (!winner) return null;
      return <div className={css.winner}>
        {winner.kind === "foto" ? <span className={css.winnerPhoto}><PhotoFill photo={winner.image ? { src: winner.image, alt: "" } : null} className={css.fillBox} /></span>
          : <Avatar name={winner.name} photo={winner.photo} size={48} />}
        <div className={css.winnerText}>
          <p className={css.winnerLabel}>Pemenang</p>
          <p className={css.winnerName}>{nomineeName(winner)}</p>
        </div>
        <Pill tone="success" icon={<Trophy />}>Diumumkan</Pill>
      </div>;
    }
  }
}

/** V01 Awarding (+ V01__status diumumkan): each category, how it is decided, and the person's step. */
export function AwardList({ categories, banner, canVote, now }: { categories: AwardCardData[]; banner: string | null; canVote: boolean; now: Date }) {
  if (!categories.length) {
    return <ScreenContent>
      <EmptyState icon={<Trophy />} title="Belum ada kategori">Kategori awarding tampil di sini setelah diterbitkan panitia.</EmptyState>
    </ScreenContent>;
  }
  return <ScreenContent>
    {banner && <Banner tone="info" icon={<Trophy />} title={banner} />}
    <Stack>
      {categories.map(category => <Card key={category.id} as="article">
        <div>
          <h2 className={css.cardTitle}>{category.title}</h2>
          <p className={css.cardSub}>{methodLabel(category)}</p>
        </div>
        <Foot category={category} canVote={canVote} now={now} />
      </Card>)}
    </Stack>
  </ScreenContent>;
}
