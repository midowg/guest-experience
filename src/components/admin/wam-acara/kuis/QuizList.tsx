"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Card, ConsoleButton, Pill } from "@/components/console";
import { Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { KUIS_MIGRATION } from "@/lib/main-wam/kuis/admin";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { mainWamAdminApi, mainWamAdminPath } from "@/lib/routes";
import type { AdminQuizSummary } from "@/lib/server/main-wam/kuis/admin";
import css from "./kuis-admin.module.css";

const phaseWords: Record<string, string> = { siap: "Siap, belum dibuka", lobi: "Lobi terbuka", skor: "Papan skor", podium: "Podium", selesai: "Selesai" };

/**
 * Admin WAM 2026 → Kuis live: the quizzes, and a new one. Each quiz has its questions, pengendali,
 * big-screen link, games and results on its own page.
 */
export function QuizList({ initial, migrated, moduleOn }: { initial: AdminQuizSummary[]; migrated: boolean; moduleOn: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function create() {
    setBusy(true); setMessage(null);
    try {
      const { data } = await adminRequest<{ id: string }>(mainWamAdminApi.quizzes, { method: "POST", body: JSON.stringify({ title }) });
      router.push(mainWamAdminPath.quiz(data!.id));
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); setBusy(false); }
  }

  return <div className={css.stack}>
    {!moduleOn && <Notice tone="warning"><strong>Modul mati.</strong> Kuis live tidak tampil di aplikasi (kartu Beranda, permainan, layar besar) sampai modul Kuis live dinyalakan di Pengaturan. Soal dan pengendali tetap bisa disiapkan.</Notice>}
    {!migrated && <Notice tone="warning">Kuis live menunggu migrasi <code>{KUIS_MIGRATION}</code>. Jalankan di Supabase SQL Editor, lalu muat ulang halaman ini.</Notice>}
    <div aria-live="polite">{message && <Notice tone={message.tone}>{message.text}</Notice>}</div>
    <Card title="Cara memakai" id="kuis-cara">
      <ol className={css.steps}>
        <li>Buat kuis, tulis soalnya (4 pilihan, satu benar, level Mudah sampai Sangat sulit; urutannya otomatis dari mudah ke sangat sulit).</li>
        <li>Pilih pengendali (MC). Pemegang akses {WAM_EVENT_ADMIN_LABEL} selalu bisa mengendalikan; Panitia WAM saja tidak cukup.</li>
        <li>Buat tautan layar besar dan buka di laptop proyektor (sekali klik di layar untuk menyalakan suara).</li>
        <li>Mulai permainan. Pengendali membuka Kendalikan kuis di Beranda aplikasi, lalu menekan Lanjut: Buka lobi. Peserta mendapat notifikasi Kuis dimulai.</li>
        <li>Setelah selesai, lihat hasil dengan nama untuk hadiah (bisa diunduh).</li>
      </ol>
    </Card>
    <Card title="Kuis baru" id="kuis-baru">
      <form className={css.inline} onSubmit={event => { event.preventDefault(); void create(); }}>
        <div className="field"><label htmlFor="kuis-judul">Judul</label>
          <input id="kuis-judul" className="input" required minLength={2} maxLength={80} value={title} onChange={event => setTitle(event.target.value)} placeholder="Kuis WAM 2026" /></div>
        <ConsoleButton type="submit" variant="primary" icon={<Plus size={16} aria-hidden />} disabled={busy || !migrated || title.trim().length < 2}>{busy ? "Membuat…" : "Buat kuis"}</ConsoleButton>
      </form>
    </Card>
    {initial.map(quiz => <Card key={quiz.id} title={quiz.title} id={`kuis-${quiz.id}`} action={{ label: "Buka", href: mainWamAdminPath.quiz(quiz.id) }}>
      <div className={css.badges}>
        {quiz.live ? <Pill tone={quiz.live.phase === "siap" ? "brass" : "ok"}>Permainan {quiz.live.number} · {phaseWords[quiz.live.phase] ?? "Berjalan"}</Pill> : <Pill>Belum ada permainan berjalan</Pill>}
        {quiz.screenHint ? <Pill tone="blue">Layar besar ••••{quiz.screenHint}</Pill> : <Pill tone="warn">Belum ada tautan layar besar</Pill>}
      </div>
      <p className={css.meta}><span>{quiz.questions} soal</span><span>{quiz.hosts} pengendali</span><span>{quiz.games} permainan</span></p>
    </Card>)}
    {migrated && !initial.length && <p className={css.note}>Belum ada kuis.</p>}
  </div>;
}
