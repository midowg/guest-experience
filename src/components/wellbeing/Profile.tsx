"use client";

import { useMemo } from "react";
import { Activity, BadgeCheck, CalendarCheck, Camera, FileSpreadsheet, Flame, Gift, LogOut, Sigma } from "lucide-react";
import { useResource, type Resource } from "@/components/app-shell/resource";
import type { WbHome } from "@/lib/wellbeing/app-types";
import { keys, useTheme, useWellbeing } from "./context";
import { formatDate, num } from "./format";
import { Avatar, cx, NavRow, Sk } from "./parts";
import { recordsOf } from "./race";
import { THEME_OPTIONS } from "./Sheets";
import { STRAVA_OPEN, stravaMeta } from "./StravaSheet";
import css from "./wellbeing.module.css";

/*
 * Profil (17 Nov 2026; records 18 Nov 2026; settings list 18 Nov 2026): who I am (from the WAM
 * account), my records (total, best month, longest streak), then a settings list as phones do it:
 * Strava, Tema (its choice on the right, picked in a sheet), Keluar. Activities and points live in
 * the Riwayat tab only.
 */
export function Profile({ home }: { home: Resource<WbHome> }) {
  const { api, me, openTheme, openPhoto, openRewards, openExport, askSignOut } = useWellbeing();
  // Every point that counts, read only for the records here (Riwayat shows the list).
  const ledger = useResource(keys.ledger, () => api.ledger());
  const rewards = useResource(keys.rewards, () => api.rewards()).data;
  const waiting = rewards?.claims.filter(claim => claim.status === "requested" || claim.status === "approved").length ?? 0;
  const [theme] = useTheme();
  const totals = home.data?.totals;
  const person = home.data?.me ?? me;
  const records = useMemo(() => ledger.data?.migrated ? recordsOf(ledger.data.items) : null, [ledger.data]);
  const themeNow = THEME_OPTIONS.find(option => option.value === theme) ?? THEME_OPTIONS[0];

  return <>
    <div className={css.profileHead}>
      {/* Foto profil (18 Nov 2026): a tap on the photo, or its row under Pengaturan. */}
      <button type="button" className={css.avatarEdit} onClick={openPhoto} aria-label={me.photo ? "Ganti foto profil" : "Tambah foto profil"}>
        <Avatar name={person.name} photo={me.photo} size="xl" />
        <span className={css.avatarBadge} aria-hidden="true"><Camera size={16} /></span>
      </button>
      <h2 className={css.headline} style={{ marginTop: 8 }}>{person.name}</h2>
      <p className={css.muted}>{[person.department, person.position].filter(Boolean).join(" · ") || "Karyawan"}</p>
      <p className={cx(css.caption, css.faint)}><BadgeCheck size={14} aria-hidden="true" />Data dari akun WAM</p>
    </div>
    <h2 className={css.groupLabel} style={{ marginTop: 0 }}>Rekor</h2>
    <div className={cx(css.card, css.records)}>
      <div><span><Sigma size={14} aria-hidden="true" />Total poin</span>{totals ? <><b>{num(totals.points)}</b><small>bulan ini {num(totals.monthPoints)}</small></> : <><Sk width={64} height={22} /><Sk width={48} height={10} /></>}</div>
      <div><span><CalendarCheck size={14} aria-hidden="true" />Bulan terbaik</span>{records
        ? records.bestMonth ? <><b>{num(records.bestMonth.points)}</b><small>{formatDate(`${records.bestMonth.month}-15`, { month: "long", year: "numeric" })}</small></> : <><b>–</b><small>belum ada</small></>
        : <><Sk width={64} height={22} /><Sk width={48} height={10} /></>}</div>
      <div><span><Flame size={14} aria-hidden="true" />Streak terlama</span>{records
        ? <><b>{num(records.longestStreak)} hari</b><small>sekarang {num(totals?.streak ?? 0)} hari</small></>
        : <><Sk width={64} height={22} /><Sk width={48} height={10} /></>}</div>
    </div>

    {/* Hadiah (18 Nov 2026): the saldo and my claims, in the same sheet as Beranda's saldo card. */}
    <h2 className={css.groupLabel}>Hadiah</h2>
    <div className={cx(css.card, css.list)}>
      <NavRow lead={<span className={cx(css.lead, css.toneGold)}><Gift size={22} aria-hidden="true" /></span>} title="Hadiah & klaim saya"
        meta={rewards?.migrated ? `Saldo ${num(rewards.saldo.available)} poin${waiting ? ` · ${num(waiting)} klaim diproses` : ""}` : "Tukar poin dengan hadiah"}
        onClick={() => openRewards(waiting ? "klaim" : "hadiah")} />
    </div>

    <h2 className={css.groupLabel}>Pengaturan</h2>
    <div className={cx(css.card, css.list)}>
      <NavRow lead={<Avatar name={person.name} photo={me.photo} size="lg" />} title="Foto profil" meta="Foto, atau kartu tokoh WAM-mu" onClick={openPhoto} />
      {STRAVA_OPEN ? <StravaRow /> : <StravaSoon />}
      <NavRow lead={<span className={cx(css.lead, css.tonePrimary)}><themeNow.icon size={22} aria-hidden="true" /></span>} title="Tema"
        trail={<span className={css.rowValue}>{themeNow.label}</span>} onClick={openTheme} ariaLabel={`Tema: ${themeNow.label}. Ubah`} />
    </div>

    {/* Unduh rekap saya (19 Nov 2026): my own data as Excel, for my own recap; last, just above Keluar (the owner's choice). */}
    <h2 className={css.groupLabel}>Data saya</h2>
    <div className={cx(css.card, css.list)}>
      <NavRow lead={<span className={cx(css.lead, css.toneOk)}><FileSpreadsheet size={22} aria-hidden="true" /></span>} title="Unduh rekap saya"
        meta="Excel: poin, aktivitas, poin dari admin" onClick={openExport} />
    </div>

    <div className={cx(css.card, css.list)} style={{ marginTop: 16 }}>
      <button type="button" className={cx(css.row, css.pressable, css.rowDanger)} onClick={askSignOut}>
        <span className={cx(css.lead, css.toneError)}><LogOut size={22} aria-hidden="true" /></span>
        <span className={css.rowMain}><span className={css.rowTitle}>Keluar</span></span>
      </button>
    </div>
    <p className={cx(css.caption, css.faint, css.center, css.footNote)}>WLM · Werkudara Life Mode</p>
  </>;
}

/** Strava's row once it is open: Belum tersambung, Tersambung · sinkron …, Perlu sambung ulang (18 Nov 2026). */
function StravaRow() {
  const { api, openStrava } = useWellbeing();
  const strava = useResource(keys.strava, () => api.strava());
  return <NavRow lead={<span className={css.stravaMark}><Activity size={20} aria-hidden="true" /></span>} title="Strava" meta={stravaMeta(strava.data)} onClick={openStrava} />;
}

/** Strava while it is closed (18 Nov 2026): a plain row, not a button, with Segera hadir. */
function StravaSoon() {
  return <div className={cx(css.row, css.rowSoon)}>
    <span className={cx(css.stravaMark, css.stravaSoon)}><Activity size={20} aria-hidden="true" /></span>
    <span className={css.rowMain}><span className={css.rowTitle}>Strava</span><span className={css.rowMetaWrap}>Masih dikerjakan</span></span>
    <span className={cx(css.pill, css.pillInfo)}>Segera hadir</span>
  </div>;
}
