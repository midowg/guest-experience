import { LEADERSHIP_RESET_KEY_HEADER } from "@/lib/routes";
import { handle } from "@/lib/server/http";
import { coachExcel } from "@/lib/server/leadership-reset";

export const dynamic = "force-dynamic";

/** GET (coach key in the header): every answer as Excel, one row per leader. */
export async function GET(request: Request) {
  return handle(async () => {
    const file = await coachExcel(request.headers.get(LEADERSHIP_RESET_KEY_HEADER));
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="refleksi-leader-${day}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
