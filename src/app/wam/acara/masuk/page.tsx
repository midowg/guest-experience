import { redirect } from "next/navigation";
import { safePraWamNext } from "@/lib/pra-wam/next-path";
import { mainWamPath, praWamPath } from "@/lib/routes";
import { currentMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk · WAM", robots: { index: false } };

/**
 * O02 Masuk, Main WAM's own sign-in: the same account and API as WAM (praWamApi.login), drawn in
 * Main WAM's theme. PLACEHOLDER (fondasi) until agen A builds O02; until then it hands over to
 * WAM's sign-in. Rules to keep (KONTRAK §3): it shows only in mode semua (otherwise Pra WAM's
 * sign-in, so Main WAM's look never reaches someone it is not on for), a signed-in person goes
 * straight on, and `next` is checked with safePraWamNext.
 */
export default async function MainWamLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safePraWamNext((await searchParams).next) ?? mainWamPath.home;
  if (await currentMember().catch(() => null)) redirect(next);
  // Agen A: show O02 here only when (await readMainWamSettings()).mode === "semua"; otherwise keep this.
  redirect(praWamPath.login(next));
}
