import { requireSuperAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { adminVouchers, grantVoucher } from "@/lib/server/wellbeing/vouchers";
import { voucherGrantSchema } from "@/lib/wellbeing/rules";

export const dynamic = "force-dynamic";

/** GET: every re-roll voucher, the people, and the Legendary quota (super admin, 18 Nov 2026). */
export async function GET() {
  return handle(async () => {
    await requireSuperAdmin();
    return success(await adminVouchers(), "Voucher dimuat.");
  });
}

/** POST { employeeId, legendary, note }: a voucher by hand, without points. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    const input = validate(voucherGrantSchema, await readJson(request, 2_000));
    return success(await grantVoucher(input), input.legendary ? "Voucher Legendary diberikan." : "Voucher re-roll diberikan.");
  });
}
