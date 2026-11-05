import { AboutText } from "@/components/pra-wam/BerandaCards";
import { praWamPath } from "@/lib/routes";
import { getAbout } from "@/lib/server/pra-wam/about";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apa itu WAM? · WAM", robots: { index: false } };

/** "Apa itu WAM?" in full, opened from its card on Beranda; the super admin writes the text. */
export default async function AboutPage() {
  await requireMemberPage(praWamPath.about);
  // ?dari=pengaturan sends the back arrow to Pengaturan (src/lib/pra-wam/screen.ts).
  const { about } = await getAbout();
  return <>
    <AboutText about={about} />
  </>;
}
