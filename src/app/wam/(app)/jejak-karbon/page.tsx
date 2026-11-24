import { redirect } from "next/navigation";
import { CarbonPage } from "@/components/pra-wam/carbon/CarbonHome";
import { bodOnly } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { myCarbon } from "@/lib/server/pra-wam/carbon";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jejak karbon · WAM", robots: { index: false } };

/**
 * Jejak karbon on a page of its own (24 Nov 2026, instead of a sheet, which sat above the bottom bar
 * on a phone): the calculator, how it is counted with the sources, and small habits. Only for the
 * people in Misi Perjalanan's list (HoD, BoD) once the panitia set the trip; anyone else goes home.
 */
export default async function CarbonScreen() {
  const member = await requireMemberPage(praWamPath.carbon);
  const carbon = await myCarbon(member).catch(() => null);
  if (!carbon) redirect(bodOnly(member) ? praWamPath.dashboard : praWamPath.home);
  return <CarbonPage setup={carbon.setup} occupants={carbon.occupants} travel={carbon.travel} />;
}
