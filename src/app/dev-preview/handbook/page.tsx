import { notFound } from "next/navigation";
import { EventExperience } from "@/components/guest/EventExperience";
import { smTdnYogyakarta } from "@/lib/fixtures/sm-tdn-yogyakarta";
import { getPublicEventByCode } from "@/lib/server/events";
import type { EventLanguage, EventPhase } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Layout check for the Handbook trip template with the Surya Madistrindo data. ?phase=day|after shows the other phases; ?lang=en|id_en the English page;
 * ?code=SMTDN6 a published event as it is now (read-only), to check its photos and layout. */
export default async function DevHandbookPage({ searchParams }: { searchParams: Promise<{ phase?: string; lang?: string; code?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { phase, lang, code } = await searchParams;
  const published = code ? await getPublicEventByCode(code.toUpperCase()) : null;
  const base = published ?? smTdnYogyakarta();
  const language = (["id", "en", "id_en"] as EventLanguage[]).find(value => value === lang) ?? base.language;
  return <EventExperience event={{ ...base, language }} preview phase={(["before", "day", "after"] as EventPhase[]).find(value => value === phase) ?? "before"} />;
}
