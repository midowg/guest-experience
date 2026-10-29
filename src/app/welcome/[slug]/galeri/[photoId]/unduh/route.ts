import { photoDownloadResponse } from "@/app/_guest/pages";
import { welcomeEventQuietly } from "@/app/_guest/find";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; photoId: string }> }) {
  const { slug, photoId } = await params;
  return photoDownloadResponse(isSupabaseConfigured() ? await welcomeEventQuietly(slug) : null, photoId);
}
