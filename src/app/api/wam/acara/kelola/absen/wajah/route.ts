import { tabletRequestSchema } from "@/lib/main-wam/panitia/face-tablet";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { apiOnlyFor, limitPerPerson } from "@/lib/server/main-wam/panitia/common";
import { identifyFaces } from "@/lib/server/main-wam/panitia/face-tablet";

export const dynamic = "force-dynamic";

/** Size of a request: six faces of 128 numbers is about 20 KB; anything near this is not a tablet. */
const MAX_BYTES = 40_000;
/** At most this many calls in 10 minutes for one panitia (one call per second at the busiest). */
const LIMIT = 900;

/**
 * POST {sessionId, faces: [{embedding, seenAt?}]}: Absen mode tablet. Who the faces in view are
 * (found among the event's enrolled faces by the stricter one-to-many rule), recorded as present
 * inside the session's window. Only numbers arrive, never a picture; nothing about a face is logged
 * or kept. Panitia only, with module Absen QR on: anyone else, or the module off, is 404.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const gate = apiOnlyFor(await requireMainWamApi(), "kelola", "absen");
    checkOrigin(request);
    await limitPerPerson("wajah", gate.viewer.id, LIMIT);
    const input = validate(tabletRequestSchema, await readJson(request, MAX_BYTES));
    return success(await identifyFaces(gate, input), "Wajah dibaca.");
  });
}
