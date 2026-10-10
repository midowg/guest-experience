import { z } from "zod";
import { listRsvps } from "@/lib/server/responses";
import { handle, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const idSchema = z.uuid();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const id = validate(idSchema, (await params).id);
    const url = new URL(request.url);
    const attendance = url.searchParams.get("attendance");
    const result = await listRsvps(id, {
      page: Number(url.searchParams.get("page")) || 1,
      attendance: attendance === "yes" || attendance === "no" ? attendance : undefined,
      q: (url.searchParams.get("q") ?? "").trim().slice(0, 100) || undefined,
    });
    return success(result, "Daftar konfirmasi dimuat.");
  });
}
