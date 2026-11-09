import { notFound } from "next/navigation";
import { InstallArt } from "@/components/pra-wam/InstallArt";
import { InstallGuide } from "@/components/pra-wam/InstallGuide";
import type { InstallArtKind } from "@/lib/pra-wam/install";
import base from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";

const KINDS: InstallArtKind[] = ["ios-more", "ios-share-menu", "ios-share-chrome", "ios-add", "ios-webapp", "android-menu", "android-install", "android-confirm", "samsung-menu", "samsung-plus", "samsung-add", "desktop-install", "desktop-dialog", "home-icon", "wam-notif", "allow-prompt", "ios-settings-notif", "android-settings-notif", "desktop-site-notif"];

/** Layout check for Pengaturan → Install WAM: ?tema=gelap for dark; ?semua=1 shows every picture. */
export default async function DevInstallPage({ searchParams }: { searchParams: Promise<{ tema?: string; semua?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { tema, semua } = await searchParams;
  return <div data-wam-theme={tema === "gelap" ? "dark" : "light"}><div className={base.app} style={{ minHeight: "100vh", padding: 20 }}>
    {semua
      ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 16 }}>
        {KINDS.map(kind => <figure key={kind} style={{ margin: 0 }}><InstallArt kind={kind} /><figcaption style={{ fontSize: 11 }}>{kind}</figcaption></figure>)}
      </div>
      : <div style={{ maxWidth: 480 }}><InstallGuide /></div>}
  </div></div>;
}
