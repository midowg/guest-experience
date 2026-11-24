import { checkOrigin, handle, success } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { checkMyPhotos } from "@/lib/server/main-wam/misi/deteksi";

export const dynamic = "force-dynamic";

/**
 * POST: "Periksa fotoku": my newest Momen photos that were never looked at (at most 30) are checked against the
 * missions; each match is sent or only offered as my switch says. The answer counts and names them, never where a photo was taken.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const context = await requireActionApi("misi");
    checkOrigin(request);
    const { checked, results } = await checkMyPhotos(context);
    return success({ checked, results: results.map(({ photoId, missionId, title, points, status, outcome, completionStatus }) => ({ photoId, missionId, title, points, status, outcome, completionStatus })) },
      results.length ? "Pemeriksaan selesai." : "Tidak ada foto yang cocok dengan misi.");
  });
}
