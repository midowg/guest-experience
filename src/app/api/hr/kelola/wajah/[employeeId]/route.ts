import { z } from "zod";
import { EMBEDDING_SIZE } from "@/lib/hr/face-match";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { decideFace, setImportedFace } from "@/lib/server/hr/attendance";
import { actorOf, requireApiHrAdmin } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ employeeId: string }> };

const schema = z.union([
  z.object({ action: z.enum(["setujui", "reset"]) }),
  z.object({ action: z.literal("tolak"), note: z.string().trim().min(3, "Tulis alasannya.").max(300) }),
  // "Proses foto impor": what the admin's browser read from the GreatDay photo, or why it could not.
  z.object({ action: z.literal("proses"), embedding: z.array(z.number().finite().min(-10).max(10)).length(EMBEDDING_SIZE) }),
  z.object({ action: z.literal("proses"), problem: z.string().trim().min(3).max(120) }),
]);

/** POST {action}: Admin HR decides a reference face, or stores what was read from an imported photo. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiHrAdmin();
    checkOrigin(request);
    const employeeId = validate(z.uuid(), (await params).employeeId);
    const input = validate(schema, await readJson(request, 10_000));
    if (input.action === "proses") {
      const status = await setImportedFace(employeeId, "embedding" in input ? { embedding: input.embedding } : { problem: input.problem });
      return success({ status }, status === "siap" ? "Foto terbaca. Menunggu persetujuan karyawan." : "Foto tidak terbaca; orangnya diminta daftar wajah.");
    }
    const decision = input.action;
    await decideFace(employeeId, decision, actorOf(member), "note" in input ? input.note : "");
    return success(null, decision === "setujui" ? "Wajah disetujui." : decision === "tolak" ? "Wajah ditolak; orangnya diminta daftar ulang." : "Wajah dihapus; orangnya bisa daftar ulang.");
  });
}
