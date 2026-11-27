"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Lock, Search } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { FeedbackRecord, PageResult, RsvpRecord } from "@/lib/types";
import styles from "@/components/admin/admin.module.css";
import r from "./responses.module.css";
import { accessText, foodText, partyText } from "@/lib/rsvp-labels";
import { adminApi, adminEventPath } from "@/lib/routes";

function Pagination({ page, total, pageSize, onPage, busy }: { page: number; total: number; pageSize: number; onPage: (page: number) => void; busy: boolean }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav className={styles.pagination} aria-label="Navigasi halaman">
    <Button type="button" variant="secondary" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>Sebelumnya</Button>
    <span role="status">Halaman {page} dari {pages} · {total} entri</span>
    <Button type="button" variant="secondary" disabled={busy || page >= pages} onClick={() => onPage(page + 1)}>Berikutnya</Button>
  </nav>;
}

function timestamp(value: string) { return formatDateTime(value); }

/**
 * RSVP (27 Nov 2026, docs/standar-admin.md): Semua / Hadir / Tidak hadir as chips, search by name or
 * organisation, Unduh CSV on the right, and one row per answer (a table on a wide screen, cards on a phone).
 */
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
    router.push(adminEventPath(eventId, "responses", Object.fromEntries(params)));
    router.refresh();
    setTimeout(() => setBusy(false), 400);
  }
  const chips: { value: string; label: string }[] = [{ value: "", label: "Semua" }, { value: "yes", label: "Hadir" }, { value: "no", label: "Tidak hadir" }];
  return <div className={r.page} aria-busy={busy}>
    <div className={r.head}>
      <div className={r.chips} role="group" aria-label="Kehadiran">{chips.map(chip =>
        <button key={chip.value || "all"} type="button" aria-pressed={attendance === chip.value} disabled={busy} onClick={() => { setAttendance(chip.value); navigate({ page: 1, attendance: chip.value }); }}>{chip.label}</button>)}</div>
      <div className={r.tools}>
        <form className={r.search} role="search" onSubmit={e => { e.preventDefault(); navigate({ page: 1 }); }}>
          <Search size={16} aria-hidden="true" />
          <input type="search" id="q" value={query} maxLength={100} onChange={e => setQuery(e.target.value)} placeholder="Cari nama atau instansi" aria-label="Cari nama atau instansi" />
          <button type="submit" className="sr-only" disabled={busy}>Cari</button>
        </form>
        <a className={r.export} href={adminApi(eventId, "responses/export")}><Download size={16} aria-hidden="true" /> Unduh CSV</a>
      </div>
    </div>
    <p className={r.note}><Lock size={14} aria-hidden="true" /> Berisi data pribadi tamu (kontak, makanan, akses). Pakai hanya untuk koordinasi acara, jangan dibagikan di luar panitia.</p>
    {!initial.items.length ? <div className={r.empty}>{initialFilters.q || initialFilters.attendance ? "Belum ada konfirmasi yang cocok dengan saringan ini." : "Belum ada tamu yang mengonfirmasi."}</div> : <>
      <div className={r.wrap}><table className={r.table}>
        <caption className="sr-only">Konfirmasi kehadiran tamu</caption>
        <thead><tr><th scope="col">Tamu</th><th scope="col">Kehadiran</th><th scope="col">Rombongan</th><th scope="col">Kontak</th><th scope="col">Kebutuhan</th><th scope="col">Waktu</th></tr></thead>
        <tbody>{initial.items.map(row => <tr key={row.id}>
          <td data-label="Tamu"><strong>{row.name}</strong>{row.organization && <small>{row.organization}</small>}<span className={r.kind}>{row.invitation_id ? "Tautan pribadi" : "Tautan umum"}</span></td>
          <td data-label="Kehadiran"><span className={r.pill} data-tone={row.attendance === "yes" ? "ok" : "no"}>{row.attendance === "yes" ? "Hadir" : "Tidak hadir"}</span></td>
          <td data-label="Rombongan">{partyText(row) || <span className={r.muted}>—</span>}</td>
          <td data-label="Kontak">{row.phone || row.email ? <>{row.phone && <span className={r.line}>{row.phone}{row.whatsapp_consent && " · boleh WA"}</span>}{row.email && <span className={r.line}>{row.email}</span>}</> : <span className={r.muted}>Tidak diisi</span>}</td>
          <td data-label="Kebutuhan">{foodText(row) || accessText(row) || row.photo_opt_out ? <>{foodText(row) && <span className={r.line}>{foodText(row)}</span>}{accessText(row) && <span className={r.line}>{accessText(row)}</span>}{row.photo_opt_out && <span className={r.line}>Jangan tampilkan foto</span>}</> : <span className={r.muted}>Tidak ada</span>}</td>
          <td data-label="Waktu" className={r.when}>{timestamp(row.updated_at ?? row.created_at)}</td>
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
    router.push(adminEventPath(eventId, "feedback", page > 1 ? { page: String(page) } : {}));
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
