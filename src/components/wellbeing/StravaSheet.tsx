"use client";

import { useState } from "react";
import { Activity, CircleAlert, Dumbbell, Link2Off, RefreshCw, ShieldCheck, Trophy, Zap } from "lucide-react";
import { Panel } from "@/components/app-shell/Panel";
import { revalidate, setResource, useResource } from "@/components/app-shell/resource";
import { useToast } from "@/components/app-shell/Toast";
import type { WbStrava } from "@/lib/wellbeing/app-types";
import { errorText } from "./api";
import { keys, useWellbeing } from "./context";
import { sinceLabel } from "./format";
import { cx, ErrorState, Sk } from "./parts";
import css from "./wellbeing.module.css";

/*
 * Strava (18 Nov 2026, docs/rancangan-wellbeing.md "Strava"): connect once with one's own Strava
 * account; new activities come in by themselves (Strava's webhook), points = calories. Before
 * connecting the sheet says what is shared (the person agrees that their points count on the board,
 * where only totals show). Connected: the account, the last sync, Sinkronkan sekarang, Putuskan.
 * Refused by Strava: Sambungkan ulang. Strava's brand rules: its orange, "Powered by Strava".
 */

/**
 * Strava is closed to employees for now (18 Nov 2026): Profil shows it as Segera hadir (no sheet,
 * no call to the server), Catat and Riwayat say it is coming. The server side stays built; set this
 * to true once the Strava app and its keys are ready.
 */
export const STRAVA_OPEN = false;

/** What Profil says after coming back from Strava (?strava=…). */
export const STRAVA_RESULTS: Record<string, { message: string; tone: "ok" | "info" | "bad" }> = {
  tersambung: { message: "Strava tersambung. Aktivitas bulan ini sedang dimasukkan.", tone: "ok" },
  batal: { message: "Sambungan Strava dibatalkan.", tone: "info" },
  izin: { message: "Centang izin melihat aktivitas di halaman Strava, lalu sambungkan lagi.", tone: "bad" },
  dipakai: { message: "Akun Strava ini sudah tersambung ke karyawan lain.", tone: "bad" },
  kedaluwarsa: { message: "Tautan sambung Strava kedaluwarsa. Coba sambungkan lagi.", tone: "bad" },
  "belum-siap": { message: "Sambungan Strava belum disiapkan admin.", tone: "bad" },
  gagal: { message: "Strava belum bisa disambungkan. Coba lagi sebentar.", tone: "bad" },
};

/** Profil's line under "Strava". */
export function stravaMeta(strava: WbStrava | undefined): string {
  if (!strava) return "Memuat…";
  if (!strava.ready) return "Sambungan sedang disiapkan";
  if (!strava.connected) return "Belum tersambung";
  if (strava.status === "reconnect") return "Perlu sambung ulang";
  return `Tersambung · sinkron ${sinceLabel(strava.lastSyncAt)}`;
}

const Kv = ({ label, value }: { label: string; value: string }) => <div className={css.row}><span className={css.kv}><span>{label}</span><span>{value}</span></span></div>;

export function StravaSheet({ open, onClose, onLogSport }: { open: boolean; onClose: () => void; onLogSport: () => void }) {
  const { api } = useWellbeing();
  const toast = useToast();
  const status = useResource(keys.strava, () => api.strava());
  const [busy, setBusy] = useState<"sync" | "off" | "connect" | null>(null);
  const [askOff, setAskOff] = useState(false);
  if (!open && askOff) setAskOff(false);
  const data = status.data;

  function connect() {
    setBusy("connect");
    api.stravaConnect();
    // The real app leaves for Strava's page here; the preview connects at once.
    revalidate(keys.strava);
    setTimeout(() => setBusy(null), 1500);
  }
  async function sync() {
    setBusy("sync");
    try {
      const result = await api.stravaSync();
      toast({ message: result.added ? `${result.added} aktivitas baru dari Strava.` : "Sudah terbaru. Tidak ada aktivitas baru.", tone: "ok" });
      revalidate(keys.all);
    } catch (error) {
      toast({ message: errorText(error), tone: "bad" });
      revalidate(keys.strava);
    } finally { setBusy(null); }
  }
  async function disconnect() {
    setBusy("off");
    try {
      const next = await api.stravaDisconnect();
      setResource<WbStrava>(keys.strava, () => next);
      setAskOff(false);
      toast({ message: "Strava diputus. Aktivitas yang sudah masuk tetap dihitung.", tone: "ok" });
    } catch (error) { toast({ message: errorText(error), tone: "bad" }); }
    finally { setBusy(null); }
  }

  const connectButton = (label: string) => <button type="button" className={cx(css.btn, css.btnStrava)} aria-busy={busy === "connect"} disabled={!!busy} onClick={connect}>
    {busy === "connect" ? <span className={css.spin} aria-hidden="true" /> : <Activity size={20} aria-hidden="true" />}{label}</button>;

  // Connected: its buttons wait only for their own work (a "Sambungkan" a moment ago does not block them).
  const working = busy === "sync" || busy === "off";
  const footer = !data ? undefined
    : !data.ready ? <div className={css.btnRow}>
        <button type="button" className={cx(css.btn, css.btnOutline)} onClick={onClose}>Tutup</button>
        <button type="button" className={cx(css.btn, css.btnPrimary)} onClick={onLogSport}><Dumbbell size={20} aria-hidden="true" />Catat olahraga</button>
      </div>
    : !data.connected ? <div className={css.btnRow}>
        <button type="button" className={cx(css.btn, css.btnOutline)} onClick={onClose} disabled={!!busy}>Nanti</button>
        {connectButton("Sambungkan Strava")}
      </div>
    : data.status === "reconnect" ? <div className={css.btnRow}>
        <button type="button" className={cx(css.btn, css.btnOutline)} onClick={() => setAskOff(true)} disabled={!!busy}>Putuskan</button>
        {connectButton("Sambungkan ulang")}
      </div>
    : askOff ? <div className={css.btnRow}>
        <button type="button" className={cx(css.btn, css.btnOutline)} onClick={() => setAskOff(false)} disabled={working}>Batal</button>
        <button type="button" className={cx(css.btn, css.btnDanger)} aria-busy={busy === "off"} disabled={working} onClick={() => void disconnect()}>
          {busy === "off" ? <span className={css.spin} aria-hidden="true" /> : <Link2Off size={20} aria-hidden="true" />}Putuskan</button>
      </div>
    : <div className={css.btnRow}>
        <button type="button" className={cx(css.btn, css.btnOutline)} onClick={() => setAskOff(true)} disabled={working}>Putuskan</button>
        <button type="button" className={cx(css.btn, css.btnPrimary)} aria-busy={busy === "sync"} disabled={working} onClick={() => void sync()}>
          {busy === "sync" ? <span className={css.spin} aria-hidden="true" /> : <RefreshCw size={20} aria-hidden="true" />}Sinkronkan sekarang</button>
      </div>;

  return <Panel open={open} onClose={onClose} locked={busy === "sync" || busy === "off"} title="Strava" variant="sheet" footer={footer}>
    {status.error && !data ? <ErrorState message={status.error} onRetry={() => void status.reload()} />
      : !data ? <div className={css.svHero}><Sk width={72} height={72} radius={20} /><Sk width={200} height={20} /><Sk width={260} height={14} /></div>
      : !data.ready ? <div className={css.svHero}>
          <span className={cx(css.stravaMark, css.stravaMarkLg)}><Activity size={36} aria-hidden="true" /></span>
          <h3 className={css.headline}>Sambungan Strava sedang disiapkan</h3>
          <p className={css.muted}>Sampai siap, olahraga dicatat lewat Catat → Olahraga.</p>
        </div>
      : !data.connected ? <>
          <div className={css.svHero}>
            <span className={cx(css.stravaMark, css.stravaMarkLg)}><Activity size={36} aria-hidden="true" /></span>
            <h3 className={css.headline}>Sambungkan Strava</h3>
            <p className={css.muted}>Olahraga yang kamu rekam di Strava masuk ke WLM sendiri, tanpa foto bukti.</p>
          </div>
          <ul className={css.stravaPoints}>
            <li><Zap size={20} aria-hidden="true" /><span><b>Otomatis.</b> Aktivitas baru masuk beberapa saat setelah tersimpan di Strava, mulai dari awal bulan ini. Poin = kalori.</span></li>
            <li><Trophy size={20} aria-hidden="true" /><span><b>Ikut balapan.</b> Poinnya dihitung di Peringkat. Yang tampil ke rekan hanya total poin, bukan aktivitas Strava-mu.</span></li>
            <li><ShieldCheck size={20} aria-hidden="true" /><span><b>Kamu yang pegang.</b> Bisa diputus kapan saja di sini atau di pengaturan Strava. Aktivitas yang sudah masuk tetap dihitung.</span></li>
          </ul>
          <p className={cx(css.caption, css.faint)}>Dengan menyambung, kamu setuju poin dari aktivitas Strava-mu ikut dihitung di Peringkat WLM. Di halaman Strava, biarkan izin melihat aktivitas tercentang.</p>
        </>
      : <>
          {data.status === "reconnect" && <div className={cx(css.note, css.noteErr)} role="alert"><CircleAlert size={20} aria-hidden="true" />
            <span><b>Sambungan terputus.</b> Strava menolak sambungan ini (izin dicabut atau kedaluwarsa). Sambungkan ulang supaya aktivitas baru masuk lagi.</span></div>}
          {askOff && <div className={cx(css.note, css.noteWarn)} role="alert"><CircleAlert size={20} aria-hidden="true" />
            <span><b>Putuskan Strava?</b> Aktivitas baru tidak masuk lagi. Yang sudah masuk tetap dihitung.</span></div>}
          <div className={cx(css.card, css.list, css.detailRows)}>
            <Kv label="Akun Strava" value={data.athleteName || "Tersambung"} />
            <Kv label="Sinkron terakhir" value={sinceLabel(data.lastSyncAt)} />
            <Kv label="Aktivitas pribadi" value={data.private ? "Ikut dihitung" : "Tidak dihitung"} />
          </div>
          {data.lastError && data.status === "ok" && <p className={cx(css.caption, css.muted)} style={{ marginTop: 8 }}>{data.lastError}</p>}
          <p className={cx(css.caption, css.faint)} style={{ marginTop: 8 }}>Aktivitas baru masuk sendiri. Sinkronkan sekarang kalau ada yang belum muncul.</p>
        </>}
    {data?.ready && <p className={css.stravaPowered}>Powered by <b>Strava</b></p>}
  </Panel>;
}
