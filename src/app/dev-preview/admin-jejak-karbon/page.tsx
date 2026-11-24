import { notFound } from "next/navigation";
import { ConsoleShell } from "@/components/console";
import { CarbonPlayground } from "@/components/admin/wam/karbon/CarbonPlayground";
import { PraWamCarbon } from "@/components/admin/wam/karbon/PraWamCarbon";
import { SAMPLE_CARBON_PEOPLE, SAMPLE_CARBON_SETUP } from "@/lib/pra-wam/carbon-sample";
import { EMPTY_CARBON_SETUP } from "@/lib/pra-wam/carbon";
import admin from "@/components/admin/admin.module.css";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";

/*
 * Layout check for Admin Pra WAM → Jejak karbon with made-up people, without signing in. Default:
 * the real page's component in the console (?kosong=1 before anything is saved); ?sisi=peserta or
 * ?sisi=prototipe for the prototype story. Simpan calls the real API, which refuses without a session.
 */
export default async function DevCarbonAdminPage({ searchParams }: { searchParams: Promise<{ sisi?: string; kosong?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { sisi, kosong } = await searchParams;
  if (sisi === "peserta" || sisi === "prototipe") return <div className={styles.app} style={{ minHeight: "100vh", background: "var(--pw-page)" }}>
    <CarbonPlayground setup={SAMPLE_CARBON_SETUP} people={SAMPLE_CARBON_PEOPLE} side={sisi === "peserta" ? "peserta" : "panitia"} />
  </div>;
  const initial = kosong
    ? { setup: EMPTY_CARBON_SETUP, people: SAMPLE_CARBON_PEOPLE.map(person => ({ ...person, travel: null })), saved: false, migrated: true, updatedAt: null }
    : { setup: SAMPLE_CARBON_SETUP, people: SAMPLE_CARBON_PEOPLE, saved: true, migrated: true, updatedAt: "2026-11-24T02:00:00Z" };
  return <ConsoleShell theme="admin" area="Admin Pra WAM" storageKey="dev-karbon" className={admin.shell} person={{ name: "Panitia Contoh", sub: "Werkudara" }}
    groups={[{ label: "Untuk peserta", items: [{ key: "karbon", label: "Jejak karbon", href: "/dev-preview/admin-jejak-karbon" }] }]} current="karbon" pageTitle="Jejak karbon">
    <PraWamCarbon initial={initial} crumbs={[{ label: "Admin Pra WAM" }, { label: "Untuk peserta" }]} title="Jejak karbon" />
  </ConsoleShell>;
}
