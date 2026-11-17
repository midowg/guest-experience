import { z } from "zod";
import { requireSuperAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { actOnVoucher } from "@/lib/server/wellbeing/vouchers";
import { voucherActionSchema } from "@/lib/wellbeing/rules";

export const dynamic = "force-dynamic";

const said = { revoke: "Voucher dibatalkan. Poinnya kembali ke saldo karyawan.", refund: "Poin voucher dikembalikan ke saldo karyawan.", restore: "Kartu dikembalikan seperti sebelum re-roll." } as const;

/** POST { action: revoke | refund | restore, reason }: correct one voucher (super admin, 18 Nov 2026). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    const id = validate(z.uuid("Voucher tidak dikenali."), (await params).id);
    const input = validate(voucherActionSchema, await readJson(request, 2_000));
    return success(await actOnVoucher(id, input), said[input.action]);
  });
}
