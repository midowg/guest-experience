import { notFound, redirect } from "next/navigation";
import { CardImage } from "@/components/pra-wam/colleagues/CardImage";
import { serialLabel } from "@/lib/pra-wam/cards";
import { seesQuestionnaire } from "@/lib/pra-wam/questionnaire";
import { managesApp, seesAllSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { colleagueOf, hasNumberedCard } from "@/lib/server/pra-wam/colleagues";
import { currentForm } from "@/lib/server/pra-wam/questionnaire";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import base from "@/components/pra-wam/pra-wam.module.css";
import css from "@/components/pra-wam/colleagues/colleagues.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profil rekan · WAM", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Profil rekan: a colleague's card, their character, and only what they answered under "Rekan bisa
 * lihat ini". Opens on the same terms as the gallery (one's own card first).
 */
export default async function ColleaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const member = await requireMemberPage(praWamPath.colleague(id));
  const form = await currentForm().catch(() => null);
  if (!form || !seesQuestionnaire(form, member.id, managesApp(member) || (form.status !== "draf" && seesAllSessions(member)))) notFound();
  if (!seesAllSessions(member) && !await hasNumberedCard(form, member.id)) redirect(praWamPath.colleagues);
  const profile = await colleagueOf(form, id);
  if (!profile) notFound();
  const { person, card, answers } = profile;
  const mine = person.id === member.id;

  return <>
    <div className={css.profile}>
      <div className={css.big}>
        <CardImage card={card} alt={`Kartu ${card.character.name}, ${card.tier.name}, ${serialLabel(card.serial)}`} scale={0.5} eager />
      </div>
      <div className={base.section}>
        <div>
          <h1 className={css.name}>{person.name}{mine ? " (kamu)" : ""}</h1>
          {person.department && <p className={css.sub}>{person.department}</p>}
        </div>
        <section className={`${base.card} ${css.character}`} aria-label="Karakter">
          <span className={css.tier} style={{ background: card.tier.color }}>{card.tier.name} · {serialLabel(card.serial)}</span>
          <h2>{card.character.name}</h2>
          <p className={css.sub}>{[card.character.figure, card.character.class].filter(Boolean).join(" · ")}</p>
          {card.character.description && <p>{card.character.description}</p>}
          {card.character.powers.length > 0 && <ul className={css.powers} aria-label="Kekuatan">{card.character.powers.map(power => <li key={power}>{power}</li>)}</ul>}
          {card.character.partner && <p className={css.sub}>Partner ideal: <b>{card.character.partner.class || card.character.partner.name}</b></p>}
        </section>
        <section className={base.card} aria-labelledby="shared">
          <h2 id="shared">{mine ? "Yang dilihat rekan" : `Tentang ${person.name.split(" ")[0]}`}</h2>
          {answers.length === 0
            ? <p className={css.sub}>{mine ? "Belum ada jawaban yang dibagikan ke rekan." : "Belum ada yang dibagikan."}</p>
            : <dl className={css.answers}>
              {answers.map(answer => <div key={answer.key}>
                <dt>{answer.prompt}</dt>
                <dd>{answer.lines.length > 1 || answer.lines[0].length <= 24
                  ? <ul>{answer.lines.map(line => <li key={line}>{line}</li>)}</ul>
                  : answer.lines[0]}</dd>
              </div>)}
            </dl>}
          {mine && <p className={css.sub}>Hanya jawaban bertanda “Rekan bisa lihat ini” yang tampil di sini.</p>}
        </section>
      </div>
    </div>
  </>;
}
