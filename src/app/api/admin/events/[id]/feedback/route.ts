import { z } from "zod";
import { listFeedback } from "@/lib/server/responses";
import { handle, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
const idSchema = z.uuid();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireApiAdmin();
    const id = validate(idSchema, (await params).id);
    const page = Number(new URL(request.url).searchParams.get("page")) || 1;
    return success(await listFeedback(id, page), "Masukan dimuat.");
  });
}
