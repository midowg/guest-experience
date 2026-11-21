import { z } from "zod";
import { handle, success, validate } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { loadAgenda } from "@/lib/server/main-wam/peserta/agenda";

export const dynamic = "force-dynamic";
const query = z.object({ hari: z.string().regex(/^(\d{1,2}|h\d{1,2})$/, "Hari tidak dikenal.").optional() });

/** GET ?hari=1–4 (or h3: Persiapan, three days before the first day; module Ceklis): one day of the agenda (published and cancelled sessions, never drafts). */
export async function GET(request: Request) {
  return handle(async () => {
    const context = await requireMainWamApi();
    const { hari } = validate(query, Object.fromEntries(new URL(request.url).searchParams));
    return success(await loadAgenda(context, hari, new Date()), "Agenda dimuat.");
  });
}
