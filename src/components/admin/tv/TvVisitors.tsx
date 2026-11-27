"use client";

import { useState } from "react";
import { Laptop, Smartphone, Tablet, Tv } from "lucide-react";
import { FilterChips, Pill, SectionToolbar } from "@/components/console";
import akun from "@/components/admin/wam/akun/akun.module.css";
import { clockLabel, wibTime } from "@/lib/pra-wam/appraisal";
import { agoLabel } from "@/lib/pra-wam/tv";
import { kindsLabel, tvVisitVersionLabels, visitIsOn, visitSummary, TV_VISIT_DAYS, type TvDeviceKind, type TvVisit } from "@/lib/pra-wam/tv-visits";
import css from "@/components/admin/wam/tv-admin.module.css";

const icons: Record<TvDeviceKind, typeof Tv> = { tv: Tv, hp: Smartphone, tablet: Tablet, komputer: Laptop };
const dayName = new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" });
const dayFull = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

/**
 * Admin TV → Pantauan, "Siapa yang membuka": the devices that opened a TV address, in words anyone
 * reads at a glance. One line per device and address: what it is (TV Samsung, HP Android), which
 * address and which version of the board it got, its screen, and when; then how many came each
 * day of the last week. It is the device that is known, never the person: the addresses have no
 * sign-in. `screens` are the TVs with a name, to say which devices share a network with one.
 */
export function TvVisitors({ visits, ready, today, now, migration }: { visits: readonly TvVisit[]; ready: boolean; today: string; now: number; migration: string }) {
  const [shown, setShown] = useState<"hari" | "minggu">("hari");
  const summary = visitSummary(visits, today, now);
  const rows = shown === "hari" ? visits.filter(visit => visit.day === today) : visits;
  // A network a TV is on is the office's: a phone or a computer on the same one is in the office too.
  const office = new Set(visits.filter(visit => visit.kind === "tv").map(visit => visit.net));
  const most = Math.max(1, ...summary.days.map(day => day.devices));

  return <section className={akun.section} aria-labelledby="tv-pembuka">
    <SectionToolbar title={<span id="tv-pembuka">Siapa yang membuka</span>} count={ready ? `${summary.today} perangkat hari ini` : undefined} />
    {!ready ? <p className={akun.hint}>Pencatatan pembuka alamat TV menunggu migrasi {migration}. Setelah dijalankan, perangkat yang membuka /tv dan /tv/lite muncul di sini.</p> : <>
      <p className={akun.lead}>Perangkat yang membuka alamat TV, termasuk alamat umum /tv dan /tv/lite. Yang dikenali perangkatnya, bukan orangnya, karena alamat TV dibuka tanpa login.</p>

      <div className={css.week} role="img" aria-label={`Perangkat per hari, ${TV_VISIT_DAYS} hari terakhir: ${summary.days.map(day => `${dayFull.format(asDate(day.day))} ${day.devices}`).join(", ")}`}>
        {summary.days.map(day => <div key={day.day} className={css.weekDay} data-today={day.day === today || undefined}>
          <span className={css.weekCount}>{day.devices}</span>
          <span className={css.weekBar}><i style={{ height: `${Math.round((day.devices / most) * 100)}%` }} /></span>
          <span className={css.weekName}>{day.day === today ? "Hari ini" : dayName.format(asDate(day.day))}</span>
        </div>)}
      </div>

      <FilterChips label="Rentang waktu" value={shown} onChange={setShown} chips={[
        { value: "hari", label: "Hari ini", count: visits.filter(visit => visit.day === today).length },
        { value: "minggu", label: `${TV_VISIT_DAYS} hari terakhir`, count: visits.length },
      ]} />
      {rows.length === 0 ? <p className={akun.empty}>{shown === "hari" ? "Belum ada yang membuka alamat TV hari ini." : `Belum ada yang membuka alamat TV dalam ${TV_VISIT_DAYS} hari terakhir.`}</p>
        : <ul className={css.visits} aria-label="Perangkat yang membuka alamat TV">{rows.map(visit => {
          const Icon = icons[visit.kind];
          const on = visit.day === today && visitIsOn(visit, now);
          const screen = visit.width && visit.height ? `layar ${visit.width}×${visit.height}` : "";
          const place = visit.kind === "tv" ? "" : office.has(visit.net) ? "satu jaringan dengan TV kantor" : office.size ? "jaringan lain" : "";
          const when = visit.day === today
            ? `sejak ${clockLabel(wibTime(visit.firstSeenAt))}${on ? "" : `, terakhir ${agoLabel(visit.lastSeenAt, now)}`}`
            : `${dayFull.format(asDate(visit.day))}, ${clockLabel(wibTime(visit.firstSeenAt))}–${clockLabel(wibTime(visit.lastSeenAt))}`;
          return <li key={visit.id} className={css.visit}>
            <span className={css.visitIcon} aria-hidden="true"><Icon size={20} /></span>
            <div className={css.visitText}>
              <strong>{visit.name}</strong>
              <span>Membuka <code>{visit.address}</code> · {tvVisitVersionLabels[visit.version]}{screen ? ` · ${screen}` : ""}{place ? ` · ${place}` : ""}</span>
              <span>{when}</span>
            </div>
            {on ? <Pill tone="ok">Membuka</Pill> : <Pill tone="neutral">{visit.day === today ? "Sudah tutup" : "Hari lain"}</Pill>}
          </li>;
        })}</ul>}
      <p className={akun.hint}>Satu perangkat tercatat sekali per alamat per hari. Alamat jaringannya tidak disimpan. Catatan lebih dari 30 hari dihapus sendiri.</p>
    </>}
  </section>;
}

/** The two numbers for Pantauan's first row, as words for the cards' notes. */
export function visitorCards(visits: readonly TvVisit[], today: string, now: number) {
  const summary = visitSummary(visits, today, now);
  return { today: summary.today, kinds: kindsLabel(summary.byKind) || "Belum ada hari ini", now: summary.now, lite: summary.lite };
}
