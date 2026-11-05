import { notFound } from "next/navigation";
import { ListChecks } from "lucide-react";
import { PraWamShell, ScreenHead } from "@/components/pra-wam/PraWamShell";
import { ParticipationMeter, SurveyRecap } from "@/components/pra-wam/SurveyRecap";
import type { Reader } from "@/lib/pra-wam/recap";
import { managesApp, readsNeeds, seesAllSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { currentForm } from "@/lib/server/pra-wam/questionnaire";
import { participationOf, recapOf } from "@/lib/server/pra-wam/recap";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import base from "@/components/pra-wam/pra-wam.module.css";
import styles from "@/components/pra-wam/bod.module.css";
import own from "@/components/pra-wam/survey-recap.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hasil survei · WAM", robots: { index: false } };

type Search = { bagian?: string | string[]; departemen?: string | string[] };
const one = (value: string | string[] | undefined) => (typeof value === "string" && value ? value.slice(0, 120) : null);

/**
 * Hasil survei (Penpot "B4"): the questionnaire as BOD and panitia read it. Partisipasi, then per
 * question bars, a matrix table or quotes, for one section or all, everyone or one department.
 * Never a name. Never a question only HR reads, nor written HR answers. A BOD is not a facilitator,
 * so answers someone kept for "Hanya dibaca fasilitator" (question 30) stay out of their view.
 */
export default async function SurveyResultsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const member = await requireMemberPage(praWamPath.surveyResults);
  if (!seesAllSessions(member)) notFound();
  const form = await currentForm().catch(() => null);
  const open = !!form && (form.status !== "draf" || managesApp(member));
  const asked = await searchParams;
  const reader: Reader = { hrOpen: false, facilitator: readsNeeds(member) };
  const [recap, participation] = open
    ? await Promise.all([recapOf(form, reader, one(asked.departemen)).catch(() => null), participationOf(form).catch(() => null)])
    : [null, null];

  if (!form || !open || !recap) {
    return <PraWamShell member={member} current="survei">
      <ScreenHead title="Hasil survei" lead="Akses baca saja" />
      <section className={`${base.card} ${styles.emptyState}`} aria-labelledby="belum-ada">
        <span className={base.tile}><ListChecks aria-hidden /></span>
        <h2 id="belum-ada">Belum ada survei</h2>
        <p>Hasil muncul di sini setelah kuesioner dibuka: partisipasi, jawaban per pertanyaan, dan saran terbanyak.</p>
      </section>
    </PraWamShell>;
  }

  const section = one(asked.bagian);
  const chosen = recap.sections.find(item => item.key === section) ?? null;
  return <PraWamShell member={member} current="survei">
    <ScreenHead title="Hasil survei" lead={`${form.name} · akses baca saja, tanpa nama`} />
    <form method="get" className={own.filters}>
      <label>Bagian
        <select name="bagian" defaultValue={chosen?.key ?? ""}>
          <option value="">Semua bagian</option>
          {recap.sections.map(item => <option key={item.key} value={item.key}>{item.title}</option>)}
        </select>
      </label>
      <label>Departemen
        <select name="departemen" defaultValue={recap.department ?? ""}>
          <option value="">Semua departemen</option>
          {recap.departments.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <button type="submit">Terapkan</button>
    </form>
    {participation && <section className={base.card} style={{ marginTop: 16 }} aria-label="Partisipasi"><ParticipationMeter participation={participation} /></section>}
    <SurveyRecap sections={chosen ? [chosen] : recap.sections} />
  </PraWamShell>;
}
