import { missionSchema } from "@/lib/main-wam/misi/schema";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { adminMisi, createMission } from "@/lib/server/main-wam/misi/admin";

export const dynamic = "force-dynamic";

/** GET: missions with their counts, completions, the Peringkat (full names), manual points and the settings. */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await adminMisi(), "");
  });
}

/** POST: a new mission. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(missionSchema, await readJson(request, 5_000));
    await createMission(input);
    return success(null, input.active ? "Misi dibuat dan aktif." : "Misi dibuat. Nyalakan Aktif bila sudah siap.");
  });
}
