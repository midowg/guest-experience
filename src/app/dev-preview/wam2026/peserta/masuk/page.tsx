import { notFound } from "next/navigation";
import { previewLang } from "@/components/main-wam/dev/lang";
import { LangProvider } from "@/components/main-wam/i18n";
import { MainWamTheme } from "@/components/main-wam/theme";
import { LoginScreen } from "@/components/main-wam/peserta/masuk/LoginScreen";
import { barlow } from "@/components/main-wam/peserta/masuk/font";
import { Splash } from "@/components/main-wam/peserta/masuk/Splash";
import { eventDateRange, splashSubtitle } from "@/lib/main-wam/peserta/splash";
import { mainWamPath } from "@/lib/routes";

export const dynamic = "force-dynamic";

/**
 * O02 Masuk (dev-preview; nothing is sent): ?status=memuat|salah|terkunci|offline|lupa.
 * O01 Splash: ?status=splash (held, no fade), &kv=1 with a sample splash image (theme slot `splash`).
 */
export default async function PreviewLogin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const { status, kv } = params;
  const lang = previewLang(params);
  const image = kv === "1" ? "https://picsum.photos/seed/main-wam-kv/780/1688" : null;
  const error = status === "salah" || status === "terkunci" || status === "offline" ? status : undefined;
  return <MainWamTheme mode={params.mode === "dark" ? "dark" : "light"} theme={image ? { images: { splash: image } } : null}><LangProvider lang={lang}><div className={barlow.variable}>
    {status === "splash" && <Splash title="WAM 2026" subtitle={splashSubtitle("WAM 2026")} dates={eventDateRange("2027-01-04", "2027-01-07", lang)} venue="Kota Batu" image={!!image} hold />}
    <LoginScreen next={mainWamPath.home} eventName="WAM 2026" preview={{ email: "rani@example.com", error, busy: status === "memuat", forgot: status === "lupa" }} />
  </div></LangProvider></MainWamTheme>;
}
