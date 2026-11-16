"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Undo2 } from "lucide-react";
import { Avatar, ConsoleButton, Pill } from "@/components/console";
import { errorMessage } from "@/components/admin/shared/api";
import { Panel, SkeletonRows } from "@/components/app-shell/Panel";
import { revalidate, useResource } from "@/components/app-shell/resource";
import { useToast } from "@/components/app-shell/Toast";
import { wellbeingAdminApi } from "@/lib/routes";
import { DIMENSIONS, dimensionLabels, wibToday, type DimensionId } from "@/lib/wellbeing/rules";
import type { WbBatchResult } from "@/lib/wellbeing/types";
import { dayLabel, points, send, signed, wb } from "./api";
import { DimensionBar, DimensionPill, Empty, LoadError, WaitingMigration } from "./parts";
import css from "./wellbeing-admin.module.css";

const norm = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const reasonIdeas = ["Kehadiran internal activities", "Kehadiran olahraga di kantor", "Juara lomba", "Penyetaraan poin", "Double input dengan Strava"];

/**
 * Tambah poin (16 Nov 2026): the same points to everyone picked, e.g. who came to an office event,
 * or points taken back. It saves at once as one batch with Urungkan; taking points from several
 * people asks once more first. Each opening (`round`) starts with a clean form.
 */
export function PointsPanel({ open, round, initialIds, onClose }: { open: boolean; round: number; initialIds: string[]; onClose: () => void }) {
  const people = useResource(open ? wb.people("all").key : null, wb.people("all").fetch);
  const toast = useToast();
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set(initialIds));
  const [search, setSearch] = useState("");
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [dimension, setDimension] = useState<DimensionId | "">("");
  const [date, setDate] = useState(wibToday());
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState("");
  // Each opening starts clean, with the people picked before it opened.
  const [round_, setRound] = useState(round);
  if (round !== round_) {
    setRound(round); setIds(new Set(initialIds)); setSearch(""); setSign(1); setAmount(""); setReason(""); setDimension(""); setDate(wibToday()); setProblem(""); setConfirming(false);
  }

  const everyone = useMemo(() => (people.data?.rows ?? []).filter(row => row.active).sort((a, b) => (a.nickname || a.name).localeCompare(b.nickname || b.name, "id")), [people.data]);
  const shown = useMemo(() => { const term = norm(search.trim()); return term ? everyone.filter(row => norm(`${row.name} ${row.nickname} ${row.department}`).includes(term)) : everyone; }, [everyone, search]);
  const chosen = everyone.filter(row => ids.has(row.id));
  const value = Number(amount) * sign;

  function toggle(id: string) { setIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); setConfirming(false); }
  async function save() {
    setProblem("");
    if (!ids.size) return setProblem("Pilih minimal satu orang.");
    if (!Number.isInteger(value) || value === 0) return setProblem("Isi jumlah poin.");
    if (reason.trim().length < 2) return setProblem("Tulis alasannya, mis. nama acara.");
    if (value < 0 && ids.size > 1 && !confirming) { setConfirming(true); return; }
    setBusy(true);
    try {
      const { data, message } = await send<WbBatchResult>(wellbeingAdminApi.points, "POST", { employeeIds: [...ids], points: value, reason: reason.trim(), dimension: dimension || null, date });
      revalidate("wb:");
      onClose();
      toast({ message, tone: "ok", action: { label: "Urungkan", run: () => void undo(data.batchId) } });
    } catch (error) { setProblem(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function undo(batchId: string) {
    try { const { message } = await send<{ count: number }>(wellbeingAdminApi.pointBatch(batchId), "DELETE"); revalidate("wb:"); toast({ message, tone: "info" }); }
    catch (error) { toast({ message: errorMessage(error), tone: "bad" }); }
  }

  const label = !ids.size ? "Simpan" : confirming ? `Ya, kurangi ${points(Math.abs(value))} poin dari ${ids.size} orang` : `${value < 0 ? "Kurangi" : "Tambah"} ${amount ? points(Math.abs(value)) : ""} poin · ${ids.size} orang`;
  return <Panel open={open} onClose={onClose} title={sign < 0 ? "Kurangi poin" : "Tambah poin"} subtitle="Untuk satu orang atau banyak sekaligus, mis. peserta acara kantor."
    footer={<>
      <ConsoleButton onClick={onClose} disabled={busy}>Batal</ConsoleButton>
      <ConsoleButton variant="primary" onClick={() => void save()} disabled={busy}>{busy ? "Menyimpan…" : label}</ConsoleButton>
    </>}>
    {people.data && !people.data.migrated && <WaitingMigration />}
    <div className={css.form}>
      <div className={css.field}>
        <span>Poin</span>
        <div className={css.amount}>
          <div className={css.signs} role="group" aria-label="Tambah atau kurangi">
            <button type="button" aria-pressed={sign === 1} onClick={() => { setSign(1); setConfirming(false); }}><Plus size={18} aria-hidden="true" />Tambah</button>
            <button type="button" aria-pressed={sign === -1} onClick={() => { setSign(-1); setConfirming(false); }}><Minus size={18} aria-hidden="true" />Kurangi</button>
          </div>
          <input className={css.input} inputMode="numeric" placeholder="mis. 100" value={amount} aria-label="Jumlah poin"
            onChange={event => { setAmount(event.target.value.replace(/\D/g, "").slice(0, 6)); setConfirming(false); }} />
        </div>
      </div>
      <label className={css.field}><span>Alasan (dibaca karyawan)</span>
        <input className={css.input} value={reason} maxLength={200} onChange={event => setReason(event.target.value)} placeholder="mis. Kehadiran internal activities 15 Nov" list="wb-reason-ideas" />
        <datalist id="wb-reason-ideas">{reasonIdeas.map(text => <option key={text} value={text} />)}</datalist>
      </label>
      <div className={css.fieldRow}>
        <label className={css.field}><span>Dimensi (opsional)</span>
          <select className={css.select} value={dimension} onChange={event => setDimension(event.target.value as DimensionId | "")}>
            <option value="">Tanpa dimensi</option>
            {DIMENSIONS.map(id => <option key={id} value={id}>{dimensionLabels[id]}</option>)}
          </select>
        </label>
        <label className={css.field}><span>Tanggal</span>
          <input className={css.input} type="date" value={date} max={wibToday()} onChange={event => setDate(event.target.value)} /></label>
      </div>
      <div className={css.field}>
        <span>Orang ({ids.size} dipilih)</span>
        {chosen.length > 0 && <div className={css.chosen}>{chosen.map(row => <button key={row.id} type="button" className={css.chosenChip} onClick={() => toggle(row.id)} aria-label={`Lepas ${row.name}`}>{row.nickname || row.name} ×</button>)}</div>}
        <input className={css.input} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari nama atau divisi" aria-label="Cari orang" />
        <div className={css.pickHead}>
          <button type="button" className={css.linkButton} onClick={() => setIds(current => new Set([...current, ...shown.map(row => row.id)]))}>Pilih semua yang tampil ({shown.length})</button>
          {ids.size > 0 && <button type="button" className={css.linkButton} onClick={() => setIds(new Set())}>Kosongkan</button>}
        </div>
        {people.error && !people.data ? <LoadError message={people.error} onRetry={() => void people.reload()} />
          : !people.data ? <SkeletonRows rows={4} />
          : <ul className={css.pickList}>
            {shown.map(row => <li key={row.id}><label className={css.pickRow}>
              <input type="checkbox" checked={ids.has(row.id)} onChange={() => toggle(row.id)} />
              <Avatar name={row.name} size={32} />
              <span><strong>{row.nickname || row.name}</strong><small>{row.department || "-"}</small></span>
            </label></li>)}
          </ul>}
      </div>
      {confirming && <p className={css.problem} role="alert">Poin {ids.size} orang akan berkurang {points(Math.abs(value))}. Tekan sekali lagi untuk melanjutkan.</p>}
      {problem && <p className={css.problem} role="alert">{problem}</p>}
    </div>
  </Panel>;
}

/** One person: points (this month and all time) per dimension, latest activities, and admin points with Urungkan. */
export function PersonPanel({ id, onClose }: { id: string | null; onClose: () => void }) {
  const source = id ? wb.person(id) : null;
  const detail = useResource(source?.key ?? null, source?.fetch ?? (() => Promise.reject(new Error("—"))));
  const toast = useToast();
  const today = wibToday();
  const data = detail.data && detail.data.person.id === id ? detail.data : undefined;

  async function cancel(batchId: string) {
    try { const { message } = await send<{ count: number }>(wellbeingAdminApi.pointBatch(batchId, id ?? undefined), "DELETE"); revalidate("wb:"); toast({ message, tone: "info" }); }
    catch (error) { toast({ message: errorMessage(error), tone: "bad" }); }
  }
  return <Panel open={!!id} onClose={onClose} label="Detail karyawan"
    title={data ? data.person.nickname || data.person.name : "Memuat…"}
    subtitle={data ? [data.person.name !== data.person.nickname ? data.person.name : "", data.person.department, data.person.position].filter(Boolean).join(" · ") : undefined}>
    {detail.error && !data ? <LoadError message={detail.error} onRetry={() => void detail.reload()} />
      : !data ? <SkeletonRows rows={6} />
      : <div className={css.stack}>
        {!data.migrated && <WaitingMigration />}
        <div className={css.personTotals}>
          <div><small>Bulan ini</small><strong>{points(data.month)}</strong></div>
          <div><small>Sepanjang waktu</small><strong>{points(data.total)}</strong></div>
        </div>
        <ul className={css.dimList} aria-label="Poin per dimensi, sepanjang waktu">
          {DIMENSIONS.map(dimension => <li key={dimension}><DimensionPill dimension={dimension} /><span className={css.dimValue}>{points(data.dims[dimension])}</span><small>{points(data.monthDims[dimension])} bulan ini</small></li>)}
        </ul>
        <DimensionBar dims={data.dims} />
        <h3 className={css.subhead}>Aktivitas terakhir</h3>
        {data.activities.length ? <ul className={css.miniList}>
          {data.activities.map(item => <li key={item.id}>
            <span><strong>{item.title || item.typeName}</strong><small>{dimensionLabels[item.dimension]} · {dayLabel(item.date, today)}{item.reason ? ` · ${item.reason}` : ""}</small></span>
            {item.status === "rejected" ? <Pill tone="bad">Ditolak</Pill> : <strong className={css.pts}>+{points(item.points)}</strong>}
          </li>)}
        </ul> : <Empty title="Belum ada aktivitas" />}
        <h3 className={css.subhead}>Poin dari admin</h3>
        {data.entries.length ? <ul className={css.miniList}>
          {data.entries.map(entry => <li key={entry.id} data-voided={entry.voided}>
            <span><strong>{entry.reason}</strong><small>{dayLabel(entry.date, today)} · oleh {entry.by}{entry.voided ? " · dibatalkan" : ""}</small></span>
            <span className={css.entryEnd}>
              <strong className={entry.points < 0 ? css.ptsNeg : css.pts}>{signed(entry.points)}</strong>
              {!entry.voided && <button type="button" className={css.linkButton} onClick={() => void cancel(entry.batchId)} title="Hanya untuk orang ini"><Undo2 size={14} aria-hidden="true" />Batalkan</button>}
            </span>
          </li>)}
        </ul> : <Empty title="Belum ada poin dari admin" />}
      </div>}
  </Panel>;
}
