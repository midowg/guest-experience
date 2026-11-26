import { drinkSlugSchema } from "@/lib/coffee/schemas";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { DRINK_PHOTO_MAX_BYTES, setDrinkPhoto } from "@/lib/server/coffee/menu";
import { coffeeActor } from "@/lib/server/coffee/session";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, enforceRateLimit, handle, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string }> };
const TOO_BIG = "Ukuran foto paling besar 5 MB.";

/**
 * POST (multipart, field "file"): the drink's photo. JPEG, PNG or WebP by its first bytes (never
 * SVG), 5 MB at most; the server crops it to a square, stores it as WebP under a name of its own,
 * and removes the upload it replaces.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await enforceRateLimit(request, "coffee-foto", 60);
    const slug = validate(drinkSlugSchema, (await params).slug);
    const length = Number(request.headers.get("content-length"));
    if (length > DRINK_PHOTO_MAX_BYTES + 8192) throw new ServiceError(413, TOO_BIG, { photo: [TOO_BIG] });
    const form = await request.formData().catch(() => { throw new ServiceError(400, "Unggahan tidak terbaca. Pilih fotonya lagi."); });
    const file = form.get("file");
    if (!(file instanceof File)) throw new ServiceError(422, "Periksa kembali isian formulir.", { photo: ["Pilih satu berkas foto."] });
    if (file.size > DRINK_PHOTO_MAX_BYTES) throw new ServiceError(413, TOO_BIG, { photo: [TOO_BIG] });
    const drink = await setDrinkPhoto(slug, new Uint8Array(await file.arrayBuffer()), await coffeeActor());
    return success({ drink }, `Foto ${drink.name} diganti.`);
  });
}
