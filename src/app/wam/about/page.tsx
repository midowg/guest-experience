import { AboutText } from "@/components/pra-wam/BerandaCards";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { praWamPath } from "@/lib/routes";
import { getAbout } from "@/lib/server/pra-wam/about";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apa itu WAM? · WAM", robots: { index: false } };

/** "Apa itu WAM?" in full, opened from its card on Beranda; the super admin writes the text. */
export default async function AboutPage() {
  const member = await requireMemberPage(praWamPath.about);
  const { about } = await getAbout();
  return <PraWamShell member={member} back={{ href: praWamPath.home, title: "Apa itu WAM?" }}>
    <AboutText about={about} />
  </PraWamShell>;
}
