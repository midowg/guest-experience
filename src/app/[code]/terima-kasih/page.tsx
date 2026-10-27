import { ThanksPage, eventMetadata, StorageMissing } from "@/app/_guest/pages";
import { eventByCode, eventByCodeQuietly } from "@/app/_guest/find";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params) {
  return eventMetadata(isSupabaseConfigured() ? await eventByCodeQuietly((await params).code) : null);
}

/** invitation.werkudara.group/AB23CD/terima-kasih: the thank-you page the host sends after the visit. */
export default async function ShortThanksPage({ params }: Params) {
  if (!isSupabaseConfigured()) return <StorageMissing />;
  return <ThanksPage event={await eventByCode((await params).code, "/terima-kasih")} />;
}
