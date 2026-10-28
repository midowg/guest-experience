import { ArrivalPage, eventMetadata, StorageMissing } from "@/app/_guest/pages";
import { eventByCode, eventByCodeQuietly } from "@/app/_guest/find";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params) {
  return eventMetadata(isSupabaseConfigured() ? await eventByCodeQuietly((await params).code) : null);
}

/** invitation.werkudara.group/AB23CD/panduan: the visit's way here, on a page of its own. */
export default async function ShortArrivalPage({ params }: Params) {
  if (!isSupabaseConfigured()) return <StorageMissing />;
  return <ArrivalPage event={await eventByCode((await params).code, "/panduan")} />;
}
