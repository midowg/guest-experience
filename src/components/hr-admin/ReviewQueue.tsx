"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, PartyPopper } from "lucide-react";
import { Notice } from "@/components/ui";
import { Card, ConsoleButton, FilterChips, PageHeader, Pill } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { flagLabels, kindLabels, type DailyFlag, type DailyRecord, type WaitingRecord } from "@/lib/hr/attendance";
import { hrAdminApi } from "@/lib/routes";
import { RecordReview } from "./RecordReview";
import css from "./hr-admin.module.css";

type Message = { tone: "success" | "error"; text: string } | null;
type Filter = "semua" | "di_luar" | "wajah" | "lain";

const time = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const day = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const outside: DailyFlag[] = ["di_luar_area", "gps_tidak_akurat", "tanpa_titik_kantor", "lokasi_melompat"];
const faceFlags: DailyFlag[] = ["skor_rendah", "wajah_belum_disetujui"];
const kindOf = (record: WaitingRecord): Exclude<Filter, "semua"> =>
  record.flags.some(flag => faceFlags.includes(flag)) ? "wajah" : record.flags.some(flag => outside.includes(flag)) ? "di_luar" : "lain";

/**
 * Admin HR → Perlu dicek (20 Nov 2026): every clock-in that waits, newest first, each with its
 * selfie beside the reference photo and why it waits. Decide one by one, or tick several (an event
 * day, everyone at the venue) and approve them at once. A decided one leaves the list.
 */
export function ReviewQueue({ initial }: { initial: WaitingRecord[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<Filter>("semua");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const counts = useMemo(() => ({
    semua: items.length,
    di_luar: items.filter(item => kindOf(item) === "di_luar").length,
    wajah: items.filter(item => kindOf(item) === "wajah").length,
    lain: items.filter(item => kindOf(item) === "lain").length,
  }), [items]);
  const shown = items.filter(item => filter === "semua" || kindOf(item) === filter);

  const decided = (record: DailyRecord) => {
    if (record.status === "perlu_cek") return;
    setItems(list => list.filter(item => item.id !== record.id));
    setPicked(set => { const next = new Set(set); next.delete(record.id); return next; });
    router.refresh();
  };
  const gone = (record: DailyRecord) => {
    setItems(list => list.filter(item => item.id !== record.id));
    setPicked(set => { const next = new Set(set); next.delete(record.id); return next; });
    router.refresh();
  };
  const toggle = (id: string) => setPicked(set => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allShown = shown.length > 0 && shown.every(item => picked.has(item.id));

  async function approvePicked() {
    const ids = shown.filter(item => picked.has(item.id)).map(item => item.id);
    if (!ids.length || !window.confirm(`Setujui ${ids.length} absen yang dipilih?`)) return;
    setBusy(true); setMessage(null);
    let done = 0;
    try {
      for (const id of ids) {
        await adminRequest(hrAdminApi.record(id), { method: "PATCH", body: JSON.stringify({ status: "sah", note: "" }) });
        done += 1;
        setItems(list => list.filter(item => item.id !== id));
      }
      setMessage({ tone: "success", text: `${done} absen disetujui.` });
    } catch (error) {
      setMessage({ tone: "error", text: `${done} disetujui, lalu berhenti: ${errorMessage(error)}` });
    } finally {
      setPicked(new Set()); setBusy(false); router.refresh();
    }
  }

  return <>
    <PageHeader title="Perlu dicek" subtitle="Absen yang menunggu keputusanmu. Lihat selfie dan foto acuannya, lalu setujui atau tolak." />
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {items.length === 0
      ? <Card title="Semua sudah dicek"><div className={css.empty}><PartyPopper size={32} aria-hidden /><p>Tidak ada absen yang menunggu. Absen baru yang perlu dicek akan muncul di sini.</p></div></Card>
      : <Card title={`${shown.length} absen menunggu`}>
        <div className={css.toolbar}>
          <FilterChips label="Saring" value={filter} onChange={value => { setFilter(value); setPicked(new Set()); }} chips={[
            { value: "semua", label: "Semua", count: counts.semua },
            { value: "di_luar", label: "Di luar kantor", count: counts.di_luar },
            { value: "wajah", label: "Soal wajah", count: counts.wajah },
            { value: "lain", label: "Lainnya", count: counts.lain },
          ]} />
        </div>
        <div className={css.queueHead}>
          <label className={css.select}><input type="checkbox" checked={allShown} onChange={() => setPicked(allShown ? new Set() : new Set(shown.map(item => item.id)))} /> Pilih semua yang tampil</label>
          <ConsoleButton variant="primary" icon={<CheckCheck size={16} aria-hidden />} disabled={busy || picked.size === 0} onClick={() => void approvePicked()}>Setujui yang dipilih{picked.size ? ` (${picked.size})` : ""}</ConsoleButton>
        </div>
        <ul className={css.rows} style={{ marginTop: 12 }}>
          {shown.map(item => <li key={item.id} className={css.row}>
            <div className={css.rowHead}>
              <label className={css.select}>
                <input type="checkbox" checked={picked.has(item.id)} onChange={() => toggle(item.id)} aria-label={`Pilih absen ${item.name}`} />
                <span className={css.who}><strong>{item.name}</strong><span className={css.muted}>{item.department || "Tanpa departemen"}</span></span>
              </label>
              <span className={css.muted}>{day(item.workDate)} · {kindLabels[item.kind]} {time(item.at)}</span>
            </div>
            <div className={css.pills}>{item.flags.map(flag => <Pill key={flag} tone={faceFlags.includes(flag) ? "bad" : "warn"}>{flagLabels[flag]}</Pill>)}</div>
            <RecordReview record={item} employeeId={item.employeeId} name={item.name} hasFace={!!item.face} onChanged={decided} onDeleted={gone} onMessage={setMessage} />
          </li>)}
        </ul>
      </Card>}
  </>;
}
