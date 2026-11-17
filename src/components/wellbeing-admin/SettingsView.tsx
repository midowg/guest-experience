"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, Megaphone, PauseCircle, Plus, ScanText, ShieldCheck, Smartphone, Trophy, Zap } from "lucide-react";
import { Card, ConsoleButton, ConsoleButtonLink, PageHeader, Pill } from "@/components/console";
import { errorMessage } from "@/components/admin/shared/api";
import { Panel, SkeletonRows } from "@/components/app-shell/Panel";
import { revalidate, setResource, useResource } from "@/components/app-shell/resource";
import { useToast } from "@/components/app-shell/Toast";
import { superAdminPath, wellbeingAdminApi } from "@/lib/routes";
import { DIMENSIONS, MIGRATION_WELLBEING_APP, dimensionLabels, wibToday, type AppControls, type CatalogItemInput, type DimensionId, type Limit, type PointsMode } from "@/lib/wellbeing/rules";
import { MIGRATION_STRAVA } from "@/lib/wellbeing/strava";
import type { WbCatalog, WbCatalogItem, WbSettingsView, WbStravaAdmin } from "@/lib/wellbeing/types";
import { points, send, wb } from "./api";
import { DimensionIcon, LoadError, Refreshing, WaitingMigration } from "./parts";
import css from "./wellbeing-admin.module.css";

/** Pengaturan (16 Nov 2026; Aplikasi karyawan 17 Nov 2026): what the employee app shows, the rules, the activity catalogue, Strava, and who may open this admin. */
export function SettingsView() {
  const catalog = useResource(wb.catalog.key, wb.catalog.fetch);
  const [editing, setEditing] = useState<WbCatalogItem | "new" | null>(null);
  const groups: { key: string; label: string; dimension: DimensionId; items: WbCatalogItem[] }[] = [
    ...DIMENSIONS.map(dimension => ({ key: dimension, label: dimensionLabels[dimension], dimension, items: (catalog.data?.items ?? []).filter(item => item.kind === "daily" && item.dimension === dimension) })),
    { key: "sport", label: "Olahraga", dimension: "physical", items: (catalog.data?.items ?? []).filter(item => item.kind === "sport") },
  ];
  return <>
    <PageHeader title="Pengaturan" subtitle="Apa yang tampil di aplikasi karyawan, aturan pencatatan, dan daftar kegiatan yang bisa dicatat." />
    <Refreshing on={catalog.refreshing} />
    {catalog.data && !catalog.data.migrated && <WaitingMigration />}
    <div className={css.stack}>
      <AppCard />
      <RulesCard />
      <Card title="Kegiatan yang bisa dicatat">
        <div className={css.rowEnd}><ConsoleButton variant="primary" icon={<Plus size={18} aria-hidden="true" />} onClick={() => setEditing("new")}>Tambah kegiatan</ConsoleButton></div>
        {catalog.error && !catalog.data ? <LoadError message={catalog.error} onRetry={() => void catalog.reload()} />
          : !catalog.data ? <SkeletonRows rows={6} />
          : groups.map(group => <section key={group.key} className={css.catalogGroup} aria-label={group.label}>
            <h3 className={css.subhead}><DimensionIcon dimension={group.dimension} size={28} />{group.label}<small>{group.items.filter(item => item.active).length} aktif</small></h3>
            <ul className={css.catalogList}>
              {group.items.map(item => <li key={item.code}>
                <button type="button" className={css.catalogRow} data-off={!item.active} onClick={() => setEditing(item)}>
                  <span className={css.catalogName}><strong>{item.name}</strong>{item.proofHint && <small>{item.proofHint}</small>}</span>
                  <span className={css.catalogTags}>
                    {item.limit && <Pill tone="neutral">{item.limit === "day" ? "1x sehari" : "1x sebulan"}</Pill>}
                    {!item.active && <Pill tone="neutral">Nonaktif</Pill>}
                    <strong className={css.pts}>{item.mode === "fixed" ? `+${points(item.points)}` : item.mode === "steps" ? "10 langkah = 1" : "1 kkal = 1"}</strong>
                  </span>
                </button>
              </li>)}
            </ul>
          </section>)}
      </Card>
      <StravaCard />
      <Card title="Siapa yang boleh membuka admin ini">
        <p className={css.text}><ShieldCheck size={18} aria-hidden="true" className={css.inlineIcon} />Super admin memberi akses <strong>Wellbeing</strong> per orang di Super admin → Akses admin.</p>
        <div className={css.rowEnd}><ConsoleButtonLink href={superAdminPath.admins}>Buka Akses admin</ConsoleButtonLink></div>
      </Card>
    </div>
    <CatalogPanel item={editing} onClose={() => setEditing(null)} />
  </>;
}

/**
 * Strava (18 Nov 2026): the office's Strava app as Journey sees it: its keys (Vercel), the migration, the
 * webhook (one per Strava app; Aktifkan webhook once), and how many employees are connected.
 */
function StravaCard() {
  const strava = useResource(wb.strava.key, wb.strava.fetch);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const data = strava.data;
  async function subscribe() {
    setBusy(true);
    try {
      const { data: next, message } = await send<WbStravaAdmin>(wellbeingAdminApi.strava, "POST");
      setResource<WbStravaAdmin>(wb.strava.key, () => next);
      toast({ message, tone: "ok" });
    } catch (error) { toast({ message: errorMessage(error), tone: "bad" }); }
    finally { setBusy(false); }
  }
  const elsewhere = !!data?.subscription && data.subscription.callbackUrl !== data.callbackUrl;
  return <Card title="Strava">
    {strava.error && !data ? <LoadError message={strava.error} onRetry={() => void strava.reload()} />
      : !data ? <SkeletonRows rows={3} />
      : <div className={css.stack}>
        <ul className={css.checks}>
          <StravaCheck ok={data.configured} title="Kunci aplikasi Strava"
            detail={data.configured ? "STRAVA_CLIENT_ID dan STRAVA_CLIENT_SECRET terbaca di server." : "Isi STRAVA_CLIENT_ID dan STRAVA_CLIENT_SECRET di Vercel (Environment Variables), lalu deploy ulang."} />
          <StravaCheck ok={data.migrated} title="Database"
            detail={data.migrated ? "Tabel sambungan Strava siap." : `Jalankan migrasi ${MIGRATION_STRAVA} di Supabase SQL Editor.`} />
          <StravaCheck ok={!!data.subscription && !elsewhere} title="Webhook"
            detail={elsewhere ? `Mengarah ke alamat lain (${data.subscription?.callbackUrl}). Satu aplikasi Strava hanya punya satu webhook.`
              : data.subscription ? "Aktif. Aktivitas baru masuk beberapa saat setelah tersimpan di Strava."
              : data.subscriptionError ?? "Belum aktif. Tanpa webhook, aktivitas baru hanya masuk saat karyawan menekan Sinkronkan sekarang."} />
        </ul>
        <ul className={css.dimTiles}>
          <li><small>Tersambung</small><strong>{points(data.connected)}</strong></li>
          <li><small>Perlu sambung ulang</small><strong>{points(data.reconnect)}</strong></li>
        </ul>
        <p className={css.help}><Zap size={16} aria-hidden="true" className={css.inlineIcon} />Di strava.com/settings/api, <strong>Authorization Callback Domain</strong> harus <code>{hostOf(data.callbackUrl)}</code>. Pemilik aplikasi Strava wajib berlangganan Strava.</p>
        {!data.subscription && <div className={css.rowEnd}>
          <ConsoleButton variant="primary" icon={<Zap size={18} aria-hidden="true" />} disabled={!data.configured || !data.migrated || busy} onClick={() => void subscribe()}>{busy ? "Menghubungi Strava…" : "Aktifkan webhook"}</ConsoleButton>
        </div>}
      </div>}
  </Card>;
}
const hostOf = (url: string) => { try { return new URL(url).hostname; } catch { return url; } };

function StravaCheck({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  return <li className={css.check} data-ok={ok}>
    {ok ? <CheckCircle2 size={20} aria-hidden="true" /> : <CircleAlert size={20} aria-hidden="true" />}
    <span><strong>{title}</strong><small>{detail}</small></span>
    <span className="sr-only">{ok ? "siap" : "belum siap"}</span>
  </li>;
}

/**
 * Aplikasi karyawan: what an admin may steer in the employee app, and nothing more (curated 17 Nov
 * 2026): an announcement on Beranda, this month's prize (with the race), reading proof photos on the
 * phone, and pausing Catat with a message. Changes show on the app's next refresh.
 */
function AppCard() {
  const settings = useResource(wb.settings.key, wb.settings.fetch);
  const data = settings.data;
  return <Card title="Aplikasi karyawan">
    {settings.error && !data ? <LoadError message={settings.error} onRetry={() => void settings.reload()} />
      : !data ? <SkeletonRows rows={4} />
      : <AppForm key={`${data.appReady}-${JSON.stringify(data.app)}`} data={data} />}
  </Card>;
}

function AppForm({ data }: { data: WbSettingsView }) {
  const toast = useToast();
  const [form, setForm] = useState<AppControls>(data.app);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const changed = JSON.stringify(form) !== JSON.stringify(data.app);
  const ready = data.migrated && data.appReady;
  const today = wibToday();
  async function save() {
    setProblem("");
    if (form.announcement.on && !form.announcement.title.trim() && !form.announcement.message.trim()) return setProblem("Isi judul atau isi pengumuman, atau matikan pengumuman.");
    setBusy(true);
    try {
      const { data: saved, message } = await send<WbSettingsView>(wellbeingAdminApi.appControls, "PUT", form);
      setResource<WbSettingsView>(wb.settings.key, () => saved);
      toast({ message, tone: "ok" });
    } catch (error) { setProblem(errorMessage(error)); }
    finally { setBusy(false); }
  }
  const announce = <K extends keyof AppControls["announcement"]>(key: K, value: AppControls["announcement"][K]) => setForm(current => ({ ...current, announcement: { ...current.announcement, [key]: value } }));
  return <form className={css.form} onSubmit={event => { event.preventDefault(); void save(); }}>
    {!ready && <div className={css.notice} data-tone="warn" role="status"><Smartphone size={20} aria-hidden="true" />
      <div><strong>Menunggu migrasi.</strong> Aplikasi karyawan memakai pengaturan bawaan (tanpa pengumuman, baca foto aktif, Catat terbuka) sampai <code>{MIGRATION_WELLBEING_APP}</code> dijalankan pemilik.</div></div>}
    <fieldset className={css.controlGroup} disabled={!ready}>
      <legend><Megaphone size={18} aria-hidden="true" />Pengumuman di Beranda</legend>
      <label className={css.switchRow}><input type="checkbox" checked={form.announcement.on} onChange={event => announce("on", event.target.checked)} />
        <span><strong>Tampilkan pengumuman</strong><small>Kartu di atas Beranda. Karyawan bisa menutupnya; pengumuman yang diubah muncul lagi.</small></span></label>
      <div className={css.fieldRow}>
        <label className={css.field}><span>Judul</span><input className={css.input} value={form.announcement.title} maxLength={80} placeholder="mis. Balapan November ditutup 30 Nov" onChange={event => announce("title", event.target.value)} /></label>
        <label className={css.field}><span>Tampil sampai (opsional)</span><input className={css.input} type="date" value={form.announcement.until ?? ""} min={today} onChange={event => announce("until", event.target.value || null)} /></label>
      </div>
      <label className={css.field}><span>Isi</span><textarea className={css.input} rows={3} value={form.announcement.message} maxLength={300} placeholder="Ajakan, aturan baru, atau jadwal acara kantor" onChange={event => announce("message", event.target.value)} /></label>
    </fieldset>
    <fieldset className={css.controlGroup} disabled={!ready}>
      <legend><Trophy size={18} aria-hidden="true" />Hadiah bulan ini</legend>
      <label className={css.field}><span>Teks hadiah</span>
        <input className={css.input} value={form.prize} maxLength={160} placeholder="mis. Juara 1 voucher Decathlon Rp250 rb" onChange={event => setForm(current => ({ ...current, prize: event.target.value }))} />
        <small className={css.help}>Tampil di kartu balapan Beranda dan di Peringkat. Kosongkan untuk menyembunyikan.</small></label>
    </fieldset>
    <fieldset className={css.controlGroup} disabled={!ready}>
      <legend><ScanText size={18} aria-hidden="true" />Catat</legend>
      <label className={css.switchRow}><input type="checkbox" checked={form.photoReading} onChange={event => setForm(current => ({ ...current, photoReading: event.target.checked }))} />
        <span><strong>Baca data dari foto bukti</strong><small>Pilihan “Dari foto bukti” dan isian otomatis. Matikan bila bermasalah di HP tertentu; karyawan tetap bisa mengisi sendiri.</small></span></label>
      <label className={css.switchRow}><input type="checkbox" checked={form.logging.paused} onChange={event => setForm(current => ({ ...current, logging: { ...current.logging, paused: event.target.checked } }))} />
        <span><strong><PauseCircle size={16} aria-hidden="true" className={css.inlineIcon} />Jeda pencatatan</strong><small>Karyawan tidak bisa mencatat sementara (mis. saat pindah data). Poin dan riwayat tetap terlihat.</small></span></label>
      {form.logging.paused && <label className={css.field}><span>Pesan untuk karyawan</span>
        <input className={css.input} value={form.logging.message} maxLength={200} placeholder="mis. Pencatatan dibuka lagi Senin pukul 08.00." onChange={event => setForm(current => ({ ...current, logging: { ...current.logging, message: event.target.value } }))} /></label>}
    </fieldset>
    {problem && <p className={css.problem} role="alert">{problem}</p>}
    <div className={css.rowEnd}>
      {data.updatedBy && <small className={css.help}>Terakhir diubah oleh {data.updatedBy}</small>}
      <ConsoleButton type="submit" variant="primary" disabled={!ready || !changed || busy}>{busy ? "Menyimpan…" : "Simpan pengaturan aplikasi"}</ConsoleButton>
    </div>
  </form>;
}

function RulesCard() {
  const settings = useResource(wb.settings.key, wb.settings.fetch);
  const data = settings.data;
  return <Card title="Aturan pencatatan">
    {settings.error && !data ? <LoadError message={settings.error} onRetry={() => void settings.reload()} />
      : !data ? <SkeletonRows rows={2} />
      : <RulesForm key={`${data.backdateDays}-${data.maxKcal}-${data.maxSteps}`} data={data} />}
  </Card>;
}

function RulesForm({ data }: { data: WbSettingsView }) {
  const toast = useToast();
  const [form, setForm] = useState({ backdateDays: String(data.backdateDays), maxKcal: String(data.maxKcal), maxSteps: String(data.maxSteps) });
  const [busy, setBusy] = useState(false);
  const changed = (Number(form.backdateDays) !== data.backdateDays || Number(form.maxKcal) !== data.maxKcal || Number(form.maxSteps) !== data.maxSteps);
  async function save() {
    setBusy(true);
    try {
      const { data: saved, message } = await send<WbSettingsView>(wellbeingAdminApi.settings, "PUT", { backdateDays: Number(form.backdateDays), maxKcal: Number(form.maxKcal), maxSteps: Number(form.maxSteps) });
      setResource<WbSettingsView>(wb.settings.key, () => saved);
      toast({ message, tone: "ok" });
    } catch (error) { toast({ message: errorMessage(error), tone: "bad" }); }
    finally { setBusy(false); }
  }
  const field = (key: keyof typeof form, label: string, unit: string, help: string) => <label className={css.field}>
    <span>{label}</span>
    <span className={css.withUnit}><input className={css.input} inputMode="numeric" value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value.replace(/\D/g, "").slice(0, 6) }))} /><small>{unit}</small></span>
    <small className={css.help}>{help}</small>
  </label>;
  return <form className={css.form} onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className={css.fieldRow3}>
          {field("backdateDays", "Boleh mundur", "hari", "0 = hanya hari ini. Tanggal depan selalu ditolak.")}
          {field("maxKcal", "Kalori maksimal", "kkal", "Per aktivitas olahraga (1 kkal = 1 poin).")}
          {field("maxSteps", "Langkah maksimal", "langkah", "Per hari (10 langkah = 1 poin).")}
        </div>
        <div className={css.rowEnd}>
          {data.updatedBy && <small className={css.help}>Terakhir diubah oleh {data.updatedBy}</small>}
          <ConsoleButton type="submit" variant="primary" disabled={!changed || busy}>{busy ? "Menyimpan…" : "Simpan aturan"}</ConsoleButton>
        </div>
      </form>;
}

const blank: CatalogItemInput = { name: "", dimension: "emotional", kind: "daily", mode: "fixed", points: 100, limit: null, proofHint: "Foto, screenshot, atau bukti partisipasi", active: true };

const formOf = (item: WbCatalogItem | "new" | null): CatalogItemInput => !item || item === "new" ? blank
  : { name: item.name, dimension: item.dimension, kind: item.kind, mode: item.mode, points: item.points, limit: item.limit, proofHint: item.proofHint, active: item.active };

/** Opens with the values of the item it edits (reset whenever another item opens). */
function CatalogPanel({ item, onClose }: { item: WbCatalogItem | "new" | null; onClose: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<CatalogItemInput>(() => formOf(item));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [shown, setShown] = useState(item);
  if (item !== shown) { setShown(item); if (item) { setForm(formOf(item)); setProblem(""); } }
  const isNew = item === "new";
  async function save() {
    setProblem("");
    if (form.name.trim().length < 2) return setProblem("Isi nama kegiatan.");
    if (form.kind === "daily" && form.mode === "fixed" && form.points < 1) return setProblem("Isi poin lebih dari 0.");
    setBusy(true);
    try {
      const { data, message } = isNew
        ? await send<WbCatalogItem>(wellbeingAdminApi.catalog, "POST", form)
        : await send<WbCatalogItem>(wellbeingAdminApi.catalogItem((item as WbCatalogItem).code), "PATCH", form);
      setResource<WbCatalog>(wb.catalog.key, current => current && { ...current, items: isNew ? [...current.items, data] : current.items.map(entry => entry.code === data.code ? data : entry) });
      revalidate(wb.catalog.key);
      toast({ message, tone: "ok" });
      onClose();
    } catch (error) { setProblem(errorMessage(error)); }
    finally { setBusy(false); }
  }
  const set = <K extends keyof CatalogItemInput>(key: K, value: CatalogItemInput[K]) => setForm(current => ({ ...current, [key]: value }));
  return <Panel open={!!item} onClose={onClose} title={isNew ? "Tambah kegiatan" : "Ubah kegiatan"}
    subtitle={isNew ? "Langsung bisa dicatat karyawan." : "Aktivitas yang sudah tercatat tetap memakai poin lamanya."}
    footer={<><ConsoleButton onClick={onClose} disabled={busy}>Batal</ConsoleButton><ConsoleButton variant="primary" onClick={() => void save()} disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</ConsoleButton></>}>
    <form className={css.form} onSubmit={event => { event.preventDefault(); void save(); }}>
      <label className={css.field}><span>Nama kegiatan</span><input className={css.input} value={form.name} maxLength={200} onChange={event => set("name", event.target.value)} autoFocus={isNew} /></label>
      <div className={css.fieldRow}>
        <label className={css.field}><span>Jenis</span>
          <select className={css.select} value={form.kind} disabled={!isNew} onChange={event => { const kind = event.target.value as "daily" | "sport"; setForm(current => ({ ...current, kind, ...(kind === "sport" ? { dimension: "physical", mode: "kcal" } : { mode: "fixed" }) })); }}>
            <option value="daily">Kegiatan harian</option><option value="sport">Olahraga (poin = kalori)</option>
          </select></label>
        <label className={css.field}><span>Dimensi</span>
          <select className={css.select} value={form.dimension} disabled={form.kind === "sport"} onChange={event => set("dimension", event.target.value as DimensionId)}>
            {DIMENSIONS.map(id => <option key={id} value={id}>{dimensionLabels[id]}</option>)}
          </select></label>
      </div>
      {form.kind === "daily" && <div className={css.fieldRow}>
        <label className={css.field}><span>Cara hitung poin</span>
          <select className={css.select} value={form.mode} onChange={event => set("mode", event.target.value as PointsMode)}>
            <option value="fixed">Poin tetap</option><option value="steps">Dari langkah (10 langkah = 1 poin)</option>
          </select></label>
        {form.mode === "fixed" && <label className={css.field}><span>Poin</span><input className={css.input} inputMode="numeric" value={String(form.points)} onChange={event => set("points", Number(event.target.value.replace(/\D/g, "").slice(0, 5)) || 0)} /></label>}
      </div>}
      <label className={css.field}><span>Batas</span>
        <select className={css.select} value={form.limit ?? ""} onChange={event => set("limit", (event.target.value || null) as Limit | null)}>
          <option value="">Tanpa batas</option><option value="day">1x sehari</option><option value="month">1x sebulan</option>
        </select></label>
      <label className={css.field}><span>Petunjuk bukti (dilihat karyawan)</span><input className={css.input} value={form.proofHint} maxLength={200} onChange={event => set("proofHint", event.target.value)} /></label>
      <label className={css.switchRow}><input type="checkbox" checked={form.active} onChange={event => set("active", event.target.checked)} /><span><strong>Aktif</strong><small>Kegiatan nonaktif tidak bisa dicatat lagi; catatan lama tetap ada.</small></span></label>
      {problem && <p className={css.problem} role="alert">{problem}</p>}
    </form>
  </Panel>;
}
