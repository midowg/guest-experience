import { handle } from "@/lib/server/http";
import { cmsExcel } from "@/lib/server/leadership-reset";

export const dynamic = "force-dynamic";

/** GET: every answer as Excel, one row per leader (the CMS's Unduh Excel). */
export async function GET() {
  return handle(async () => {
    const file = await cmsExcel();
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
