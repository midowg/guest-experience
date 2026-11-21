import { z } from "zod";
import { EMBEDDING_SIZE } from "@/lib/hr/face-match";
import { photoStartSchema } from "@/lib/pra-wam/photo";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { decideFace, importFaceFromLink, setImportedFace, setUploadedFace } from "@/lib/server/hr/attendance";
import { hrAdminActor } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ employeeId: string }> };

const schema = z.union([
  z.object({ action: z.enum(["setujui", "reset"]) }),
  z.object({ action: z.literal("tolak"), note: z.string().trim().min(3, "Tulis alasannya.").max(300) }),
  // "Proses foto impor": what the admin's browser read from the GreatDay photo, or why it could not.
  z.object({ action: z.literal("proses"), embedding: z.array(z.number().finite().min(-10).max(10)).length(EMBEDDING_SIZE) }),
  z.object({ action: z.literal("proses"), problem: z.string().trim().min(3).max(120) }),
  // "Unggah foto acuan": the photo Admin HR uploaded for this person (startFaceUpload) and what their browser read from it.
  photoStartSchema.extend({
    action: z.literal("unggah"), key: z.string().min(10).max(200), token: z.string().min(10).max(200),
    embedding: z.array(z.number().finite().min(-10).max(10)).length(EMBEDDING_SIZE),
  }),
  // "Ambil dari link GreatDay": the server fetches the base photo; the browser then reads it (proses).
  z.object({ action: z.literal("link"), url: z.string().trim().url("Link tidak dikenali.").max(1000) }),
]);

/** POST {action}: decides a reference face, or stores what was read from an imported photo. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const employeeId = validate(z.uuid(), (await params).employeeId);
    const input = validate(schema, await readJson(request, 10_000));
    if (input.action === "proses") {
      const status = await setImportedFace(employeeId, "embedding" in input ? { embedding: input.embedding } : { problem: input.problem });
      return success({ status }, status === "ditolak" ? "Foto tidak terbaca; orangnya diminta daftar wajah." : status === "siap" ? "Foto terbaca. Menunggu persetujuan karyawan." : "Foto terbaca dan langsung dipakai.");
    }
    if (input.action === "link") {
      const status = await importFaceFromLink(employeeId, input.url, await hrAdminActor());
      return success({ status }, "Foto dari GreatDay sudah diambil; sedang dibaca.");
    }
    if (input.action === "unggah") {
      const status = await setUploadedFace(employeeId, input, await hrAdminActor());
      return success({ status }, status === "aktif" ? "Foto acuan tersimpan dan langsung dipakai untuk absen." : "Foto acuan tersimpan; aktif setelah karyawannya setuju di absen pertama.");
    }
    const decision = input.action;
    await decideFace(employeeId, decision, await hrAdminActor(), "note" in input ? input.note : "");
    return success(null, decision === "setujui" ? "Wajah disetujui." : decision === "tolak" ? "Wajah ditolak; orangnya diminta daftar ulang." : "Wajah dihapus; orangnya bisa daftar ulang.");
  });
}
