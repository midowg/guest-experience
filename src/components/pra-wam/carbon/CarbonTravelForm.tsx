"use client";

import { useState } from "react";
import { Bus, Car, TrainFront } from "lucide-react";
import { OTHER_ROUTE, modeLabel, type CarbonRoute, type CarbonTravel } from "@/lib/pra-wam/carbon";
import css from "./carbon.module.css";

const id = (value: number) => new Intl.NumberFormat("id-ID").format(value);

/**
 * The participant's own part of Jejak karbon (23 Nov 2026): three questions, answered by tapping,
 * never by typing a number. Where they leave from (one of the routes the panitia listed, or
 * "Lainnya"), whether they come back the same way, and whether they ride the shuttle. Distances,
 * people per bus, nights and meals are the panitia's; the room is automatic. Saved as one answer.
 */
export function CarbonTravelForm({ routes, value, onSave }: { routes: CarbonRoute[]; value: CarbonTravel | null; onSave: (travel: CarbonTravel) => void }) {
  const known = value && (value.routeId === OTHER_ROUTE || routes.some(route => route.id === value.routeId)) ? value.routeId : "";
  const [routeId, setRouteId] = useState(known);
  const [roundTrip, setRoundTrip] = useState(value?.roundTrip ?? true);
  const [shuttle, setShuttle] = useState<boolean | null>(value ? value.shuttle : null);
  const pick = (next: string) => {
    setRouteId(next);
    // A train ends at the station, so the shuttle is likely; the panitia's bus comes to the venue.
    if (shuttle === null) setShuttle(routes.find(route => route.id === next)?.mode === "kereta");
  };
  const ready = routeId !== "" && shuttle !== null;

  return <form className={css.form} onSubmit={event => { event.preventDefault(); if (ready) onSave({ routeId, roundTrip, shuttle: !!shuttle, answeredAt: new Date().toISOString() }); }}>
    <fieldset className={css.q}>
      <legend>Berangkat dari mana?</legend>
      {routes.map(route => {
        const Icon = route.mode === "kereta" ? TrainFront : Bus;
        return <label key={route.id} className={css.option}>
          <input type="radio" name="rute" value={route.id} checked={routeId === route.id} onChange={() => pick(route.id)} />
          <span className={css.optionIcon}><Icon aria-hidden /></span>
          <span className={css.optionText}><strong>{route.from}</strong><span>{modeLabel(route.mode)} · {id(route.km)} km</span></span>
          <span className={css.tick} aria-hidden />
        </label>;
      })}
      <label className={css.option}>
        <input type="radio" name="rute" value={OTHER_ROUTE} checked={routeId === OTHER_ROUTE} onChange={() => pick(OTHER_ROUTE)} />
        <span className={css.optionIcon}><Car aria-hidden /></span>
        <span className={css.optionText}><strong>Lainnya</strong><span>Mobil, pesawat, dll.</span></span>
        <span className={css.tick} aria-hidden />
      </label>
    </fieldset>

    <fieldset className={css.q}>
      <legend>Pulang lewat jalan yang sama?</legend>
      <div className={css.pair}>
        <label className={css.option}><input type="radio" name="pp" checked={roundTrip} onChange={() => setRoundTrip(true)} /><span className={css.optionText}><strong>Ya</strong></span></label>
        <label className={css.option}><input type="radio" name="pp" checked={!roundTrip} onChange={() => setRoundTrip(false)} /><span className={css.optionText}><strong>Tidak</strong></span></label>
      </div>
    </fieldset>

    <fieldset className={css.q}>
      <legend>Naik shuttle ke venue?</legend>
      <div className={css.pair}>
        <label className={css.option}><input type="radio" name="shuttle" checked={shuttle === true} onChange={() => setShuttle(true)} /><span className={css.optionText}><strong>Ya</strong></span></label>
        <label className={css.option}><input type="radio" name="shuttle" checked={shuttle === false} onChange={() => setShuttle(false)} /><span className={css.optionText}><strong>Tidak</strong></span></label>
      </div>
    </fieldset>

    <button type="submit" className={css.save} disabled={!ready}>Simpan</button>
  </form>;
}
