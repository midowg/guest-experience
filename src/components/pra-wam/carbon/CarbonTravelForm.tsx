"use client";

import { useId, useState } from "react";
import { Check, Leaf, Users } from "lucide-react";
import { OWN_MODES, groupModeLabel, ownTripValid, tripLabel, type CarbonTravel, type CarbonView, type GroupTrip, type OwnMode, type OwnTrip } from "@/lib/pra-wam/carbon";
import css from "./carbon.module.css";

/**
 * The participant's own part of Jejak karbon (23 Nov 2026, revised): everyone goes with the group
 * trip the panitia set, so there is nothing to fill. Only someone who travels on their own says so
 * here, in plain fields: dari mana, naik apa, km one way, pulang-pergi. The estimate shows as they
 * type; Simpan keeps it (or goes back to the group).
 */
export function CarbonTravelForm({ trip, value, estimate, onSave }: {
  trip: GroupTrip; value: CarbonTravel | null;
  estimate?: (travel: CarbonTravel | null) => CarbonView;
  onSave: (travel: CarbonTravel | null) => void;
}) {
  const ids = useId();
  const [own, setOwn] = useState(!!value);
  const [trip2, setTrip2] = useState<OwnTrip>(value?.own ?? { from: "", mode: "mobil", km: 0, roundTrip: true });
  const [tried, setTried] = useState(false);
  const set = (change: Partial<OwnTrip>) => setTrip2(current => ({ ...current, ...change }));
  const draft: CarbonTravel | null = own ? { own: trip2, answeredAt: new Date().toISOString() } : null;
  const valid = !own || ownTripValid(trip2);
  const figure = estimate && valid ? estimate(draft) : null;
  const kmBad = own && trip2.mode !== "lainnya" && !(trip2.km > 0 && trip2.km <= 3000);

  return <form className={css.simpleForm} noValidate onSubmit={event => { event.preventDefault(); setTried(true); if (valid) onSave(draft); }}>
    <div className={css.segment} role="radiogroup" aria-label="Cara berangkat">
      <button type="button" role="radio" aria-checked={!own} onClick={() => setOwn(false)}>Ikut rombongan</button>
      <button type="button" role="radio" aria-checked={own} onClick={() => setOwn(true)}>Berangkat sendiri</button>
    </div>

    {!own && <div className={css.groupTrip}>
      <span className={css.groupIcon}><Users aria-hidden /></span>
      <span><strong>{tripLabel(trip)}</strong><span>{groupModeLabel(trip.mode)}{trip.roundTrip ? " · pulang-pergi" : ""}</span></span>
    </div>}

    {own && <>
      <label className={css.tf}>
        <span>Berangkat dari</span>
        <input value={trip2.from} placeholder="Contoh: Magelang" autoComplete="off" aria-invalid={(tried && !trip2.from.trim()) || undefined} aria-describedby={`${ids}-from`} onChange={event => set({ from: event.target.value })} />
        {tried && !trip2.from.trim() && <em id={`${ids}-from`}>Isi kota atau tempat berangkat.</em>}
      </label>

      <div className={css.tf}>
        <span id={`${ids}-mode`}>Naik apa</span>
        <span className={css.modeChips} role="radiogroup" aria-labelledby={`${ids}-mode`}>
          {OWN_MODES.map(mode => <button key={mode.key} type="button" role="radio" aria-checked={trip2.mode === mode.key} onClick={() => set({ mode: mode.key as OwnMode })}>{mode.label}</button>)}
        </span>
      </div>

      {trip2.mode !== "lainnya" && <label className={css.tf}>
        <span>Jarak sekali jalan</span>
        <span className={css.tfUnit}>
          <input type="number" inputMode="numeric" min={1} max={3000} value={trip2.km || ""} placeholder="0" aria-invalid={(tried && kmBad) || undefined} aria-describedby={`${ids}-km`} onChange={event => set({ km: Number(event.target.value) || 0 })} />
          <b>km</b>
        </span>
        {tried && kmBad ? <em id={`${ids}-km`}>Isi jarak 1–3.000 km.</em> : <small id={`${ids}-km`}>Perkiraan saja, misalnya dari Google Maps.</small>}
      </label>}

      <label className={css.switch}>
        <input type="checkbox" checked={trip2.roundTrip} onChange={event => set({ roundTrip: event.target.checked })} />
        <span>Pulang-pergi</span>
      </label>
      {trip2.mode === "lainnya" && <p className={css.otherNote}>Kendaraan lain belum dihitung.</p>}
    </>}

    {figure?.kind === "ada" && <div className={css.live} aria-live="polite"><Leaf aria-hidden /><span>Perkiraanmu</span><strong>{figure.total.value} {figure.total.unit}</strong></div>}
    <button type="submit" className={css.save}><Check aria-hidden />Simpan</button>
  </form>;
}
