import { z } from "zod";
import { createEvent, listAdminEvents } from "@/lib/server/events";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const schema = z.object({ duplicateId: z.uuid().optional() });

export async function GET() {
  return handle(async () => success(await listAdminEvents(), "Daftar acara dimuat."));
}

export async function POST(request: Request) {
  return handle(async () => {
    checkOrigin(request);
    const { duplicateId } = validate(schema, await readJson(request, 10_000));
    return success(await createEvent(duplicateId), "Draft acara dibuat.");
  });
}
