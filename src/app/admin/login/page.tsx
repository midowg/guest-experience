import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/admin/shared/LoginScreen";
import { adminAuthConfig, safeNext } from "@/lib/admin-token";
import { hasAdminSession } from "@/lib/server/admin-session";
import { getHomeStyle } from "@/lib/server/admin-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk admin" };

/** Masuk admin, in the look picked in Super admin → Halaman utama (LoginScreen). */
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const configured = adminAuthConfig() !== null;
  if (configured && await hasAdminSession()) redirect(next);
  const { style } = await getHomeStyle();
  return <LoginScreen style={style} configured={configured} next={next} expired={params.berakhir === "1"} />;
}
