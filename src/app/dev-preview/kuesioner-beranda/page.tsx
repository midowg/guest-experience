import { notFound } from "next/navigation";
import { AboutCard, QuestionnaireCard } from "@/components/pra-wam/BerandaCards";
import base from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";

/** Layout check for the questionnaire card on Beranda in each state, beside a plain card: ?tema=gelap for dark. */
export default async function DevQuestionnaireBerandaPage({ searchParams }: { searchParams: Promise<{ tema?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const dark = (await searchParams).tema === "gelap";
  const card = { name: "Cerita Kita", cardText: "Kenalan lebih dekat sebelum WAM: cerita singkat tentang kamu, kebiasaan, dan harapanmu.", minutes: 15, sectionsTotal: 5, href: "#" };
  return <div data-wam-theme={dark ? "dark" : "light"}><div className={base.app} style={{ minHeight: "100vh", padding: 20 }}>
    <div style={{ display: "grid", gap: 16, maxWidth: 520 }}>
      <QuestionnaireCard {...card} sectionsDone={0} done={false} closed={false} />
      <QuestionnaireCard {...card} sectionsDone={2} done={false} closed={false} />
      <AboutCard about={{ title: "Apa itu WAM?", summary: "Werkudara Annual Meeting: tiga hari bersama seluruh tim." }} preview />
      <QuestionnaireCard {...card} sectionsDone={3} done={false} closed />
      <QuestionnaireCard {...card} sectionsDone={5} done closed={false} />
    </div>
  </div></div>;
}
