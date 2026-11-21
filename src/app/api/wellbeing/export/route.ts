import { checkOrigin, enforceRateLimit, handle, readJson, validate } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { myExportSchema, myExportWorkbook } from "@/lib/server/wellbeing/member-export";

export const dynamic = "force-dynamic";

/**
 * POST { period, from, to }: Profil → Unduh rekap saya (19 Nov 2026). The answer is my own recap as an
 * Excel file (.xlsx), or the usual JSON error.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "wellbeing-my-export", 20);
    const input = validate(myExportSchema, await readJson(request, 2_000));
    const { file, name } = await myExportWorkbook(member, input);
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
