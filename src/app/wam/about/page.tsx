import { AboutText } from "@/components/pra-wam/BerandaCards";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { praWamPath } from "@/lib/routes";
import { getAbout } from "@/lib/server/pra-wam/about";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apa itu WAM? · WAM", robots: { index: false } };

/** "Apa itu WAM?" in full, opened from its card on Beranda; the super admin writes the text. */
export default async function AboutPage({ searchParams }: { searchParams: Promise<{ dari?: string }> }) {
  const member = await requireMemberPage(praWamPath.about);
  const [{ about }, { dari }] = await Promise.all([getAbout(), searchParams]);
  // Back to where it was opened: Pengaturan, or Beranda's card.
  const back = dari === "pengaturan" ? praWamPath.settings : praWamPath.home;
  return <PraWamShell member={member} back={{ href: back, title: "Tentang WAM" }}>
    <AboutText about={about} />
  </PraWamShell>;
}
