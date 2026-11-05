import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { NeedsList } from "@/components/pra-wam/Needs";
import { PraWamShell, ScreenHead } from "@/components/pra-wam/PraWamShell";
import { managesApp, readsNeeds } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { needsOf } from "@/lib/server/pra-wam/needs";
import { currentForm } from "@/lib/server/pra-wam/questionnaire";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import base from "@/components/pra-wam/pra-wam.module.css";
import styles from "@/components/pra-wam/needs.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kebutuhan peserta · WAM", robots: { index: false } };

/**
 * Kelola acara → Kebutuhan peserta (panitia and admin): what the panitia must prepare, from the
 * questionnaire. Names only where the answer was given under a label that says the panitia reads
 * it; health and phone numbers stay with HR.
 */
export default async function NeedsPage() {
  const member = await requireMemberPage(praWamPath.needs);
  if (!readsNeeds(member)) notFound();
  const form = await currentForm().catch(() => null);
  const open = !!form && (form.status !== "draf" || managesApp(member));
  const needs = open ? await needsOf(form) : null;
  return <PraWamShell member={member} current="kebutuhan">
    <ScreenHead title="Kebutuhan peserta" lead={needs ? `${needs.answered} dari ${needs.active} karyawan aktif sudah mengisi bagian ini. Data pribadi: pakai hanya untuk menyiapkan acara.` : undefined} />
    {!needs
      ? <section className={base.card}><p>Kuesioner belum dibuka. Kebutuhan peserta muncul di sini setelah peserta mulai mengisi.</p></section>
      : <NeedsList blocks={needs.blocks} />}
    <p className={`${base.meta} ${styles.privacy}`}><Lock size={14} aria-hidden /> Kondisi kesehatan dan nomor HP hanya dibaca HR. HR menghubungi panitia bila ada yang perlu disiapkan.</p>
  </PraWamShell>;
}
