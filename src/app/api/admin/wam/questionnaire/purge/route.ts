import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, success } from "@/lib/server/http";
import { purgeStayData } from "@/lib/server/pra-wam/purge";
import { currentForm, questionnaireWaiting } from "@/lib/server/pra-wam/questionnaire";

export const dynamic = "force-dynamic";

/** POST: "Hapus sekarang", deletes the stay and health data and the room pairing; only from the date set in Pengaturan. Any admin. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const form = await currentForm();
    if (!form) throw questionnaireWaiting();
    const result = await purgeStayData(form);
    return success(result, `Dihapus: ${result.answers} jawaban dan ${result.roommates} penempatan kamar.`);
  });
}
