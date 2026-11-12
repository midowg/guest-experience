import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/shared/AdminShell";
import { MinutesRuleCard } from "@/components/admin/wam/MinutesRuleCard";
import { ConsoleTheme } from "@/components/console";
import { DEFAULT_MINUTES_RULE } from "@/lib/pra-wam/minutes";

export const dynamic = "force-dynamic";

/** Layout check for Admin WAM → Acara dan modul → Notulen (MoM). Saving is refused without a session. */
export default function DevMinutesRulePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminShell bare><ConsoleTheme canvas><div style={{ padding: 24, maxWidth: 640 }}><MinutesRuleCard initial={DEFAULT_MINUTES_RULE} migrated /></div></ConsoleTheme></AdminShell>;
}
