import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { copies } from "@/lib/hr/copy";
import { asLang, LANG_COOKIE } from "@/lib/hr/lang";
import { HR_SUB_TABS, hrTabPaths } from "@/lib/hr/tabs";
import { HrScreen } from "../HrScreen";

export const dynamic = "force-dynamic";

const isTab = (tab: string): tab is (typeof HR_SUB_TABS)[number] => (HR_SUB_TABS as readonly string[]).includes(tab);

export async function generateMetadata({ params }: { params: Promise<{ tab: string }> }) {
  const [{ tab }, jar] = await Promise.all([params, cookies()]);
  const t = copies[asLang(jar.get(LANG_COOKIE)?.value)];
  return { title: isTab(tab) ? t.tabs[tab] : t.lang === "id" ? "Tidak ditemukan" : "Not found" };
}

/** Riwayat, Tim, Pengajuan, Profil (21 Nov 2026): the same app as Beranda, opened at that place. */
export default async function HrTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (!isTab(tab)) notFound();
  return <HrScreen here={hrTabPaths[tab]} />;
}
