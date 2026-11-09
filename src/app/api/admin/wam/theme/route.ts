import { z } from "zod";
import { WAM_LOOK_INFO, WAM_LOOKS } from "@/lib/pra-wam/theme";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { setWamLook } from "@/lib/server/pra-wam/theme";

export const dynamic = "force-dynamic";
const schema = z.object({ look: z.enum(WAM_LOOKS) });

/** PUT: the WAM app's theme for everyone (any admin). Light or dark stays each person's choice. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { look } = validate(schema, await readJson(request, 1_000));
    const state = await setWamLook(look);
    return success(state, `Tema ${WAM_LOOK_INFO[state.look].label} dipakai di aplikasi WAM.`);
  });
}
