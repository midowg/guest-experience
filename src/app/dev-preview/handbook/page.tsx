import { notFound } from "next/navigation";
import { EventExperience } from "@/components/guest/EventExperience";
import { smTdnYogyakarta } from "@/lib/fixtures/sm-tdn-yogyakarta";
import type { EventLanguage, EventPhase } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Layout check for the Handbook trip template with the Surya Madistrindo data. ?phase=day|after shows the other phases; ?lang=en|id_en the English page. */
export default async function DevHandbookPage({ searchParams }: { searchParams: Promise<{ phase?: string; lang?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { phase, lang } = await searchParams;
  const language = (["id", "en", "id_en"] as EventLanguage[]).find(value => value === lang) ?? "id";
  return <EventExperience event={{ ...smTdnYogyakarta(), language }} preview phase={(["before", "day", "after"] as EventPhase[]).find(value => value === phase) ?? "before"} />;
}
