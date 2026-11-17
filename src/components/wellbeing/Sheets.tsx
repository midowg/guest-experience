"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, Check, CircleX, Dumbbell, ImageOff, LogOut, Moon, NotebookPen, SlidersHorizontal, Smartphone, Sun, X, type LucideIcon } from "lucide-react";
import { Panel } from "@/components/app-shell/Panel";
import { load } from "@/components/app-shell/resource";
import type { WbMyActivity } from "@/lib/wellbeing/app-types";
import { dimensionLabels, wibToday } from "@/lib/wellbeing/rules";
import { keys, useTheme, useWellbeing, type CatatPreset, type ThemeChoice } from "./context";
import { activityTitle, clockLabel, dayLabel, distance, formatDate, num, sourceLabels } from "./format";
import { ActivityLead, cx, Sk } from "./parts";
import css from "./wellbeing.module.css";

/*
 * The smaller sheets (17 Nov 2026): one activity's detail (status, the admin's reason, photos,
 * points, Catat ulang when rejected), Strava (being prepared), and Keluar.
 */

type Fresh = { id: string; item: WbMyActivity | null; failed: boolean };

export function ActivitySheet({ activity, onClose, onRedo }: { activity: WbMyActivity | null; onClose: () => void; onRedo: (preset: CatatPreset) => void }) {
  const { api } = useWellbeing();
  // The list's copy shows at once; the details are asked for again on every opening, and the
  // photos come only from that answer (signed addresses from earlier may have run out).
  const [fresh, setFresh] = useState<Fresh | null>(null);
  const [round, setRound] = useState(0);
  const [viewing, setViewing] = useState<number | null>(null);
  const id = activity?.id ?? null;
  // Closed: forget the answer, so the next opening shows photos only from its own answer.
  if (!activity && (fresh || viewing !== null)) { setFresh(null); setViewing(null); }
  useEffect(() => {
    if (!id) return;
    let live = true;
    void load(keys.activity(id), () => api.activity(id)).then(item => { if (live) setFresh({ id, item: item ?? null, failed: !item }); });
    return () => { live = false; };
  }, [api, id, round]);
  const current = fresh && fresh.id === id ? fresh : null;
  const item = current?.item ?? activity;
  const photos = current?.item?.photos ?? null;
  const today = wibToday();

  return <Panel open={!!activity} onClose={onClose} title="Detail aktivitas" variant="sheet"
    footer={item?.status === "rejected" ? <button type="button" className={cx(css.btn, css.btnTonal, css.block)} onClick={() => onRedo({ code: item.typeCode, kind: item.kind, date: item.date })}>
      <NotebookPen size={20} aria-hidden="true" />Catat ulang</button> : undefined}>
    {item && <>
      <div className={css.sum} style={{ padding: 0 }}>
        <ActivityLead activity={item} size="lg" />
        <div className={css.rowMain}>
          <b className={cx(css.sub, css.wrap)}>{activityTitle(item)}</b>
          <span className={css.rowMeta}>{dayLabel(item.date, today)} · {formatDate(item.date, { day: "numeric", month: "long", year: "numeric" })}{item.time ? ` · pukul ${clockLabel(item.time)}` : ""}</span>
        </div>
      </div>
      {item.status === "rejected" && <p className={cx(css.note, css.noteErr)}><CircleX size={20} aria-hidden="true" /><span><b>Ditolak admin.</b> {item.reason ?? ""} Poin tidak dihitung.</span></p>}
      {item.status === "adjusted" && <p className={cx(css.note, css.noteWarn)}><SlidersHorizontal size={20} aria-hidden="true" /><span><b>Poin diubah admin</b> dari {num(item.pointsClaimed)} jadi {num(item.points)}. {item.reason ?? ""}</span></p>}
      <div className={cx(css.card, css.list, css.detailRows)}>
        <Kv label="Poin" value={item.status === "rejected" ? <span className={css.faint}>0</span> : <span className={css.pts}>+{num(item.points)}</span>} />
        <Kv label="Status" value={item.status === "rejected" ? "Ditolak" : item.status === "adjusted" ? "Diubah admin" : "Dihitung"} />
        <Kv label="Dimensi" value={dimensionLabels[item.dimension]} />
        {item.kind === "sport" && <Kv label="Jenis" value={item.typeName} />}
        {item.kcal != null && <Kv label="Kalori" value={`${num(item.kcal)} kkal`} />}
        {!!item.distanceM && <Kv label="Jarak" value={distance(item.distanceM)} />}
        {!!item.minutes && <Kv label="Durasi" value={`${num(item.minutes)} menit`} />}
        {item.steps != null && <Kv label="Langkah" value={num(item.steps)} />}
        <Kv label="Sumber" value={sourceLabels[item.source]} />
      </div>
      {item.note && <div className={css.field}><span className={css.fieldLabel}>Catatan</span><p>{item.note}</p></div>}
      {(photos ? photos.length > 0 : item.photos.length > 0) && <div className={css.field}>
        <span className={css.fieldLabel}>Foto bukti</span>
        <div className={css.photos}>
          {photos
            ? photos.map((url, index) => <button key={url} type="button" className={css.photoLink} onClick={() => setViewing(index)} aria-label={`Lihat foto bukti ${index + 1}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage addresses, shown as they are */}
                <img src={url} alt={`Foto bukti ${index + 1}`} loading="lazy" />
              </button>)
            : item.photos.map((url, index) => current?.failed
              ? <span key={index} className={css.ph}><ImageOff size={24} aria-hidden="true" /></span>
              : <Sk key={index} height={0} radius={12} style={{ aspectRatio: "1", height: "auto" }} />)}
        </div>
        {current?.failed && <p className={cx(css.caption, css.muted)} style={{ marginTop: 4 }}>Foto belum bisa dimuat. <button type="button" className={css.link} onClick={() => setRound(value => value + 1)}>Coba lagi</button></p>}
      </div>}
      {photos && viewing !== null && photos[viewing] && <PhotoViewer url={photos[viewing]} index={viewing} count={photos.length} onClose={() => setViewing(null)} />}
    </>}
  </Panel>;
}

/** One proof photo over the sheet. It has its own history entry: Back (and Esc) closes it, not the sheet. */
function PhotoViewer({ url, index, count, onClose }: { url: string; index: number; count: number; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const done = useRef(onClose);
  useEffect(() => { done.current = onClose; });
  useEffect(() => {
    window.history.pushState({ ...window.history.state, appViewer: true }, "");
    closeButton.current?.focus();
    const onPop = () => done.current();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const back = () => { if (window.history.state?.appViewer) window.history.back(); else done.current(); };
  return <div className={css.viewer} role="dialog" aria-modal="true" aria-label={`Foto bukti ${index + 1} dari ${count}`}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); back(); } }}>
    <div className={css.viewerBar}>
      <span>{index + 1} dari {count}</span>
      <button ref={closeButton} type="button" className={css.viewerClose} onClick={back} aria-label="Tutup foto"><X size={24} aria-hidden="true" /></button>
    </div>
    {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage address */}
    <img src={url} alt={`Foto bukti ${index + 1}`} className={css.viewerImage} />
  </div>;
}

function Kv({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className={css.row}><span className={css.kv}><span>{label}</span><span>{value}</span></span></div>;
}

export function StravaSheet({ open, onClose, onLogSport }: { open: boolean; onClose: () => void; onLogSport: () => void }) {
  return <Panel open={open} onClose={onClose} title="Strava" variant="sheet"
    footer={<div className={css.btnRow}>
      <button type="button" className={cx(css.btn, css.btnOutline)} onClick={onClose}>Tutup</button>
      <button type="button" className={cx(css.btn, css.btnPrimary)} onClick={onLogSport}><Dumbbell size={20} aria-hidden="true" />Catat olahraga</button>
    </div>}>
    <div className={css.svHero}>
      <span className={cx(css.stravaMark, css.stravaMarkLg)}><Activity size={36} aria-hidden="true" /></span>
      <h3 className={css.headline}>Sambungan Strava sedang disiapkan</h3>
      <p className={css.muted}>Sampai siap, olahraga dicatat lewat Catat → Olahraga.</p>
    </div>
  </Panel>;
}

/** Tema, as a phone's settings do it: three choices, the current one ticked; a tap applies it at once. */
export const THEME_OPTIONS: { value: ThemeChoice; label: string; meta: string; icon: LucideIcon }[] = [
  { value: "system", label: "Otomatis", meta: "Sama dengan pengaturan HP", icon: Smartphone },
  { value: "light", label: "Terang", meta: "Selalu terang", icon: Sun },
  { value: "dark", label: "Gelap", meta: "Selalu gelap, nyaman di malam hari", icon: Moon },
];

export function ThemeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [theme, setTheme] = useTheme();
  return <Panel open={open} onClose={onClose} title="Tema" variant="sheet">
    <div className={cx(css.card, css.list)} role="radiogroup" aria-label="Tema">
      {THEME_OPTIONS.map(option => <button key={option.value} type="button" role="radio" aria-checked={theme === option.value} className={cx(css.row, css.pressable)}
        onClick={() => { setTheme(option.value); onClose(); }}>
        <span className={cx(css.lead, css.tonePrimary)}><option.icon size={22} aria-hidden="true" /></span>
        <span className={css.rowMain}><span className={css.rowTitle}>{option.label}</span><span className={css.rowMeta}>{option.meta}</span></span>
        <span className={css.radioMark} aria-hidden="true">{theme === option.value && <Check size={18} strokeWidth={3} />}</span>
      </button>)}
    </div>
  </Panel>;
}

export function SignOutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { api } = useWellbeing();
  const [busy, setBusy] = useState(false);
  return <Panel open={open} onClose={onClose} locked={busy} title="Keluar dari Wellbeing?" variant="sheet"
    footer={<div className={css.btnRow}>
      <button type="button" className={cx(css.btn, css.btnOutline)} onClick={onClose} disabled={busy}>Batal</button>
      <button type="button" className={cx(css.btn, css.btnPrimary)} aria-busy={busy} onClick={async () => { setBusy(true); try { await api.signOut(); } finally { setBusy(false); } }}>
        {busy ? <span className={css.spin} aria-hidden="true" /> : <LogOut size={20} aria-hidden="true" />}Keluar</button>
    </div>}>
    <p className={css.muted}>Kamu bisa masuk lagi dengan akun WAM yang sama.</p>
  </Panel>;
}
