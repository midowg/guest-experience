import type { Metadata, Viewport } from "next";
import { LiveReflectionForm } from "@/components/leadership-reset/Live";
import { publicForm } from "@/lib/server/leadership-reset";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Refleksi Leader · Leadership Reset", description: "Refleksi diri sebelum training Leadership Reset.", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#0E1116" };

/** Refleksi Leader (19 Nov 2026): the leader's form, no sign-in. */
export default async function LeadershipResetPage() {
  const form = await publicForm();
  return <LiveReflectionForm content={form.content} isOpen={form.migrated && form.isOpen} now={new Date().toISOString()} />;
}
