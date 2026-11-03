import { redirect } from "next/navigation";
import { LoginForm } from "@/components/pra-wam/LoginForm";
import { safePraWamNext } from "@/lib/pra-wam/session-token";
import { praWamPath } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { currentMember } from "@/lib/server/pra-wam/session";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk · Pra WAM", robots: { index: false } };

export default async function PraWamLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safePraWamNext((await searchParams).next);
  if (isSupabaseConfigured() && await currentMember()) redirect(next ?? praWamPath.home);
  return <div className={`${styles.app} ${styles.login}`}><LoginForm next={next} /></div>;
}
