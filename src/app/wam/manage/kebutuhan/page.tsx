import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { Card, PageHeader, StatCard, StatRow } from "@/components/console";
import { NeedsList } from "@/components/pra-wam/Needs";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { needCount } from "@/components/pra-wam/manage/needs-rows";
import { managesApp, readsNeeds } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { needsOf } from "@/lib/server/pra-wam/needs";
import { currentForm } from "@/lib/server/pra-wam/questionnaire";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import styles from "@/components/pra-wam/panitia.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kebutuhan peserta · WAM", robots: { index: false } };

/**
 * Kelola acara → Kebutuhan peserta (panitia and admin, console "K5"): what the panitia must
 * prepare, from the questionnaire. Names only where the answer was given under a label that says
 * the panitia reads it; health and phone numbers stay with HR.
 */
export default async function NeedsPage() {
  const member = await requireMemberPage(praWamPath.needs);
  if (!readsNeeds(member)) notFound();
  const form = await currentForm().catch(() => null);
  const open = !!form && (form.status !== "draf" || managesApp(member));
  const needs = open ? await needsOf(form) : null;
  return <PraWamShell member={member} current="kebutuhan">
    <PageHeader title="Kebutuhan peserta" subtitle={needs ? `${needs.answered} dari ${needs.active} karyawan aktif sudah mengisi bagian ini. Data pribadi: pakai hanya untuk menyiapkan acara.` : undefined} />
    {!needs
      ? <Card title="Belum ada data" id="belum-ada"><p className={styles.empty}>Kuesioner belum dibuka. Kebutuhan peserta muncul di sini setelah peserta mulai mengisi.</p></Card>
      : <>
        <StatRow label="Ringkasan kebutuhan">
          <StatCard label="Sudah mengisi" value={`${needs.answered} / ${needs.active}`} tone={needs.answered ? "ok" : undefined} note="karyawan aktif" />
          {needs.blocks.slice(0, 3).map(block => <StatCard key={block.key} label={block.title} value={needCount(block)} note={block.purpose} />)}
        </StatRow>
        <NeedsList blocks={needs.blocks} />
      </>}
    <p className={styles.infoNote}><Lock size={18} aria-hidden /><span>Nama hanya tampil bila jawabannya diberi level baca untuk panitia; jawaban berlabel &ldquo;Hanya HR dan manajemen&rdquo; dihitung saja, tanpa nama dan isi. Kondisi kesehatan dan nomor HP hanya dibaca HR. HR menghubungi panitia bila ada yang perlu disiapkan.</span></p>
  </PraWamShell>;
}
