import { SayaScreen } from "@/components/main-wam/peserta/saya/SayaScreen";
import { profileLine, roomRow } from "@/lib/main-wam/peserta/saya";
import { moduleAllows } from "@/lib/main-wam/access";
import { moduleOn } from "@/lib/main-wam/modules";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { figureAlias } from "@/lib/server/main-wam/kuis/alias";
import { pointTotals } from "@/lib/server/main-wam/misi/read";
import { readLang } from "@/lib/server/main-wam/lang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saya · WAM", robots: { index: false } };

/** P05 Saya (BOD: P05B; panitia: P05). Owner A (peserta); the gate first. There is no QR of one's own in Main WAM, so no "QR saya" row. */
export default async function SayaPage() {
  const context = await requireMainWamPage(mainWamPath.me);
  const { viewer, settings } = context;
  const lang = await readLang();
  // Tokoh (the questionnaire card's, as the quiz uses it) and the points: only what is really there; nothing is made up.
  const [alias, totals] = await Promise.all([
    moduleOn(settings.modules, "kuis") ? figureAlias(viewer.id) : null,
    moduleAllows(viewer, "misi", settings.modules) ? pointTotals().catch(() => null) : null,
  ]);
  return <SayaScreen name={viewer.name} fullName={viewer.fullName} line={profileLine(viewer)} photo={viewer.photo}
    room={viewer.room ? roomRow(viewer.room, lang) : null} carbon={moduleOn(settings.modules, "karbon")} mosaic={moduleOn(settings.modules, "mozaik")}
    figure={alias ? { name: alias.alias, persona: alias.persona, colors: alias.colors } : null}
    points={totals?.migrated ? totals.data.get(viewer.id)?.points ?? 0 : null}
    demo={viewer.demo?.canSwitch ? viewer.demo.role : null} />;
}
