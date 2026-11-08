import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, success } from "@/lib/server/http";
import { praWamPath } from "@/lib/routes";
import { pushPublicKey, sendPush } from "@/lib/server/pra-wam/push";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** POST: a test notification to the person's own phones, sent now, with how many it reached. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    if (!pushPublicKey()) throw new ServiceError(503, "Notifikasi HP belum disiapkan di server.");
    const result = await sendPush([member.id], { title: "Tes notifikasi WAM", body: "Notifikasi di HP ini sudah jalan.", url: praWamPath.notifications, tag: "tes" });
    if (!result.phones) throw new ServiceError(404, "Belum ada HP yang aktif untuk akunmu. Aktifkan dulu di HP ini.");
    return success(result, result.sent ? `Tes terkirim ke ${result.sent} perangkat.` : "Tes gagal terkirim. Coba matikan lalu aktifkan lagi.");
  });
}
