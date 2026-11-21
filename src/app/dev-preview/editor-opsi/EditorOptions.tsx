"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, Check, ChevronDown, ChevronRight, Clock, ExternalLink, Eye, Globe, MessageSquareText, X, Image as ImageIcon, MapPin, Monitor, Phone, Smartphone, Sparkles, Tablet, Users } from "lucide-react";
import css from "./editor-options.module.css";

/*
 * Three directions for the event editor (21 Nov 2026), before it is rebuilt to docs/standar-admin.md.
 * The preview is the real guest page (/dev-preview/welcome), at the device's true size, scaled to fit.
 * Sample data only; nothing saves.
 */

type Section = { key: string; label: string; icon: typeof Users; done: boolean; hint: string };
const sections: Section[] = [
  { key: "info", label: "Info kunjungan", icon: Sparkles, done: true, hint: "Judul, tanggal, foto sampul" },
  { key: "tamu", label: "Tamu", icon: Users, done: true, hint: "Nama tamu dan perusahaan" },
  { key: "rundown", label: "Rundown", icon: Clock, done: false, hint: "Susunan acara hari itu" },
  { key: "lokasi", label: "Cara datang", icon: MapPin, done: true, hint: "Alamat, peta, rute foto" },
  { key: "kontak", label: "Pendamping", icon: Phone, done: false, hint: "Nama dan WhatsApp PIC" },
  { key: "foto", label: "Foto kunjungan", icon: ImageIcon, done: true, hint: "Galeri setelah acara" },
];
type Device = "hp" | "tablet" | "desktop";
const devices: Record<Device, { w: number; h: number; label: string; Icon: typeof Smartphone }> = {
  hp: { w: 390, h: 844, label: "HP", Icon: Smartphone }, tablet: { w: 820, h: 1180, label: "Tablet", Icon: Tablet }, desktop: { w: 1440, h: 900, label: "Desktop", Icon: Monitor },
};

/** The real guest page at the device's own size, scaled down to fit its box. */
function Preview({ device, fill = false }: { device: Device; fill?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(.5);
  const size = devices[device];
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const fit = () => setScale(Math.min(element.clientWidth / size.w, (fill ? element.clientHeight : Infinity) / size.h, 1));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [size.w, size.h, fill]);
  return <div ref={box} className={css.previewBox} data-fill={fill || undefined}>
    <div className={css.device} data-device={device} style={{ width: size.w * scale, height: size.h * scale } as CSSProperties}>
      <iframe src="/dev-preview/welcome" title="Pratinjau halaman tamu" style={{ width: size.w, height: size.h, transform: `scale(${scale})` }} />
    </div>
  </div>;
}

function DeviceSwitch({ device, onChange }: { device: Device; onChange: (device: Device) => void }) {
  return <div className={css.segment} role="group" aria-label="Ukuran pratinjau">{(Object.keys(devices) as Device[]).map(key => {
    const { Icon, label } = devices[key];
    return <button key={key} type="button" aria-pressed={device === key} onClick={() => onChange(key)}><Icon size={15} aria-hidden="true" /> {label}</button>;
  })}</div>;
}

/** The form of one section, with labels you can see, examples, and a short hint. */
function Form({ section }: { section: Section }) {
  if (section.key !== "info") return <div className={css.formCard}>
    <h2 className={css.formTitle}><section.icon size={18} aria-hidden="true" /> {section.label}</h2>
    <p className={css.muted}>{section.hint}. (Contoh: isian bagian ini tampil di sini.)</p>
    <label className={css.field}><span>Judul bagian</span><input defaultValue={section.label} /></label>
    {!section.done && <p className={css.need}>Perlu diisi sebelum terbit</p>}
  </div>;
  return <div className={css.formCard}>
    <h2 className={css.formTitle}><Sparkles size={18} aria-hidden="true" /> Info kunjungan</h2>
    <label className={css.field}><span>Judul kunjungan</span><input defaultValue="Kunjungan PT Contoh Nusantara" /><small>Tampil besar di atas foto sampul.</small></label>
    <div className={css.two}>
      <label className={css.field}><span>Tanggal</span><input type="date" defaultValue="2026-11-12" /></label>
      <label className={css.field}><span>Jam mulai</span><input type="time" defaultValue="10:00" /></label>
    </div>
    <div className={css.field}><span>Foto sampul</span>
      <div className={css.upload}><img src="/panduan-ke-werkudara/assets/exterior-768.webp" alt="" /><div><strong>Tampak depan kantor</strong><small>Ketuk untuk ganti · geser untuk atur titik fokus</small></div></div>
    </div>
    <details className={css.advanced}><summary>Pengaturan lanjutan <ChevronDown size={16} aria-hidden="true" /></summary>
      <label className={css.field}><span>Nama tamu di tautan</span><input defaultValue="pt-contoh-nusantara" /><small>journey.werkudara.group/welcome/pt-contoh-nusantara</small></label>
    </details>
  </div>;
}

function SectionList({ current, onPick, compact = false }: { current: string; onPick: (key: string) => void; compact?: boolean }) {
  return <ul className={css.sections} data-compact={compact || undefined}>{sections.map(section => <li key={section.key}>
    <button type="button" aria-current={current === section.key || undefined} onClick={() => onPick(section.key)}>
      <section.icon size={17} aria-hidden="true" />
      <span><strong>{section.label}</strong>{!compact && <small>{section.hint}</small>}</span>
      {section.done ? <Check size={16} className={css.done} aria-label="Lengkap" /> : <i className={css.todo} aria-label="Perlu diisi" />}
    </button>
  </li>)}</ul>;
}

/** The page head and the bar above the editor, the same in every option. */
function Chrome({ children }: { children: ReactNode }) {
  return <>
    <header className={css.head}>
      <a href="#" className={css.back}><ArrowLeft size={16} aria-hidden="true" /> Beranda</a>
      <div className={css.headMain}>
        <span className={css.photo}><img src="/panduan-ke-werkudara/assets/exterior-768.webp" alt="" /></span>
        <div className={css.headText}><h1>Kunjungan PT Contoh Nusantara</h1><p><span>Welcome</span><span className={css.pill}>Draf</span><span>Kamis, 12 November 2026</span></p></div>
        <a href="#" className={css.open}><ArrowUpRight size={16} aria-hidden="true" /> Buka halaman tamu</a>
      </div>
      <nav className={css.tabs}><a aria-current="page">Isi halaman</a><a>Tamu &amp; konfirmasi</a><a>BEO</a><a>Foto</a><a>Survei</a></nav>
    </header>
    <div className={css.bar}>
      <span className={css.saved}><Check size={15} aria-hidden="true" /> Tersimpan 10.42</span>
      <span className={css.barRight}><span className={css.missing}>2 bagian perlu diisi</span><button type="button" className={css.publish}>Terbitkan</button></span>
    </div>
    {children}
  </>;
}

/** A: three columns. Sections · form · phone preview. */
function ThreeColumns() {
  const [current, setCurrent] = useState("info");
  const [device, setDevice] = useState<Device>("hp");
  const section = sections.find(item => item.key === current)!;
  return <div className={css.three}>
    <aside className={css.left}><SectionList current={current} onPick={setCurrent} /></aside>
    <div className={css.center}><Form section={section} /></div>
    <aside className={css.right}><div className={css.previewHead}><DeviceSwitch device={device} onChange={setDevice} /><a href="/dev-preview/welcome" target="_blank" className={css.iconLink} aria-label="Buka pratinjau di tab baru"><ExternalLink size={16} /></a></div><Preview device={device} fill /></aside>
  </div>;
}

/** B: preview first. The form folds into one narrow panel; the preview takes the rest, any device. */
function PreviewFirst() {
  const [current, setCurrent] = useState("info");
  const [device, setDevice] = useState<Device>("desktop");
  return <div className={css.two_}>
    <aside className={css.panel}>{sections.map(section => <div key={section.key} className={css.accordion} data-open={current === section.key || undefined}>
      <button type="button" className={css.accHead} onClick={() => setCurrent(current === section.key ? "" : section.key)} aria-expanded={current === section.key}>
        <section.icon size={17} aria-hidden="true" /><strong>{section.label}</strong>{section.done ? <Check size={16} className={css.done} /> : <i className={css.todo} />}<ChevronDown size={16} className={css.chev} aria-hidden="true" />
      </button>
      {current === section.key && <div className={css.accBody}><Form section={section} /></div>}
    </div>)}</aside>
    <div className={css.canvas}><div className={css.previewHead}><DeviceSwitch device={device} onChange={setDevice} /><a href="/dev-preview/welcome" target="_blank" className={css.iconLink} aria-label="Buka pratinjau di tab baru"><ExternalLink size={16} /></a></div><Preview device={device} fill /></div>
  </div>;
}

/** C: like a theme editor. Sections on the left, the page in the middle, the picked section's settings on the right. */
function ThemeEditor() {
  const [current, setCurrent] = useState("info");
  const [device, setDevice] = useState<Device>("hp");
  const section = sections.find(item => item.key === current)!;
  return <div className={css.theme}>
    <aside className={css.left}><p className={css.leftTitle}>Bagian halaman</p><SectionList current={current} onPick={setCurrent} compact /></aside>
    <div className={css.canvas}><div className={css.previewHead}><DeviceSwitch device={device} onChange={setDevice} /><a href="/dev-preview/welcome" target="_blank" className={css.iconLink} aria-label="Buka pratinjau di tab baru"><ExternalLink size={16} /></a></div><Preview device={device} fill /></div>
    <aside className={css.settings}><Form section={section} /></aside>
  </div>;
}

/**
 * D: the CMS way with a big preview. A clear side menu, grouped; a menu item opens its content inside
 * the menu; the real page fills the rest. On a phone: the menu as a list, an item opens as a full
 * sheet with "Lihat pratinjau", and Pratinjau shows the page big.
 */
const menu: { group: string; items: Section[] }[] = [
  { group: "Isi halaman", items: [sections[0], { key: "sambutan", label: "Sambutan", icon: MessageSquareText, done: true, hint: "Kalimat pembuka untuk tamu" }, sections[2], sections[3], sections[4]] },
  { group: "Tamu", items: [sections[1]] },
  { group: "Setelah acara", items: [sections[5]] },
  { group: "Pengaturan", items: [{ key: "tautan", label: "Tautan & bahasa", icon: Globe, done: true, hint: "Alamat halaman, Indonesia/English" }] },
];
function SideMenu({ onMobilePreview }: { onMobilePreview: () => void }) {
  const [current, setCurrent] = useState("info");
  const [sheet, setSheet] = useState<Section | null>(null);
  const [device, setDevice] = useState<Device>("hp");
  return <div className={css.cms}>
    <aside className={css.cmsMenu} aria-label="Menu halaman">
      {menu.map(group => <div key={group.group} className={css.cmsGroup}>
        <p className={css.cmsGroupTitle}>{group.group}</p>
        {group.items.map(section => {
          const open = current === section.key;
          return <div key={section.key} className={css.cmsItem} data-open={open || undefined}>
            <button type="button" className={css.cmsHead} aria-expanded={open} onClick={() => { setCurrent(open ? "" : section.key); setSheet(section); }}>
              <span className={css.cmsIcon}><section.icon size={18} aria-hidden="true" /></span>
              <span className={css.cmsText}><strong>{section.label}</strong><small>{section.done ? section.hint : "Perlu diisi"}</small></span>
              {section.done ? <Check size={16} className={css.done} aria-label="Lengkap" /> : <i className={css.todo} aria-label="Perlu diisi" />}
              <ChevronDown size={16} className={css.cmsChev} aria-hidden="true" /><ChevronRight size={18} className={css.cmsArrow} aria-hidden="true" />
            </button>
            {open && <div className={css.cmsBody}><Form section={section} /></div>}
          </div>;
        })}
      </div>)}
    </aside>
    <div className={css.cmsCanvas}>
      <div className={css.previewHead}><DeviceSwitch device={device} onChange={setDevice} /><a href="/dev-preview/welcome" target="_blank" className={css.iconLink} aria-label="Buka pratinjau di tab baru"><ExternalLink size={16} /></a></div>
      <Preview device={device} fill />
    </div>
    {/* A phone: the picked item as a full sheet over the menu. */}
    {sheet && <div className={css.sheet} role="dialog" aria-modal="true" aria-label={sheet.label}>
      <header className={css.sheetHead}><button type="button" className={css.iconLink} onClick={() => setSheet(null)} aria-label="Tutup"><X size={18} /></button><strong>{sheet.label}</strong><span /></header>
      <div className={css.sheetBody}><Form section={sheet} /></div>
      <footer className={css.sheetFoot}><button type="button" className={css.ghost} onClick={() => { setSheet(null); onMobilePreview(); }}><Eye size={16} aria-hidden="true" /> Lihat pratinjau</button><button type="button" className={css.publish} onClick={() => setSheet(null)}>Selesai</button></footer>
    </div>}
  </div>;
}

type Option = "a" | "b" | "c" | "d";
const labels: Record<Option, string> = { d: "D · Menu samping + pratinjau besar", a: "A · Tiga kolom", b: "B · Pratinjau besar", c: "C · Editor tema" };

export function EditorOptions({ initial }: { initial: Option }) {
  const [option, setOption] = useState<Option>(initial);
  const [mobileTab, setMobileTab] = useState<"isi" | "pratinjau">("isi");
  return <div className={css.page} data-mobile-tab={mobileTab} data-option={option}>
    <div className={css.switcher} role="group" aria-label="Opsi editor">
      {(Object.keys(labels) as Option[]).map(key => <button key={key} type="button" aria-pressed={option === key} onClick={() => setOption(key)}>{labels[key]}</button>)}
    </div>
    <main className={css.main}>
      <Chrome>
        {/* On a phone every option becomes the same: Isi and Pratinjau as two tabs. */}
        <div className={css.mobileTabs} role="tablist" aria-label="Editor di HP">
          <button type="button" role="tab" aria-selected={mobileTab === "isi"} onClick={() => setMobileTab("isi")}>Isi</button>
          <button type="button" role="tab" aria-selected={mobileTab === "pratinjau"} onClick={() => setMobileTab("pratinjau")}>Pratinjau</button>
        </div>
        <div key={option}>{option === "d" ? <SideMenu onMobilePreview={() => setMobileTab("pratinjau")} /> : option === "a" ? <ThreeColumns /> : option === "b" ? <PreviewFirst /> : <ThemeEditor />}</div>
      </Chrome>
    </main>
  </div>;
}
