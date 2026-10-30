import { notFound } from "next/navigation";
import { EventExperience } from "@/components/guest/EventExperience";
import { smTdnYogyakarta } from "@/lib/fixtures/sm-tdn-yogyakarta";
import type { EventPhase } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Layout check for the Handbook trip template with the Surya Madistrindo data. ?phase=day|after shows the other phases. */
export default async function DevHandbookPage({ searchParams }: { searchParams: Promise<{ phase?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { phase } = await searchParams;
  return <EventExperience event={smTdnYogyakarta()} preview phase={(["before", "day", "after"] as EventPhase[]).find(value => value === phase) ?? "before"} />;
}
