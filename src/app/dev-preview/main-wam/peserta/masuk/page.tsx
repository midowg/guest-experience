import { notFound } from "next/navigation";
import { MainWamTheme } from "@/components/main-wam/theme";
import { LoginScreen } from "@/components/main-wam/peserta/masuk/LoginScreen";
import { mainWamPath } from "@/lib/routes";

export const dynamic = "force-dynamic";

/** O02 Masuk (dev-preview; nothing is sent): ?status=memuat|salah|terkunci|offline|lupa. */
export default async function PreviewLogin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { status } = await searchParams;
  const error = status === "salah" || status === "terkunci" || status === "offline" ? status : undefined;
  return <MainWamTheme mode="light">
    <LoginScreen next={mainWamPath.home} eventName="WAM 2026" preview={{ email: "rani@contoh.id", error, busy: status === "memuat", forgot: status === "lupa" }} />
  </MainWamTheme>;
}
