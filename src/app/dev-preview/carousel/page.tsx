import { notFound } from "next/navigation";
import { AgendaCarousel } from "@/components/pra-wam/AgendaCarousel";
import base from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";

const cards = [
  { label: "Selesai · Rapat", when: "Kemarin", title: "Appraisal 1-on-1", time: "Min, 8 Nov · 09.00–10.00", where: "Nagapadma" },
  { label: "Berikutnya · Forum", when: "Besok", title: "Review data departemen", time: "Sel, 10 Nov · 09.30–13.00", where: "Vasuki" },
  { label: "Nanti · Rapat", when: "Rab, 11 Nov", title: "Rekonsiliasi ACC", time: "Rab, 11 Nov · 13.00–15.00", where: "Arjuna" },
];

/** Layout check for Beranda's agenda carousel without signing in: ?tema=terang for light. */
export default async function DevCarouselPage({ searchParams }: { searchParams: Promise<{ tema?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { tema } = await searchParams;
  return <div data-wam-look="dream" data-wam-theme={tema === "terang" ? "light" : "dark"}>
    <div className={base.app} style={{ minHeight: "100vh", padding: 20 }}>
      <AgendaCarousel start={1} labels={cards.map(card => card.title)}>
        {cards.map(card => <section key={card.title} className={base.hero}>
          <div className={base.heroTop}><span>{card.label}</span><span>{card.when}</span></div>
          <h2>{card.title}</h2>
          <span className={base.heroLine}>{card.time}</span>
          <span className={base.heroLine}>{card.where}</span>
        </section>)}
      </AgendaCarousel>
    </div>
  </div>;
}
