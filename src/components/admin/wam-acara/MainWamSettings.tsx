"use client";

import { useId, useMemo, useState } from "react";
import { ImagePlus, Trash2, UserPlus } from "lucide-react";
import { Notice } from "@/components/ui";
import { buttonClass, Card, ConsoleButton, PageHeader, type Crumb } from "@/components/console";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import { putFile, putProblem } from "@/components/pra-wam/photoUpload";
import { DISPLAY_FONTS } from "@/components/main-wam/theme/tokens";
import { APP_HIDDEN_NOTE, appHidden, moduleInfo } from "@/lib/main-wam/modules";
import { THEME_IMAGE_BYTES, THEME_IMAGE_TYPES, type ThemeImageMime } from "@/lib/main-wam/theme-image";
import {
  MAIN_WAM_MODES, MAIN_WAM_MODULES, THEME_IMAGE_SLOTS, mainWamModeLabels, themeImageLabels,
  type MainWamMode, type MainWamSettings as Settings, type ModuleSwitches, type ThemeImageSlot,
} from "@/lib/main-wam/types";
import { mainWamAdminApi, mainWamApi } from "@/lib/routes";
import type { Tester } from "@/lib/server/main-wam/settings";
import { CommitteeCard, DemoCard } from "./DemoCards";
import css from "./main-wam-settings.module.css";

type Message = { tone: "success" | "error"; text: string } | null;
export type PersonOption = { id: string; fullName: string; department: string };
export type FormOption = { slug: string; name: string };

const modeHints: Record<MainWamMode, string> = {
  pra: "Semua orang memakai Pra WAM. WAM 2026 hanya bisa dibuka penguji lewat alamatnya, untuk menyiapkan isinya.",
  uji: "Penguji yang membuka /wam langsung masuk WAM 2026; yang lain tetap di Pra WAM dan tidak melihat WAM 2026.",
  semua: "Semua orang yang membuka /wam masuk WAM 2026. Pra WAM tetap bisa dibuka lewat alamatnya.",
};
/** Default colours of the neutral theme (DESIGN_SYSTEM.md), shown while nothing is set. */
const COLOR_FIELDS = [
  { key: "primary", label: "Warna utama", fallback: "#2F6FEB" },
  { key: "accent", label: "Warna aksen acara", fallback: "#1E3A5F" },
] as const;
const fontLabels: Record<string, string> = { "barlow-condensed": "Barlow Condensed (bawaan)", "plus-jakarta-sans": "Plus Jakarta Sans" };

async function save(body: unknown): Promise<{ settings: Settings; message: string }> {
  const result = await adminRequest<Settings>(mainWamAdminApi.settings, { method: "PUT", body: JSON.stringify(body) });
  return { settings: result.data!, message: result.message };
}

/**
 * Admin WAM 2026 → Pengaturan (fondasi): mode acara (who sees Main WAM, where /wam goes),
 * the penguji list, the modules on or off, and the theme (colours, display face, a KV image per
 * slot, to be filled once the KV is chosen). Every change is saved on its own.
 */
export function MainWamSettings({ initial, testers: firstTesters, testersMigrated, people, forms, storage, crumbs = [], title = "Pengaturan", hidden = false }: {
  initial: Settings; testers: Tester[]; testersMigrated: boolean; people: PersonOption[]; forms: FormOption[]; storage: boolean; crumbs?: readonly Crumb[]; title?: string;
  /** Main WAM hidden from Journey by the super admin (20 Nov 2026): said here, so the WAM team knows what it means. */
  hidden?: boolean;
}) {
  const id = useId();
  const [settings, setSettings] = useState(initial);
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const locked = !settings.migrated || busy !== null;

  async function run(what: string, action: () => Promise<string>) {
    setBusy(what); setMessage(null);
    try { setMessage({ tone: "success", text: await action() }); }
    catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(null); }
  }
  const apply = (body: unknown) => async () => { const { settings: next, message: text } = await save(body); setSettings(next); return text; };

  return <div className="stack">
    <PageHeader crumbs={crumbs} title={title}
      subtitle="Aplikasi selama acara WAM 2026, tersembunyi sampai modenya diubah di sini." />
    {hidden && <Notice tone="info"><strong>WAM 2026 tersembunyi di aplikasi</strong> sampai super admin menampilkannya (Super admin → Halaman utama). Selama itu /wam selalu membuka Pra WAM, dan notifikasi WAM 2026 hanya sampai ke penguji (daftar di bawah dan Panitia WAM). Admin ini tetap terbuka, dan mode acara tetap berlaku untuk tautan langsung /wam/acara.</Notice>}
    {!settings.migrated && <Notice tone="warning">Pengaturan WAM 2026 menunggu pembaruan sistem. Sampai saat itu WAM 2026 tersembunyi untuk semua orang dan pengaturan belum bisa disimpan. Hubungi tim CoE.</Notice>}
    <div aria-live="polite">{message && <Notice tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>{message.text}</Notice>}</div>
    <div className={css.grid}>
      <ModeCard id={`${id}-mode`} mode={settings.mode} locked={locked} busy={busy === "mode"} onSave={mode => run("mode", apply({ mode }))} />
      <DemoCard id={`${id}-demo`} enabled={settings.moduleConfig.demo} locked={locked} busy={busy === "demo"} onSave={demo => run("demo", apply({ moduleConfig: { demo } }))} />
      <TestersCard id={`${id}-penguji`} initial={firstTesters} migrated={testersMigrated && settings.migrated} people={people} onMessage={setMessage} />
      <CommitteeCard id={`${id}-panitia`} />
      <ModulesCard id={`${id}-modul`} settings={settings} forms={forms} locked={locked} busy={busy === "modul"}
        onSave={(modules, formSlug) => run("modul", apply({ modules, moduleConfig: { survei: { formSlug } } }))} />
      <ThemeCard id={`${id}-tema`} settings={settings} locked={locked} busy={busy} storage={storage} run={run} onSaved={setSettings} />
    </div>
  </div>;
}

function ModeCard({ id, mode, locked, busy, onSave }: { id: string; mode: MainWamMode; locked: boolean; busy: boolean; onSave: (mode: MainWamMode) => void }) {
  const [choice, setChoice] = useState(mode);
  const [confirming, setConfirming] = useState(false);
  const submit = () => { if (choice === "semua" && !confirming) { setConfirming(true); return; } setConfirming(false); onSave(choice); };
  return <Card title="Mode acara" id={id}>
    <fieldset className={css.modes} disabled={locked}>
      <legend className="sr-only">Mode acara</legend>
      {MAIN_WAM_MODES.map(value => <label key={value} className={css.mode}>
        <input type="radio" name={`${id}-mode`} value={value} checked={choice === value} onChange={() => { setChoice(value); setConfirming(false); }} />
        <strong>{mainWamModeLabels[value]}{value === "pra" && " (bawaan)"}{mode === value && <span className={css.inUse}>Dipakai sekarang</span>}</strong>
        <small>{modeHints[value]}</small>
      </label>)}
    </fieldset>
    {confirming && <Notice tone="warning" role="alert">Semua orang yang membuka /wam akan masuk WAM 2026, dan notifikasi WAM 2026 sampai ke semua orang. Lanjutkan?</Notice>}
    <div className={css.actions}>
      <ConsoleButton variant="primary" disabled={locked || choice === mode} onClick={submit}>{busy ? "Menyimpan…" : confirming ? "Ya, buka untuk semua" : "Pakai mode ini"}</ConsoleButton>
      {confirming && <ConsoleButton onClick={() => setConfirming(false)}>Batal</ConsoleButton>}
    </div>
  </Card>;
}

function TestersCard({ id, initial, migrated, people, onMessage }: { id: string; initial: Tester[]; migrated: boolean; people: PersonOption[]; onMessage: (message: Message) => void }) {
  const [testers, setTesters] = useState(initial);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const listed = useMemo(() => new Set(testers.map(tester => tester.employeeId)), [testers]);
  const options = useMemo(() => people.filter(person => !listed.has(person.id)).map(person => ({ ...person, label: `${person.fullName} · ${person.department || "Tanpa departemen"}` })), [people, listed]);
  const picked = options.find(option => option.label === typed);
  async function act(request: () => Promise<{ data?: { testers: Tester[] }; message: string }>) {
    setBusy(true); onMessage(null);
    try { const result = await request(); if (result.data) setTesters(result.data.testers); setTyped(""); onMessage({ tone: "success", text: result.message }); }
    catch (problem) { onMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(false); }
  }
  return <Card title="Penguji" id={id}>
    <p className={css.note}>Panitia WAM selalu menjadi penguji. Tambahkan orang lain yang ikut mencoba WAM 2026; panitia dan admin Pra WAM tidak otomatis ikut.</p>
    {testers.length ? <ul className={css.rows} aria-label="Daftar penguji">
      {testers.map(tester => <li key={tester.employeeId} className={css.row}>
        <span className={css.rowText}><span>{tester.fullName}</span><span>{tester.department || "Tanpa departemen"}</span></span>
        <ConsoleButton disabled={busy || !migrated} icon={<Trash2 size={16} aria-hidden />} aria-label={`Hapus ${tester.fullName} dari penguji`}
          onClick={() => void act(() => adminRequest<{ testers: Tester[] }>(mainWamAdminApi.tester(tester.employeeId), { method: "DELETE" }))}>Hapus</ConsoleButton>
      </li>)}
    </ul> : <p className={css.note}>Belum ada penguji tambahan.</p>}
    <div className={css.pick}>
      <div className="field">
        <label htmlFor={`${id}-cari`}>Tambah penguji</label>
        <input id={`${id}-cari`} className="input" list={`${id}-orang`} value={typed} placeholder="Ketik nama karyawan" autoComplete="off" disabled={busy || !migrated} onChange={change => setTyped(change.target.value)} />
        <datalist id={`${id}-orang`}>{options.map(option => <option key={option.id} value={option.label} />)}</datalist>
      </div>
      <ConsoleButton variant="primary" icon={<UserPlus size={16} aria-hidden />} disabled={busy || !migrated || !picked}
        onClick={() => picked && void act(() => adminRequest<{ testers: Tester[] }>(mainWamAdminApi.testers, { method: "POST", body: JSON.stringify({ employeeId: picked.id }) }))}>{busy ? "Menyimpan…" : "Tambah"}</ConsoleButton>
    </div>
  </Card>;
}

function ModulesCard({ id, settings, forms, locked, busy, onSave }: { id: string; settings: Settings; forms: FormOption[]; locked: boolean; busy: boolean; onSave: (modules: ModuleSwitches, formSlug: string | null) => void }) {
  const [modules, setModules] = useState(settings.modules);
  const [formSlug, setFormSlug] = useState(settings.moduleConfig.survei.formSlug);
  const changed = JSON.stringify(modules) !== JSON.stringify(settings.modules) || formSlug !== settings.moduleConfig.survei.formSlug;
  return <Card title="Modul" id={id}>
    <p className={css.note}>Modul yang mati tidak meninggalkan jejak di aplikasi: tanpa kartu di Beranda, aksi di sesi, atau aksi lain di aplikasi.</p>
    <ul className={css.rows}>
      {MAIN_WAM_MODULES.map(key => <li key={key} className={css.row}>
        <span className={css.rowText}><span>{moduleInfo[key].label}</span><span>{moduleInfo[key].hint}</span>{moduleInfo[key].note && <span>{moduleInfo[key].note}</span>}{appHidden(key) && <span><em>{APP_HIDDEN_NOTE}</em></span>}</span>
        <label className={css.switch}>
          <input type="checkbox" role="switch" checked={modules[key]} disabled={locked} aria-label={moduleInfo[key].label} onChange={change => setModules({ ...modules, [key]: change.target.checked })} />
          <span className={css.track} aria-hidden />
        </label>
      </li>)}
    </ul>
    {modules.survei && <div className="field">
      <label htmlFor={`${id}-survei`}>Kuesioner survei</label>
      <select id={`${id}-survei`} className="select" value={formSlug ?? ""} disabled={locked} onChange={change => setFormSlug(change.target.value || null)}>
        <option value="">Belum dipilih</option>
        {forms.map(form => <option key={form.slug} value={form.slug}>{form.name} (/wam/{form.slug})</option>)}
      </select>
    </div>}
    <div className={css.actions}>
      <ConsoleButton variant={changed ? "primary" : "secondary"} disabled={locked || !changed} onClick={() => onSave(modules, formSlug)}>{busy ? "Menyimpan…" : "Simpan modul"}</ConsoleButton>
    </div>
  </Card>;
}

/** One KV image into its slot: the server agrees key and size, the browser stores it, the server checks it. */
async function uploadThemeImage(slot: ThemeImageSlot, file: File): Promise<Settings> {
  const mime = file.type as ThemeImageMime;
  if (!(mime in THEME_IMAGE_TYPES)) throw new AdminApiError("Pilih gambar WebP, PNG, atau JPG.");
  if (file.size > THEME_IMAGE_BYTES) throw new AdminApiError("Gambar lebih dari 4 MB. Perkecil dulu, lalu unggah lagi.");
  const agreed = { slot, mime, size: file.size };
  const start = await adminRequest<{ key: string; uploadUrl: string; token: string }>(mainWamAdminApi.themeImageStart, { method: "POST", body: JSON.stringify(agreed) });
  const problem = putProblem(await putFile(start.data!.uploadUrl, file, mime));
  if (problem) throw new AdminApiError(problem);
  const done = await adminRequest<Settings>(mainWamAdminApi.themeImageConfirm, { method: "POST", body: JSON.stringify({ ...agreed, key: start.data!.key, token: start.data!.token }) });
  return done.data!;
}

function ThemeCard({ id, settings, locked, busy, storage, run, onSaved }: {
  id: string; settings: Settings; locked: boolean; busy: string | null; storage: boolean;
  run: (what: string, action: () => Promise<string>) => Promise<void>; onSaved: (settings: Settings) => void;
}) {
  const [colors, setColors] = useState<Record<string, string>>(() => Object.fromEntries(COLOR_FIELDS.map(field => [field.key, settings.theme.colors[field.key] ?? ""])));
  const [font, setFont] = useState(settings.theme.displayFont ?? "");
  const valid = (value: string) => value === "" || /^#[0-9A-Fa-f]{6}$/.test(value);
  const changed = COLOR_FIELDS.some(field => (colors[field.key] || null) !== (settings.theme.colors[field.key] ?? null)) || (font || null) !== settings.theme.displayFont;
  const saveTheme = () => run("tema", async () => {
    const result = await save({ theme: { colors: Object.fromEntries(COLOR_FIELDS.map(field => [field.key, colors[field.key] ? colors[field.key].toUpperCase() : null])), displayFont: font || null } });
    onSaved(result.settings);
    return "Tema WAM 2026 tersimpan.";
  });
  return <Card title="Tema" id={id}>
    <p className={css.note}>Warna acara, huruf judul, dan gambar KV dibaca semua layar WAM 2026. Kosong berarti tema netral. Warna yang kurang terbaca otomatis kembali ke bawaan.</p>
    <div className={css.colors}>
      {COLOR_FIELDS.map(field => {
        const value = colors[field.key];
        return <div key={field.key} className="field">
          <label htmlFor={`${id}-${field.key}`}>{field.label}</label>
          <div className={css.color}>
            <input type="color" aria-label={`${field.label}, pilih warna`} value={valid(value) && value ? value : field.fallback} disabled={locked} onChange={change => setColors({ ...colors, [field.key]: change.target.value.toUpperCase() })} />
            <input id={`${id}-${field.key}`} className="input" value={value} placeholder={field.fallback} disabled={locked} aria-invalid={!valid(value)} onChange={change => setColors({ ...colors, [field.key]: change.target.value.trim() })} />
            <span className={css.swatch} style={{ background: valid(value) && value ? value : field.fallback }}>Aa</span>
          </div>
          {!valid(value) && <p className="field-error">Tulis warna sebagai #RRGGBB, misalnya {field.fallback}.</p>}
        </div>;
      })}
      <div className="field">
        <label htmlFor={`${id}-font`}>Huruf judul</label>
        <select id={`${id}-font`} className="select" value={font} disabled={locked} onChange={change => setFont(change.target.value)}>
          <option value="">Bawaan (Plus Jakarta Sans)</option>
          {DISPLAY_FONTS.map(key => <option key={key} value={key}>{fontLabels[key] ?? key}</option>)}
        </select>
      </div>
    </div>
    <div className={css.actions}>
      <ConsoleButton variant={changed ? "primary" : "secondary"} disabled={locked || !changed || COLOR_FIELDS.some(field => !valid(colors[field.key]))} onClick={() => void saveTheme()}>{busy === "tema" ? "Menyimpan…" : "Simpan tema"}</ConsoleButton>
    </div>
    <h3 className={css.note}>Gambar KV</h3>
    {!storage && <Notice tone="warning">Gambar KV belum bisa diunggah karena penyimpanan berkas belum disiapkan. Hubungi tim CoE.</Notice>}
    <ul className={css.slots}>
      {THEME_IMAGE_SLOTS.map(slot => {
        const image = settings.theme.images[slot];
        return <li key={slot} className={css.slot}>
          <strong>{themeImageLabels[slot]}</strong>
          {/* eslint-disable-next-line @next/next/no-img-element -- a private image served by this site */}
          <span className={css.thumb}>{image ? <img src={mainWamApi.themeImage(slot, image.version)} alt={`Gambar ${themeImageLabels[slot]}`} /> : "Kosong"}</span>
          <span className={css.slotActions}>
            <label className={`${css.file} ${buttonClass("secondary")}`} aria-disabled={locked || !storage}>
              <ImagePlus size={16} aria-hidden />{busy === slot ? "Mengunggah…" : image ? "Ganti" : "Unggah"}
              <input type="file" accept="image/webp,image/png,image/jpeg" disabled={locked || !storage} aria-label={`Unggah gambar ${themeImageLabels[slot]}`}
                onChange={change => { const file = change.target.files?.[0]; change.target.value = ""; if (file) void run(slot, async () => { onSaved(await uploadThemeImage(slot, file)); return `Gambar ${themeImageLabels[slot]} dipakai.`; }); }} />
            </label>
            {image && <ConsoleButton disabled={locked} icon={<Trash2 size={16} aria-hidden />}
              onClick={() => void run(slot, async () => { const result = await adminRequest<Settings>(mainWamAdminApi.themeImage(slot), { method: "DELETE" }); onSaved(result.data!); return result.message; })}>Hapus</ConsoleButton>}
          </span>
        </li>;
      })}
    </ul>
  </Card>;
}
