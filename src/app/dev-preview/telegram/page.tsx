import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/shared/AdminShell";
import { PraWamTelegram } from "@/components/admin/wam/PraWamTelegram";
import { ConsoleTheme } from "@/components/console";
import { departmentGroups, type TelegramStatus } from "@/lib/pra-wam/telegram";

export const dynamic = "force-dynamic";

/**
 * Layout check for Admin WAM → Telegram without signing in: ?keadaan=baru for a server without the
 * bot and the migration. The buttons call the real API, which refuses without an admin session.
 */
export default async function DevTelegramPage({ searchParams }: { searchParams: Promise<{ keadaan?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const fresh = (await searchParams).keadaan === "baru";
  const departments = departmentGroups(["Sales & Marketing", "Center of Excellence", "Human Resources & General Affair", "Corporate", "Business & Administrative Services"],
    { "Sales & Marketing": ["Business Solutions", "Commercial", "Corporate Marketing Communication"] });
  const status: TelegramStatus = fresh
    ? { configured: false, bot: null, botError: null, webhook: null, migrated: false, groups: [], departments }
    : {
      configured: true, bot: { username: "wam_werkudara_bot", name: "WAM Werkudara" }, botError: null, migrated: true, departments,
      webhook: { set: true, ours: true, pending: 0, lastError: "Wrong response from the webhook: 503 Service Unavailable", lastErrorAt: "2026-11-12T04:20:00Z" },
      groups: [
        { chatId: "-1001", title: "Werkudara CoE · Center of Excellence", scope: "departemen", department: "Center of Excellence", unit: null, isForum: true, momTopicId: 12, botStatus: "admin", installedAt: "2026-11-12T04:00:00Z" },
        { chatId: "-1002", title: "Werkudara SM · Commercial", scope: "departemen", department: "Sales & Marketing", unit: "Commercial", isForum: true, momTopicId: null, botStatus: "anggota", installedAt: "2026-11-12T04:00:00Z" },
        { chatId: "-1003", title: "Werkudara · HOD", scope: "hod", department: null, unit: null, isForum: false, momTopicId: null, botStatus: "dikeluarkan", installedAt: "2026-11-12T04:00:00Z" },
      ],
    };
  return <AdminShell bare><ConsoleTheme canvas><div style={{ padding: 24, maxWidth: 1100 }}><PraWamTelegram initial={status} crumbs={[{ label: "Admin WAM" }, { label: "Aplikasi" }, { label: "Telegram" }]} /></div></ConsoleTheme></AdminShell>;
}
