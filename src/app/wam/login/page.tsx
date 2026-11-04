import { redirect } from "next/navigation";
import { LoginForm } from "@/components/pra-wam/LoginForm";
import { ThemeSwitch } from "@/components/pra-wam/ThemeSwitch";
import { safePraWamNext } from "@/lib/pra-wam/session-token";
import { praWamPath } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { currentMember } from "@/lib/server/pra-wam/session";
import { readWamTheme } from "@/lib/server/pra-wam/theme";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk · WAM", robots: { index: false } };

export default async function PraWamLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safePraWamNext((await searchParams).next);
  if (isSupabaseConfigured() && await currentMember()) redirect(next ?? praWamPath.home);
  return <div className={`${styles.app} ${styles.login}`}><LoginForm next={next} /><ThemeSwitch initial={await readWamTheme()} compact /></div>;
}
