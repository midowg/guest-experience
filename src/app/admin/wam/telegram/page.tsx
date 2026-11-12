import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PraWamTelegram } from "@/components/admin/wam/PraWamTelegram";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamCrumbs, wamSection } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { telegramStatus } from "@/lib/server/pra-wam/telegram";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("telegram").label} · Admin WAM` };

/** Any admin (12 Nov 2026): the MoM bot, its webhook, and the Telegram group of each department. */
export default async function WamTelegramPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <WamAdminFrame current="telegram">
    <PraWamTelegram initial={await telegramStatus()} crumbs={wamCrumbs("telegram")} />
  </WamAdminFrame>;
}
