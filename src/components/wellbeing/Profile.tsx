"use client";

import { useMemo, useState } from "react";
import { Activity, BadgeCheck, CalendarCheck, Flame, History, LogOut, Receipt, Settings2, Sigma } from "lucide-react";
import { useResource, type Resource } from "@/components/app-shell/resource";
import type { WbHome, WbLedgerItem } from "@/lib/wellbeing/app-types";
import { wibToday } from "@/lib/wellbeing/rules";
import { keys, useTheme, useWellbeing, type ThemeChoice } from "./context";
import { dayLabel, formatDate, num, signed } from "./format";
import { dimensionIcons, Icon } from "./icons";
import { Avatar, cx, ErrorState, NavRow, Preparing, Seg, Sk, SkRows, StaleBar } from "./parts";
import { recordsOf } from "./race";
import css from "./wellbeing.module.css";

/*
 * Profil (17 Nov 2026; records 18 Nov 2026): who I am (from the WAM account), my records (total,
 * best month, longest streak), every point that counts for me (Riwayat poin), Strava (being
 * prepared), the theme, and Keluar.
 */

const THEMES = [["system", "Sistem"], ["light", "Terang"], ["dark", "Gelap"]] as const;
const FIRST_LEDGER_ROWS = 15;

export function Profile({ home }: { home: Resource<WbHome> }) {
  const { api, me, go, openStrava, askSignOut } = useWellbeing();
  const ledger = useResource(keys.ledger, () => api.ledger());
  const [theme, setTheme] = useTheme();
  const [showAll, setShowAll] = useState(false);
  const today = wibToday();
  const totals = home.data?.totals;
  const person = home.data?.me ?? me;
  const records = useMemo(() => ledger.data?.migrated ? recordsOf(ledger.data.items) : null, [ledger.data]);

  return <>
    <div className={css.profileHead}>
      <Avatar name={person.name} size="xl" />
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

    <h2 className={css.groupLabel}>Aktivitas</h2>
    <div className={cx(css.card, css.list)}>
      <NavRow lead={<span className={css.stravaMark}><Activity size={20} aria-hidden="true" /></span>} title="Strava" meta="Sambungan sedang disiapkan" onClick={openStrava} />
      <NavRow lead={<span className={cx(css.lead, css.tonePrimary)}><History size={22} aria-hidden="true" /></span>} title="Riwayat aktivitas" onClick={() => go("riwayat")} />
    </div>

    <h2 className={css.groupLabel} id="riwayat-poin">Riwayat poin</h2>
    <StaleBar show={!!ledger.refreshError} onRetry={() => void ledger.reload()} />
    {!ledger.data
      ? ledger.error ? <div className={css.card}><ErrorState message={ledger.error} onRetry={() => void ledger.reload()} /></div> : <SkRows rows={4} />
      : !ledger.data.migrated ? <Preparing />
      : !ledger.data.items.length
        ? <div className={cx(css.card, css.empty)} style={{ padding: "24px 16px" }}>Belum ada poin. Poin muncul di sini setelah kamu mencatat aktivitas.</div>
        : <>
            <ul className={cx(css.card, css.list)} style={{ listStyle: "none", margin: 0, padding: 0 }} aria-labelledby="riwayat-poin">
              {(showAll ? ledger.data.items : ledger.data.items.slice(0, FIRST_LEDGER_ROWS)).map((item, index) => <LedgerRow key={`${item.date}-${index}`} item={item} today={today} />)}
            </ul>
            <div className={css.secHead} style={{ marginTop: 8, marginBottom: 0 }}>
              <span className={cx(css.caption, css.muted)}>Jumlah: <b className={css.tnum}>{num(ledger.data.total)}</b> poin</span>
              {ledger.data.items.length > FIRST_LEDGER_ROWS && <button type="button" className={css.link} onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
                {showAll ? "Tampilkan lebih sedikit" : `Tampilkan semua (${num(ledger.data.items.length)})`}
              </button>}
            </div>
          </>}

    <h2 className={css.groupLabel}>Tampilan</h2>
    <div className={css.card}><div className={css.setting}>
      <p className={css.settingLabel}>Tema</p>
      <Seg<ThemeChoice> label="Tema" value={theme} options={THEMES} onChange={setTheme} />
    </div></div>

    <button type="button" className={cx(css.btn, css.btnTextDanger, css.block)} style={{ marginTop: 20 }} onClick={askSignOut}><LogOut size={20} aria-hidden="true" />Keluar</button>
    <p className={cx(css.caption, css.faint, css.center, css.footNote)}>Wellbeing · Werkudara Group</p>
  </>;
}

function LedgerRow({ item, today }: { item: WbLedgerItem; today: string }) {
  const lead = item.dimension
    ? <span className={css.lead} data-dim={item.dimension}><Icon of={dimensionIcons[item.dimension]} size={22} /></span>
    : <span className={cx(css.lead, item.kind === "admin" ? css.toneWarn : css.tonePrimary)}>{item.kind === "admin" ? <Settings2 size={22} aria-hidden="true" /> : <Receipt size={22} aria-hidden="true" />}</span>;
  return <li className={css.row}>
    {lead}
    <span className={css.rowMain}><span className={css.rowTitle}>{item.title}</span><span className={css.rowMeta}>{item.sub ? `${item.sub} · ` : ""}{dayLabel(item.date, today)}</span></span>
    <b className={cx(css.pts, item.points < 0 && css.ptsNeg)}>{signed(item.points)}</b>
  </li>;
}

