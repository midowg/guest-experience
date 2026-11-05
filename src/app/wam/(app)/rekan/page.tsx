import { notFound } from "next/navigation";
import { ScreenHead } from "@/components/pra-wam/PraWamShell";
import { Gallery } from "@/components/pra-wam/colleagues/Gallery";
import { Notice } from "@/components/ui";
import { CARDS_MIGRATION } from "@/lib/pra-wam/cards";
import { managesApp, seesAllSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { galleryOf, hasNumberedCard } from "@/lib/server/pra-wam/colleagues";
import { currentForm } from "@/lib/server/pra-wam/questionnaire";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import base from "@/components/pra-wam/pra-wam.module.css";
import css from "@/components/pra-wam/colleagues/colleagues.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kartu rekan · WAM", robots: { index: false } };

/**
 * Kartu rekan: the character cards of everyone who finished the questionnaire, as they finish. A
 * participant sees them once their own card is out (panitia, BOD and admin always), so finishing
 * is what opens the gallery. Hidden while the questionnaire is a draft, except to Admin WAM.
 */
export default async function ColleaguesPage() {
  const member = await requireMemberPage(praWamPath.colleagues);
  const form = await currentForm().catch(() => null);
  if (!form || (form.status === "draf" && !managesApp(member))) notFound();
  const open = seesAllSessions(member) || await hasNumberedCard(form, member.id);

  if (!open) {
    return <>
      <ScreenHead title="Kartu rekan" lead="Kartu karakter semua rekan yang sudah menyelesaikan kuesioner." />
      <section className={`${base.card} ${css.locked}`}>
        <p>Galeri terbuka setelah kartumu sendiri keluar. Selesaikan {form.name.toLowerCase() === "kuesioner" ? "kuesioner" : `“${form.name}”`} dulu, lalu kembali ke sini.</p>
        <a className={css.button} href={praWamPath.questionnaire(form.slug)}>Buka {form.name}</a>
      </section>
    </>;
  }

  const { entries, ready } = await galleryOf(form);
  return <>
    <ScreenHead title="Kartu rekan" lead={entries.length ? `${entries.length} rekan sudah mendapat kartu. Ketuk kartu untuk melihat profilnya.` : undefined} />
    {!ready ? <Notice tone="warning">Kartu karakter menunggu migrasi {CARDS_MIGRATION}.</Notice>
      : entries.length === 0 ? <section className={base.card}><p className={css.empty}>Belum ada kartu. Kartu muncul di sini begitu rekan menyelesaikan kuesioner.</p></section>
        : <Gallery entries={entries} viewerId={member.id} />}
  </>;
}
