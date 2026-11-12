import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader } from "@/components/console";
import { MinutesRuleCard } from "@/components/admin/wam/MinutesRuleCard";
import { PraWamEvents } from "@/components/admin/wam/PraWamEvents";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamCrumbs, wamSection } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { listEvents } from "@/lib/server/pra-wam/events";
import { minutesRuleSetting } from "@/lib/server/pra-wam/minutes-rule";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("acara").label} · Admin WAM` };

/** Any admin: Pra WAM and WAM, their status and the modules they open, and which meetings need a MoM. */
export default async function WamEventsPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [{ events, migrated }, minutes] = await Promise.all([listEvents(), minutesRuleSetting()]);
  return <WamAdminFrame current="acara">
    <PageHeader crumbs={wamCrumbs("acara")} title={wamSection("acara").label}
      subtitle="Satu aplikasi untuk Pra WAM dan WAM. Acara berstatus Disiapkan belum tampil untuk peserta; menutup modul Book menutup booking ruang." />
    <div className="stack">
      <PraWamEvents initial={events} migrated={migrated} />
      <MinutesRuleCard initial={minutes.rule} migrated={minutes.migrated} />
    </div>
  </WamAdminFrame>;
}
