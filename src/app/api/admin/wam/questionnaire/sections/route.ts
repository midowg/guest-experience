import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { createSection, sectionCreateSchema } from "@/lib/server/pra-wam/questionnaire-admin";

export const dynamic = "force-dynamic";

/** POST: a new section at the end of the questionnaire (any admin). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    return success(await createSection(validate(sectionCreateSchema, await readJson(request, 10_000))), "Bagian ditambahkan.");
  });
}
