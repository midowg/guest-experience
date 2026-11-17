import { notFound } from "next/navigation";
import { WELLBEING_ADMIN_SECTIONS } from "@/lib/routes";
import { AdminPreview } from "./Preview";

export const dynamic = "force-dynamic";
export const metadata = { title: { absolute: "Admin Wellbeing (pratinjau)" }, robots: { index: false, follow: false } };

/**
 * Admin Wellbeing on sample data (17 Nov 2026), no sign-in and no database: the page's requests are
 * answered in the browser (src/components/wellbeing-admin/preview-mock.ts). Development only; never
 * reachable in a production build. Every name is made up. ?belumsiap=1: before migration 202611170002.
 */
export default async function DevWellbeingAdminPage({ params, searchParams }: { params: Promise<{ section?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { section = [] } = await params;
  if (section.length > 1 || (section[0] && !(WELLBEING_ADMIN_SECTIONS as readonly string[]).includes(section[0]))) notFound();
  const search = await searchParams;
  return <AdminPreview notReady={search.belumsiap === "1"} />;
}
