import { photoDownloadResponse } from "@/app/_guest/pages";
import { eventByCodeQuietly } from "@/app/_guest/find";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string; photoId: string }> }) {
  const { code, photoId } = await params;
  return photoDownloadResponse(isSupabaseConfigured() ? await eventByCodeQuietly(code) : null, photoId);
}
