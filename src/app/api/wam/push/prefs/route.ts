import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { PUSH_TOPICS, pushPrefsSchema } from "@/lib/pra-wam/push";
import { readPushPrefs, savePushPrefs } from "@/lib/server/pra-wam/push";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** GET: which topics reach this person's phone (their choice, else the default), and every topic in order. */
export async function GET() {
  return handle(async () => {
    const member = await requireApiMember();
    return success({ prefs: await readPushPrefs(member), topics: PUSH_TOPICS }, "Siap.");
  });
}

/**
 * PUT {prefs}: the person's choices, topic → on/off, one topic (the switch flipped) or several;
 * merged into what was stored. Pengumuman is never stored: it stays on.
 */
export async function PUT(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const { prefs } = validate(pushPrefsSchema, await readJson(request, 2_000));
    return success({ prefs: await savePushPrefs(member, prefs) }, "Pilihan notifikasi disimpan.");
  });
}
