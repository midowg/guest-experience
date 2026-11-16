import type { Metadata, Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import { WellbeingApp } from "@/components/wellbeing/WellbeingApp";
import { WELLBEING_PATH, wellbeingPath } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { currentMember } from "@/lib/server/pra-wam/session";
import { WELLBEING_SECTIONS, type WbMe } from "@/lib/wellbeing/app-types";

export const dynamic = "force-dynamic";
/** A phone app: drawn under the notch (safe areas in CSS), and the keyboard shrinks the page so sheets keep their buttons in view. */
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" };
export const metadata: Metadata = { title: { absolute: "Wellbeing" }, applicationName: "Wellbeing", robots: { index: false, follow: false } };

/**
 * Wellbeing for employees (17 Nov 2026): one page for /wellbeing and its sections (Beranda,
 * Riwayat, Peringkat, Profil). The server only checks who is signed in (the WAM account; a
 * stranger goes to Wellbeing's own sign-in and comes back); the client app moves between sections
 * and loads data through /api/wellbeing without another page load.
 */
export default async function WellbeingPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section = [] } = await params;
  if (section.length > 1 || (section[0] && !(WELLBEING_SECTIONS as readonly string[]).includes(section[0]))) notFound();
  // Beranda is /wellbeing itself.
  if (section[0] === "beranda") redirect(WELLBEING_PATH);
  if (!isSupabaseConfigured()) {
    return <main style={{ maxWidth: 480, margin: "0 auto", padding: "3rem 1rem", lineHeight: 1.5 }}>
      <h1 style={{ fontSize: "1.25rem", margin: "0 0 .5rem" }}>Wellbeing belum siap</h1>
      <p style={{ margin: 0 }}>Aplikasi ini belum tersambung ke database. Coba lagi nanti, atau kabari admin Wellbeing.</p>
    </main>;
  }
  const member = await currentMember();
  if (!member) redirect(wellbeingPath.login(section[0] ? `${WELLBEING_PATH}/${section[0]}` : WELLBEING_PATH));
  const me: WbMe = { id: member.id, name: member.name, nickname: member.nickname, department: member.department, position: member.position };
  return <WellbeingApp me={me} />;
}
