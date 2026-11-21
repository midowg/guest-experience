import type { Viewport } from "next";
import { cookies } from "next/headers";
import { copies } from "@/lib/hr/copy";
import { asLang, LANG_COOKIE } from "@/lib/hr/lang";
import { redirect } from "next/navigation";
import { HrNewPassword } from "@/components/hr/HrAuth";
import { safePraWamNext } from "@/lib/pra-wam/session-token";
import { hrPath } from "@/lib/routes";
import { requireHrPage } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";
/** The status bar takes the blue of the page top. */
export const viewport: Viewport = { themeColor: "#1551A0" };
export async function generateMetadata() {
  return { title: copies[asLang((await cookies()).get(LANG_COOKIE)?.value)].auth.newTitle };
}

/** After signing in with the first password: pick a new one, or skip for now. Anyone else goes straight on. */
export default async function HrNewPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const asked = safePraWamNext((await searchParams).next);
  const next = asked?.startsWith(hrPath.home) ? asked : hrPath.home;
  const member = await requireHrPage(hrPath.newPassword(next));
  if (!member.mustChangePassword) redirect(next);
  return <HrNewPassword next={next} />;
}
