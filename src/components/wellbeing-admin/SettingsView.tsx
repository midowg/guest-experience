"use client";

import { useState } from "react";
import { Plus, ShieldCheck, Zap } from "lucide-react";
import { Card, ConsoleButton, ConsoleButtonLink, PageHeader, Pill } from "@/components/console";
import { errorMessage } from "@/components/admin/shared/api";
import { Panel, SkeletonRows } from "@/components/app-shell/Panel";
import { revalidate, setResource, useResource } from "@/components/app-shell/resource";
import { useToast } from "@/components/app-shell/Toast";
import { superAdminPath, wellbeingAdminApi } from "@/lib/routes";
import { DIMENSIONS, dimensionLabels, type CatalogItemInput, type DimensionId, type Limit, type PointsMode } from "@/lib/wellbeing/rules";
import type { WbCatalog, WbCatalogItem, WbSettingsView } from "@/lib/wellbeing/types";
import { points, send, wb } from "./api";
import { DimensionIcon, LoadError, Refreshing, WaitingMigration } from "./parts";
import css from "./wellbeing-admin.module.css";

/** Pengaturan (16 Nov 2026): the rules, the activity catalogue, Strava, and who may open this admin. */
export function SettingsView() {
  const catalog = useResource(wb.catalog.key, wb.catalog.fetch);
  const [editing, setEditing] = useState<WbCatalogItem | "new" | null>(null);
  const groups: { key: string; label: string; dimension: DimensionId; items: WbCatalogItem[] }[] = [
    ...DIMENSIONS.map(dimension => ({ key: dimension, label: dimensionLabels[dimension], dimension, items: (catalog.data?.items ?? []).filter(item => item.kind === "daily" && item.dimension === dimension) })),
    { key: "sport", label: "Olahraga", dimension: "physical", items: (catalog.data?.items ?? []).filter(item => item.kind === "sport") },
  ];
  return <>
    <PageHeader title="Pengaturan" subtitle="Aturan pencatatan dan daftar kegiatan yang bisa dicatat karyawan." />
    <Refreshing on={catalog.refreshing} />
    {catalog.data && !catalog.data.migrated && <WaitingMigration />}
    <div className={css.stack}>
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
      <Card title="Strava">
        <p className={css.text}><Zap size={18} aria-hidden="true" className={css.inlineIcon} />Sambungan Strava dibangun ulang di tahap berikutnya: aktivitas masuk otomatis lewat webhook, status sambungan tiap karyawan terlihat di sini. Aplikasi Strava API perlu pemiliknya (akun Strava berlangganan) sebelum bisa dipindah.</p>
      </Card>
      <Card title="Siapa yang boleh membuka admin ini">
        <p className={css.text}><ShieldCheck size={18} aria-hidden="true" className={css.inlineIcon} />Super admin memberi akses <strong>Wellbeing</strong> per orang di Super admin → Akses admin.</p>
        <div className={css.rowEnd}><ConsoleButtonLink href={superAdminPath.admins}>Buka Akses admin</ConsoleButtonLink></div>
      </Card>
    </div>
    <CatalogPanel item={editing} onClose={() => setEditing(null)} />
  </>;
}

function RulesCard() {
  const settings = useResource(wb.settings.key, wb.settings.fetch);
  const data = settings.data;
  return <Card title="Aturan pencatatan">
    {settings.error && !data ? <LoadError message={settings.error} onRetry={() => void settings.reload()} />
      : !data ? <SkeletonRows rows={2} />
      : <RulesForm key={`${data.updatedAt}-${data.backdateDays}-${data.maxKcal}-${data.maxSteps}`} data={data} />}
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
