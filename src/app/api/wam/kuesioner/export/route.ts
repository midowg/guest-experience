import { handle } from "@/lib/server/http";
import { bodSurveyExport } from "@/lib/server/pra-wam/bod-survey";
import { sameOriginRead } from "@/lib/server/pra-wam/hr-lock";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** GET ?isi=jawaban|ringkasan: Data kuesioner for BoD as .xlsx (see bod-survey.ts for what goes in). */
export async function GET(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    sameOriginRead(request);
    const isi = new URL(request.url).searchParams.get("isi") === "ringkasan" ? "ringkasan" : "jawaban";
    const { file, name } = await bodSurveyExport(member, isi);
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
