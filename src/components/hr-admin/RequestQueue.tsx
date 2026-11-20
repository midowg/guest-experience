"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, PartyPopper, X } from "lucide-react";
import { Notice } from "@/components/ui";
import { Card, ConsoleButton, PageHeader, Pill, type ConsoleTone } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { kindLabels, reasonLabels, requestStatusLabels, requestSummary, requestTypeLabels, type AdminRequest, type RequestStatus } from "@/lib/hr/attendance";
import { hrAdminApi } from "@/lib/routes";
import css from "./hr-admin.module.css";

type Message = { tone: "success" | "error"; text: string } | null;
const day = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const time = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const tone: Record<RequestStatus, ConsoleTone> = { menunggu: "warn", disetujui: "ok", ditolak: "bad", dibatalkan: "neutral" };

/**
 * Admin HR → Revisi (21 Nov 2026): what employees ask to fix, oldest waiting first. Each shows the
 * absen as it is now beside what is asked and why. Setujui applies it at once (a forgotten one is
 * recorded, a time or reason is changed, a cancelled one is deleted); Tolak needs a reason.
 */
export function RequestQueue({ initial }: { initial: AdminRequest[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [refusing, setRefusing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const waiting = items.filter(item => item.status === "menunggu");
  const decided = items.filter(item => item.status !== "menunggu").slice(0, 20);

  async function decide(item: AdminRequest, approve: boolean) {
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<AdminRequest>(hrAdminApi.request(item.id), { method: "POST", body: JSON.stringify({ approve, note: approve ? "" : note }) });
      setItems(list => list.map(entry => entry.id === item.id ? { ...entry, status: approve ? "disetujui" : "ditolak", decisionNote: approve ? null : note } : entry));
      setMessage({ tone: "success", text: `${result.message} (${item.name})` });
      setRefusing(null); setNote(""); router.refresh();
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(false); }
  }

  const now = (item: AdminRequest) => item.record
    ? `${kindLabels[item.kind]} ${time(item.record.at)}${item.record.reasonKind ? ` · ${reasonLabels[item.record.reasonKind]}` : item.record.officeName ? ` · ${item.record.officeName}` : ""}`
    : item.type === "tambah" ? `Belum ada absen ${kindLabels[item.kind].toLowerCase()}` : "Absennya sudah tidak ada";

  return <>
    <PageHeader title="Revisi" subtitle="Perbaikan absen yang diajukan karyawan. Setujui langsung diterapkan ke absensi; tolak dengan alasan." />
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {waiting.length === 0
      ? <Card title="Tidak ada revisi menunggu"><div className={css.empty}><PartyPopper size={32} aria-hidden /><p>Revisi baru dari karyawan akan muncul di sini.</p></div></Card>
      : <Card title={`${waiting.length} revisi menunggu`}>
        <ul className={css.rows}>{waiting.map(item => <li key={item.id} className={css.row}>
          <div className={css.rowHead}>
            <span className={css.who}><strong>{item.name}</strong><span className={css.muted}>{item.department || "Tanpa departemen"}</span></span>
            <Pill tone="warn">{requestTypeLabels[item.type]}</Pill>
          </div>
          <dl className={css.facts}>
            <dt>Tanggal</dt><dd>{day(item.workDate)}</dd>
            <dt>Sekarang</dt><dd>{now(item)}</dd>
            <dt>Diminta</dt><dd><strong>{requestSummary(item)}</strong>{item.proposedTime ? ` (${item.zone})` : ""}</dd>
            <dt>Alasan</dt><dd>{item.note}</dd>
          </dl>
          {refusing === item.id
            ? <div className={css.actions}>
              <label className={`${css.field} ${css.grow}`}>Alasan ditolak<input type="text" maxLength={300} value={note} autoFocus onChange={event => setNote(event.target.value)} placeholder="Mis. tidak ada di jadwal" /></label>
              <ConsoleButton variant="primary" icon={<X size={16} aria-hidden />} disabled={busy || note.trim().length < 3} onClick={() => void decide(item, false)}>Tolak revisi</ConsoleButton>
              <ConsoleButton disabled={busy} onClick={() => { setRefusing(null); setNote(""); }}>Batal</ConsoleButton>
            </div>
            : <div className={css.actions}>
              <ConsoleButton variant="primary" icon={<Check size={16} aria-hidden />} disabled={busy} onClick={() => void decide(item, true)}>Setujui dan terapkan</ConsoleButton>
              <ConsoleButton icon={<X size={16} aria-hidden />} disabled={busy} onClick={() => setRefusing(item.id)}>Tolak</ConsoleButton>
            </div>}
        </li>)}</ul>
      </Card>}
    {decided.length > 0 && <Card title="Baru diputuskan">
      <ul className={css.rows}>{decided.map(item => <li key={item.id} className={css.row}>
        <div className={css.rowHead}>
          <span className={css.who}><strong>{item.name}</strong><span className={css.muted}>{day(item.workDate)} · {requestSummary(item)}</span></span>
          <Pill tone={tone[item.status]}>{requestStatusLabels[item.status]}</Pill>
        </div>
        {(item.decisionNote || item.decidedLabel) && <p className={css.muted}>{item.decidedLabel ? `Oleh ${item.decidedLabel}` : ""}{item.decisionNote ? ` · ${item.decisionNote}` : ""}</p>}
      </li>)}</ul>
    </Card>}
  </>;
}
