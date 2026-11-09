import { notFound } from "next/navigation";
import { PraWamTheme } from "@/components/admin/wam/PraWamTheme";
import { ConsoleTheme } from "@/components/console";
import { parseWamLook } from "@/lib/pra-wam/theme";

export const dynamic = "force-dynamic";

/** Layout check for Admin WAM → Tema aplikasi without signing in: ?pakai=werkudara for that theme in use; ?migrasi=belum before the migration. */
export default async function DevThemePage({ searchParams }: { searchParams: Promise<{ pakai?: string; migrasi?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { pakai, migrasi } = await searchParams;
  return <ConsoleTheme canvas><div style={{ maxWidth: 1080, margin: "0 auto", padding: 24 }}>
    <PraWamTheme initial={{ look: parseWamLook(pakai), migrated: migrasi !== "belum", updatedAt: null }} migration="202611090001_pra_wam_app_theme.sql" crumbs={[{ label: "Admin WAM", href: "#" }, { label: "Aplikasi" }, { label: "Tema aplikasi" }]} />
  </div></ConsoleTheme>;
}
