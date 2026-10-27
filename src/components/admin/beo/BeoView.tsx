"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, Printer, Save } from "lucide-react";
import { Button, ButtonLink, Field, Notice } from "@/components/ui";
import { beoActions, beoStatuses, beoStatusLabels, type BeoAction, type BeoRevision, type BeoState, type BeoSummary } from "@/lib/beo";
import { beoDocument, beoVersionInfo, beoVersionParam } from "@/lib/beo-document";
import { briefMealLabels, briefMeals, briefRelationLabels, briefRelations, emptyBrief, type BriefState, type HostingBrief } from "@/lib/hosting-brief";
import { formatDateTime, formatTime } from "@/lib/format";
import { tzLabel } from "@/lib/timezones";
import type { EventRecord } from "@/lib/types";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { BeoSheets } from "@/components/admin/beo/BeoSheet";
import styles from "@/components/admin/admin.module.css";
import { adminApi, adminEventPath } from "@/lib/routes";

const actionLabels: Record<BeoAction, string> = {
  save: "Simpan draf", set: "Tetapkan angka", revise: "Simpan revisi", final: "Tandai final", done: "Tandai selesai", reopen: "Buka lagi untuk revisi",
};
const actionHints: Partial<Record<BeoAction, string>> = {
  set: "Biasanya H-3. Setelah ditetapkan, angka hanya berubah lewat revisi beralasan.",
  final: "Biasanya H-1, angka terakhir untuk penyedia.",
};

type Props = { event: EventRecord; summary: BeoSummary; initial: BeoState; revisions: BeoRevision[]; migrated: boolean; brief?: BriefState };

/**
 * The BEO for hospitality, in two tabs: the preparation sheet (numbers, food and allergies, access
 * needs, the service schedule, and the Draf → Ditetapkan → Revisi → Final → Selesai flow) and the
 * hosting brief from whoever invited the guest. Beside them, the printed pages as they will come
 * out, following every keystroke; printing and PDF take both pages at once.
 */
export function BeoView({ event, summary, initial, revisions, migrated, brief: initialBrief = { brief: emptyBrief(), version: 0, migrated: false } }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"sheet" | "brief">("sheet");
  const [state, setState] = useState(initial);
  const [prepared, setPrepared] = useState(initial.prepared_count === null ? "" : String(initial.prepared_count));
  const [notes, setNotes] = useState(initial.notes);
  const [reason, setReason] = useState("");
  const [revising, setRevising] = useState(false);
  const [brief, setBrief] = useState(initialBrief.brief);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const editable = state.status === "draft" || revising;
  const actions = beoActions(state.status);
  const count = prepared.trim() === "" ? null : Number(prepared);
  const stale = state.locked_at ? summary.changedSinceLock : 0;
  const preview = useMemo(() => beoDocument(event, summary, { ...state, prepared_count: count, notes }, revisions, "internal", brief), [event, summary, state, count, notes, revisions, brief]);

  async function run(action: BeoAction) {
    if (action === "revise" && !revising) { setRevising(true); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await adminRequest<BeoState>(adminApi(event.id, "beo"), {
        method: "PUT",
        body: JSON.stringify({ action, version: state.version, prepared_count: count, notes, ...(action === "revise" ? { reason } : {}) }),
      });
      if (result.data) setState(result.data);
      setRevising(false); setReason("");
      setMessage(result.message);
      // Revisions and the "needs review" count come from the server.
      if (action !== "save") router.refresh();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  const time = (value: string) => formatTime(value, event.timezone);
  return <div className={styles.beoLayout}>
    <div className={styles.beo}>
      <div className={styles.filterChips} role="group" aria-label="Bagian BEO">
        <button type="button" aria-pressed={tab === "sheet"} onClick={() => setTab("sheet")}>Lembar persiapan</button>
        <button type="button" aria-pressed={tab === "brief"} onClick={() => setTab("brief")}>Brief tamu</button>
      </div>

      {/* Both stay mounted, so switching never loses what was typed or the brief's saved version. */}
      <div hidden={tab !== "brief"}><BriefForm eventId={event.id} initial={initialBrief} brief={brief} onChange={setBrief} /></div>
      <div hidden={tab !== "sheet"} className={styles.beo}>
        {!migrated && <Notice tone="warning">Angka persiapan dan status BEO menunggu migrasi <code>202610210001_event_beo.sql</code>. Rekap di bawah sudah bisa dibaca dan dicetak.</Notice>}

        <ol className={styles.beoSteps} aria-label="Status BEO">
          {beoStatuses.map(status => <li key={status} aria-current={state.status === status ? "step" : undefined}>{beoStatusLabels[status]}</li>)}
        </ol>
        {stale > 0 && <Notice tone="warning" role="status"><AlertTriangle size={16} aria-hidden="true" /> Perlu ditinjau: {stale} jawaban RSVP masuk atau berubah setelah angka ditetapkan.</Notice>}

        <div className={styles.beoNumbers}>
          <div><span>Perkiraan dari survei</span><strong>{summary.estimate ?? "—"}</strong></div>
          <div><span>RSVP hadir</span><strong>{summary.attending}</strong><small>{summary.answeredYes} jawaban, termasuk pendamping</small></div>
          <div className={styles.beoPrepared}><span>Jumlah disiapkan</span><strong>{state.prepared_count ?? "—"}</strong></div>
        </div>

        {migrated && <section className={styles.guestCard} aria-labelledby="beo-form-title">
          <h2 id="beo-form-title" className={styles.guestCardTitle}>Angka untuk penyedia</h2>
          <Field label="Jumlah porsi/pax disiapkan" name="beo-prepared" hint={`RSVP hadir saat ini ${summary.attending}. Tambahkan cadangan bila perlu.`}>
            <input id="beo-prepared" inputMode="numeric" value={prepared} disabled={!editable || busy} onChange={e => setPrepared(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </Field>
          <Field label="Catatan untuk tim dan penyedia (opsional)" name="beo-notes" hint="Misalnya ruang, parkir, jam snack. Ikut tercetak di versi penyedia; jangan tulis nomor telepon tamu.">
            <textarea id="beo-notes" rows={3} maxLength={4000} value={notes} disabled={!editable || busy} onChange={e => setNotes(e.target.value)} />
          </Field>
          {revising && <Field label="Alasan revisi" name="beo-reason" hint="Contoh: klien menambah 5 tamu. Tercatat di riwayat.">
            <input id="beo-reason" maxLength={500} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} />
          </Field>}
          {error && <Notice tone="error" role="alert">{error}</Notice>}
          {message && <p role="status" className={styles.guestMessage}>{message}</p>}
          <div className={styles.qrActions}>
            {actions.map(action => <Button key={action} type="button" variant={action === "save" || (action === "revise" && !revising) || action === "reopen" ? "secondary" : "primary"} disabled={busy || (action === "revise" && revising && !reason.trim())} onClick={() => void run(action)}>
              {action === "save" && <Save size={16} aria-hidden="true" />} {action === "revise" && !revising ? "Revisi angka" : actionLabels[action]}
            </Button>)}
            {revising && <Button type="button" variant="secondary" disabled={busy} onClick={() => { setRevising(false); setPrepared(state.prepared_count === null ? "" : String(state.prepared_count)); setNotes(state.notes); }}>Batal</Button>}
          </div>
          {actions.map(action => actionHints[action] && <p key={action} className="field-hint">{actionLabels[action]}: {actionHints[action]}</p>)}
        </section>}

        <section className={styles.beoSection} aria-labelledby="beo-food">
          <h2 id="beo-food">Makanan</h2>
          {summary.dietary.length === 0 ? <p>Belum ada kebutuhan makanan khusus dari tamu yang hadir.</p> : <ul className={styles.beoCounts}>
            {summary.dietary.map(item => <li key={item.key}><strong>{item.count}</strong> {item.label}</li>)}
          </ul>}
          <p className="field-hint">Dihitung per jawaban, bukan per orang: satu tamu bisa vegetarian sekaligus alergi.</p>
          {summary.allergies.length > 0 && <div className={styles.tableWrap}><table className={styles.table}>
            <caption>Alergi</caption>
            <thead><tr><th scope="col">Tamu</th><th scope="col">Alergen</th></tr></thead>
            <tbody>{summary.allergies.map((item, index) => <tr key={index}>
              <td>{item.name}</td><td>{item.details || "Belum dirinci, tanyakan ke tamu"}</td>
            </tr>)}</tbody>
          </table></div>}
          {summary.otherFood.length > 0 && <div className={styles.tableWrap}><table className={styles.table}>
            <caption>Makanan lainnya</caption>
            <thead><tr><th scope="col">Tamu</th><th scope="col">Keterangan</th></tr></thead>
            <tbody>{summary.otherFood.map((item, index) => <tr key={index}><td>{item.name.split(/\s+/)[0]}</td><td>{item.details || "—"}</td></tr>)}</tbody>
          </table></div>}
        </section>

        <section className={styles.beoSection} aria-labelledby="beo-access">
          <h2 id="beo-access">Akses khusus</h2>
          {summary.access.length === 0 ? <p>Tidak ada kebutuhan akses dari tamu yang hadir.</p> : <ul className={styles.beoList}>
            {summary.access.map((item, index) => <li key={index}><strong>{item.name}</strong>: {[...item.needs, item.other].filter(Boolean).join(", ")}</li>)}
          </ul>}
        </section>

        <section className={styles.beoSection} aria-labelledby="beo-schedule">
          <h2 id="beo-schedule">Jadwal layanan <small>({tzLabel(event.timezone)})</small></h2>
          {summary.schedule.length === 0 ? <p>Rundown belum diisi di editor acara.</p> : <ol className={styles.beoList}>
            {summary.schedule.map(item => <li key={item.id}><strong>{time(item.starts_at)}–{time(item.ends_at)}</strong> {item.title}</li>)}
          </ol>}
        </section>

        {revisions.length > 0 && <section className={styles.beoSection} aria-labelledby="beo-history">
          <h2 id="beo-history">Riwayat</h2>
          <ol className={styles.beoList}>{revisions.map(rev => <li key={rev.id}>
            <strong>Versi {rev.version} · {beoStatusLabels[rev.status]}</strong> · {formatDateTime(rev.at, event.timezone)} · disiapkan {rev.prepared_count ?? "—"}, RSVP hadir {rev.attending}
            {rev.reason && <> · “{rev.reason}”</>}{rev.device_id && <> · perangkat {rev.device_id.slice(0, 8)}</>}
          </li>)}</ol>
        </section>}
      </div>
    </div>

    <aside className={styles.beoPreview} aria-label="Pratinjau lembar BEO">
      <ExportBar eventId={event.id} pages={preview.brief ? 2 : 1} />
      <div className={styles.beoPaper}><BeoSheets doc={preview} /></div>
      <p className="field-hint">Lembar ikut berubah saat jumlah, catatan, atau brief diubah. Yang belum disimpan belum ikut tercetak.</p>
    </aside>
  </div>;
}

/** Print and PDF take every page at once; the supplier version is a small extra. */
function ExportBar({ eventId, pages }: { eventId: string; pages: number }) {
  return <div className={styles.beoExportBar}>
    <ButtonLink variant="secondary" href={adminEventPath(eventId, "beo-print")} target="_blank" rel="noopener noreferrer"><Printer size={16} aria-hidden="true" /> Cetak semua<span className="sr-only"> (tab baru)</span></ButtonLink>
    <ButtonLink href={adminApi(eventId, "beo/pdf")} download><Download size={16} aria-hidden="true" /> Unduh PDF{pages > 1 ? ` (${pages} halaman)` : ""}</ButtonLink>
    <a className={styles.beoVendorLink} href={adminApi(eventId, "beo/pdf", { versi: beoVersionParam.vendor })} download title={beoVersionInfo.vendor.includes}>Unduh versi penyedia</a>
  </div>;
}

/** The hosting brief: written by whoever invited the guest, read by hospitality. */
function BriefForm({ eventId, initial, brief, onChange }: { eventId: string; initial: BriefState; brief: HostingBrief; onChange: (brief: HostingBrief) => void }) {
  const [version, setVersion] = useState(initial.version);
  const [saved, setSaved] = useState(initial.brief);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dirty = JSON.stringify(saved) !== JSON.stringify(brief);
  const set = <K extends keyof HostingBrief>(key: K, value: HostingBrief[K]) => { onChange({ ...brief, [key]: value }); setMessage(""); };
  const input = (key: "host_name" | "host_role" | "guest_name" | "guest_preferred" | "guest_position" | "relation_other" | "meal_notes", label: string, placeholder = "", max = 150) =>
    <Field label={label} name={`brief-${key}`}><input id={`brief-${key}`} maxLength={max} placeholder={placeholder} value={brief[key]} disabled={!initial.migrated || busy} onChange={e => set(key, e.target.value)} /></Field>;
  const area = (key: "history" | "purpose" | "outcome" | "interests" | "comfort", label: string, placeholder = "") =>
    <Field label={label} name={`brief-${key}`}><textarea id={`brief-${key}`} rows={2} maxLength={1000} placeholder={placeholder} value={brief[key]} disabled={!initial.migrated || busy} onChange={e => set(key, e.target.value)} /></Field>;

  async function save() {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await adminRequest<BriefState>(adminApi(eventId, "beo/brief"), { method: "PUT", body: JSON.stringify({ brief, version }) });
      if (result.data) { setVersion(result.data.version); setSaved(result.data.brief); onChange(result.data.brief); }
      setMessage(result.message);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  return <section className={styles.guestCard} aria-labelledby="brief-title">
    <div>
      <h2 id="brief-title" className={styles.guestCardTitle}>Brief tamu</h2>
      <p className="field-hint">Diisi oleh yang mengundang, dibaca hospitality. Jumlah orang, makanan khusus, dan kebutuhan akses diambil otomatis dari konfirmasi tamu.</p>
    </div>
    {!initial.migrated && <Notice tone="warning">Brief tamu menunggu migrasi <code>202610270001_hosting_brief.sql</code>.</Notice>}

    <fieldset className={styles.beoFieldset}>
      <legend>Tamu &amp; yang mengundang</legend>
      <div className={styles.beoPair}>{input("host_name", "Diundang oleh (PIC)", "Nama tim Werkudara")}{input("host_role", "Divisi PIC", "Misalnya Business Development")}</div>
      <div className={styles.beoPair}>{input("guest_name", "Tamu utama", "Nama lengkap")}{input("guest_preferred", "Dipanggil", "Misalnya Pak Budi", 100)}</div>
      {input("guest_position", "Jabatan & perusahaan", "Misalnya Head of Operations, PT Sinar Abadi", 250)}
    </fieldset>

    <fieldset className={styles.beoFieldset}>
      <legend>Hubungan &amp; tujuan</legend>
      <div>
        <p className={styles.beoLabel} id="brief-relation">Hubungan dengan Werkudara</p>
        <div className={styles.chips} role="group" aria-labelledby="brief-relation">
          {briefRelations.map(key => <button key={key} type="button" className={styles.chip} aria-pressed={brief.relation === key} disabled={!initial.migrated || busy} onClick={() => set("relation", brief.relation === key ? "" : key)}>{briefRelationLabels[key]}</button>)}
        </div>
      </div>
      {brief.relation === "other" && input("relation_other", "Hubungan lainnya")}
      <div>
        <p className={styles.beoLabel} id="brief-first">Kunjungan pertama?</p>
        <div className={styles.chips} role="group" aria-labelledby="brief-first">
          {([[true, "Ya"], [false, "Tidak"]] as const).map(([value, label]) => <button key={label} type="button" className={styles.chip} aria-pressed={brief.first_visit === value} disabled={!initial.migrated || busy} onClick={() => set("first_visit", brief.first_visit === value ? null : value)}>{label}</button>)}
        </div>
      </div>
      {area("history", "Riwayat kerja sama", "Misalnya event tahunan 2025, presentasi bulan lalu")}
      {area("purpose", "Tujuan & agenda")}
      {area("outcome", "Hasil yang diharapkan")}
    </fieldset>

    <fieldset className={styles.beoFieldset}>
      <legend>Untuk hospitality</legend>
      <div>
        <p className={styles.beoLabel} id="brief-meals">Konsumsi</p>
        <div className={styles.chips} role="group" aria-labelledby="brief-meals">
          {briefMeals.map(key => { const on = brief.meals.includes(key); return <button key={key} type="button" className={styles.chip} aria-pressed={on} disabled={!initial.migrated || busy} onClick={() => set("meals", on ? brief.meals.filter(meal => meal !== key) : briefMeals.filter(meal => meal === key || brief.meals.includes(meal)))}>{briefMealLabels[key]}</button>; })}
        </div>
      </div>
      {input("meal_notes", "Catatan konsumsi (opsional)", "Misalnya training 2–3 jam, cukup snack", 500)}
      {area("interests", "Minat & topik obrolan", "Misalnya suka kopi lokal, tertarik budaya Jawa")}
      {area("comfort", "Kebutuhan kenyamanan", "Misalnya tempat salat, ruang menyusui")}
    </fieldset>

    {error && <Notice tone="error" role="alert">{error}</Notice>}
    {message && <p role="status" className={styles.guestMessage}>{message}</p>}
    <div className={styles.qrActions}>
      <Button type="button" disabled={!initial.migrated || busy || !dirty} onClick={() => void save()}><Save size={16} aria-hidden="true" /> Simpan brief</Button>
      {dirty && <span className="field-hint">Ada perubahan yang belum disimpan.</span>}
    </div>
  </section>;
}
