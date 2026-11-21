import { formSaveSchema } from "@/lib/leadership-reset/form";
import { LEADERSHIP_RESET_KEY_HEADER } from "@/lib/routes";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { saveForm } from "@/lib/server/leadership-reset";

export const dynamic = "force-dynamic";

/** PUT {content, isOpen} (CMS key in the header): the form's text and questions, and whether it takes answers. */
export async function PUT(request: Request) {
  return handle(async () => {
    checkOrigin(request);
    const view = await saveForm(request.headers.get(LEADERSHIP_RESET_KEY_HEADER), validate(formSaveSchema, await readJson(request, 40_000)));
    return success(view, "Form tersimpan. Leader langsung melihat versi baru.");
  });
}
