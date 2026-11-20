import { activityPostSchema } from "@/lib/main-wam/admin/requests";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { createActivityGroup, importActivityGroups } from "@/lib/server/main-wam/admin/groups";

export const dynamic = "force-dynamic";

/**
 * POST Admin WAM 2027 → Kelompok kegiatan: {action: "tambah", group, employeeIds?} adds
 * one (a post, a minibus, a table) to a session; {action: "impor", sessionId, groups} saves a
 * checked paste of one session.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(activityPostSchema, await readJson(request, 200_000));
    if (input.action === "tambah") return success(await createActivityGroup(input.group, input.employeeIds ?? []), `${input.group.label} ditambahkan.`);
    const result = await importActivityGroups({ sessionId: input.sessionId, groups: input.groups });
    return success(result, `${result.saved} kelompok kegiatan tersimpan dari spreadsheet.`);
  });
}
