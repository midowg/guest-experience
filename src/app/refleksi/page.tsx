import type { Metadata, Viewport } from "next";
import { LiveReflectionForm } from "@/components/leadership-reset/Live";
import { wibDateLabel } from "@/lib/leadership-reset/form";
import { publicForm } from "@/lib/server/leadership-reset";

export const dynamic = "force-dynamic";
/** Its own title and preview (not Journey's), from the text set in the CMS. */
export async function generateMetadata(): Promise<Metadata> {
  const { content } = await publicForm();
  const title = `Refleksi Leader · ${content.title}`;
  const description = `Refleksi diri sebelum training ${content.title}${content.tagline ? ` – "${content.tagline}"` : ""} bersama ${content.coach}${content.trainingDate ? `, ${wibDateLabel(content.trainingDate)}` : ""}. Sekitar 5 menit.`;
  return {
    title: { absolute: title }, description, applicationName: "Refleksi Leader",
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website", locale: "id_ID", siteName: "Werkudara" },
    twitter: { card: "summary_large_image", title, description },
  };
}
export const viewport: Viewport = { themeColor: "#0E1116" };

/** Refleksi Leader (19 Nov 2026): the leader's form, no sign-in. */
export default async function LeadershipResetPage() {
  const form = await publicForm();
  return <LiveReflectionForm content={form.content} isOpen={form.migrated && form.isOpen} now={new Date().toISOString()} />;
}
