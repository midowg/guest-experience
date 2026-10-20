"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink, Field, Notice } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { FeedbackRecord, PageResult, RsvpRecord } from "@/lib/types";
import styles from "./admin.module.css";
import { accessText, foodText, partyText } from "@/lib/rsvp-labels";

function Pagination({ page, total, pageSize, onPage, busy }: { page: number; total: number; pageSize: number; onPage: (page: number) => void; busy: boolean }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav className={styles.pagination} aria-label="Navigasi halaman">
    <Button type="button" variant="secondary" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>Sebelumnya</Button>
    <span role="status">Halaman {page} dari {pages} · {total} entri</span>
    <Button type="button" variant="secondary" disabled={busy || page >= pages} onClick={() => onPage(page + 1)}>Berikutnya</Button>
  </nav>;
}

function timestamp(value: string) { return formatDateTime(value); }

export function ResponsesView({ eventId, initial, initialFilters }: { eventId: string; initial: PageResult<RsvpRecord>; initialFilters: { attendance: string; q: string } }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialFilters.q);
  const [attendance, setAttendance] = useState(initialFilters.attendance);
  const [busy, setBusy] = useState(false);
  function navigate(next: { page?: number; q?: string; attendance?: string }) {
    const params = new URLSearchParams();
    const page = next.page ?? 1;
    const q = next.q ?? query;
    const filter = next.attendance ?? attendance;
    if (page > 1) params.set("page", String(page));
    if (q.trim()) params.set("q", q.trim());
    if (filter) params.set("attendance", filter);
    setBusy(true);
    router.push(`/admin/events/${eventId}/responses${params.size ? `?${params}` : ""}`);
    router.refresh();
    setTimeout(() => setBusy(false), 400);
  }
  return <div className="stack" aria-busy={busy}>
    <form className={styles.filters} onSubmit={e => { e.preventDefault(); navigate({ page: 1 }); }} role="search">
      <Field name="q" label="Cari nama atau instansi"><input className="input" id="q" value={query} maxLength={100} onChange={e => setQuery(e.target.value)} /></Field>
      <Field name="attendance" label="Kehadiran"><select className="select" id="attendance" value={attendance} onChange={e => { setAttendance(e.target.value); navigate({ page: 1, attendance: e.target.value }); }}><option value="">Semua</option><option value="yes">Hadir</option><option value="no">Tidak hadir</option></select></Field>
      <div className={styles.actions}><Button type="submit" disabled={busy}>Terapkan</Button><ButtonLink variant="secondary" href={`/api/admin/events/${eventId}/responses/export`}>Unduh CSV</ButtonLink></div>
    </form>
    <Notice>Daftar ini memuat data pribadi tamu, termasuk kebutuhan makanan dan akses. Gunakan hanya untuk koordinasi acara dan jangan membagikannya di luar panitia.</Notice>
    {!initial.items.length ? <Notice>Belum ada konfirmasi yang sesuai filter ini.</Notice> : <>
      <div className={styles.tableWrap}><table className={styles.table}>
        <caption>Konfirmasi kehadiran tamu</caption>
        <thead><tr><th scope="col">Waktu</th><th scope="col">Nama</th><th scope="col">Jenis</th><th scope="col">Instansi</th><th scope="col">Kehadiran</th><th scope="col">Rombongan</th><th scope="col">Kontak</th><th scope="col">Kebutuhan</th></tr></thead>
        <tbody>{initial.items.map(row => <tr key={row.id}>
          <td>{timestamp(row.updated_at ?? row.created_at)}</td><td>{row.name}</td><td>{row.invitation_id ? "Personal" : "Umum"}</td><td>{row.organization}</td>
          <td>{row.attendance === "yes" ? "Hadir" : "Tidak hadir"}</td>
          <td>{partyText(row) || <span className="muted">—</span>}</td>
          <td>{row.phone || row.email ? <>{row.phone && <p>{row.phone}{row.whatsapp_consent && " · boleh WA"}</p>}{row.email && <p>{row.email}</p>}</> : <span className="muted">Tidak diisi</span>}</td>
          <td>{foodText(row) || accessText(row) || row.photo_opt_out ? <>{foodText(row) && <p>{foodText(row)}</p>}{accessText(row) && <p>{accessText(row)}</p>}{row.photo_opt_out && <p>Jangan tampilkan foto</p>}</> : <span className="muted">Tidak ada</span>}</td>
        </tr>)}</tbody>
      </table></div>
      <Pagination page={initial.page} total={initial.total} pageSize={initial.pageSize} busy={busy} onPage={page => navigate({ page })} />
    </>}
  </div>;
}

export function FeedbackView({ eventId, initial }: { eventId: string; initial: PageResult<FeedbackRecord> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  function go(page: number) {
    setBusy(true);
    router.push(`/admin/events/${eventId}/feedback${page > 1 ? `?page=${page}` : ""}`);
    router.refresh();
    setTimeout(() => setBusy(false), 400);
  }
  return <div className="stack" aria-busy={busy}>
    <Notice>Jawaban survei bersifat anonim dan tidak dikaitkan dengan RSVP. Jumlah di sini adalah jumlah pengiriman, bukan jumlah tamu yang hadir.</Notice>
    {!initial.items.length ? <Notice>Belum ada masukan yang masuk.</Notice> : <>
      <ul className={styles.eventList}>{initial.items.map(submission => <li key={submission.id} className={styles.eventCard}>
        <p className="muted">{timestamp(submission.created_at)}</p>
        <dl className={styles.answers}>{submission.answers.map(answer => <div key={answer.question_id}><dt>{answer.label}</dt><dd>{answer.value || "—"}</dd></div>)}</dl>
      </li>)}</ul>
      <Pagination page={initial.page} total={initial.total} pageSize={initial.pageSize} busy={busy} onPage={go} />
    </>}
  </div>;
}
