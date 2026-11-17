import { groupsPostSchema } from "@/lib/main-wam/admin/requests";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { createGroup, importGroups } from "@/lib/server/main-wam/admin/groups";

export const dynamic = "force-dynamic";

/**
 * POST Admin WAM → Main WAM → Kelompok: {action: "tambah", group} adds an empty kelompok;
 * {action: "impor", groups} saves a checked paste (each listed kelompok gets exactly its rows).
 * Publishing kelompok to participants is mainWamAdminApi.eventInfo {groupsPublished}.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(groupsPostSchema, await readJson(request, 200_000));
    if (input.action === "tambah") return success(await createGroup(input.group), `Kelompok ${input.group.number} ditambahkan.`);
    const result = await importGroups({ groups: input.groups });
    return success(result, `${result.saved} kelompok tersimpan dari spreadsheet.`);
  });
}
