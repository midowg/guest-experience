"use client";

import { useId, useState, type ReactNode } from "react";
import { BedDouble, Car, Check, CupSoda, Laptop, Leaf, Lock, Smartphone, Utensils, X, type LucideIcon } from "lucide-react";
import {
  OWN_MODES, calculatorTiles, carbonFigure, groupModeLabel, ownTripValid, tileKg, tripLabel,
  type CarbonInput, type CarbonTravel, type GroupTrip, type OwnMode, type OwnTrip,
} from "@/lib/pra-wam/carbon";
import css from "./carbon.module.css";

const num = (value: number) => new Intl.NumberFormat("id-ID").format(value);
const LIMIT = { bottles: 50, laptopHours: 72, phoneCharges: 20 } as const;
type Extra = keyof typeof LIMIT;

/**
 * The participant's calculator (Pra WAM, 23 Nov 2026): a grid of tiles, each with an icon, its value
 * and the kilograms it makes, and the total on top that grows as they type. What the panitia already
 * know is filled and locked (the group trip, the nights in their room, the meals); what only the
 * person knows is a field (plastic bottles, laptop hours, phone charges). Someone who does not go with
 * the group opens "Berangkat sendiri" on the trip tile. Simpan keeps it; closed, it only shows.
 */
export function CarbonCalculator({ trip, nights, occupants, meals, travel, open, inputFor, onSave }: {
  trip: GroupTrip; nights: number; occupants: number; meals: number;
  travel: CarbonTravel | null; open: boolean;
  /** The figures for an answer (the same function the card uses). */
  inputFor: (travel: CarbonTravel) => CarbonInput | null;
  onSave: (travel: CarbonTravel) => void;
}) {
  const ids = useId();
  const [own, setOwn] = useState<OwnTrip | null>(travel?.own ?? null);
  const [extra, setExtra] = useState<Record<Extra, string>>({
    bottles: travel?.bottles ? String(travel.bottles) : "", laptopHours: travel?.laptopHours ? String(travel.laptopHours) : "", phoneCharges: travel?.phoneCharges ? String(travel.phoneCharges) : "",
  });
  const [tried, setTried] = useState(false);
  const value = (key: Extra) => Math.max(0, Number(extra[key].replace(",", ".")) || 0);
  const tooMuch = (key: Extra) => value(key) > LIMIT[key];
  const ownBad = !!own && !ownTripValid(own);
  const valid = !ownBad && !(["bottles", "laptopHours", "phoneCharges"] as Extra[]).some(tooMuch);
  const draft: CarbonTravel = { own, bottles: value("bottles"), laptopHours: value("laptopHours"), phoneCharges: value("phoneCharges"), answeredAt: new Date().toISOString() };
  const input = inputFor(valid ? draft : { ...draft, own: null });
  const tiles = input ? calculatorTiles(input) : null;
  const total = tiles ? Object.values(tiles).reduce((sum, kg) => sum + kg, 0) : 0;
  const figure = carbonFigure(total);
  const setOwnTrip = (change: Partial<OwnTrip>) => setOwn(current => ({ ...(current ?? { from: "", mode: "mobil", km: 0, roundTrip: true }), ...change }));
  const together = occupants === 2 ? "berdua" : occupants === 3 ? "bertiga" : `${num(occupants)} orang`;

  return <form className={css.calc} noValidate onSubmit={event => { event.preventDefault(); setTried(true); if (valid && open) onSave(draft); }}>
    <div className={css.calcTotal} aria-live="polite">
      <span className={css.calcLeaf}><Leaf aria-hidden /></span>
      <span className={css.calcTotalText}><span>Total perkiraan</span><strong>{figure.value} <small>{figure.unit}</small></strong></span>
    </div>

    <div className={css.calcGrid}>
      <Tile icon={Car} label="Perjalanan" wide={!!own} locked={!own} kg={tiles?.perjalanan ?? 0}
        action={open && <button type="button" className={css.tileLink} onClick={() => setOwn(own ? null : { from: "", mode: "mobil", km: 0, roundTrip: true })}>{own ? <><X aria-hidden />Ikut rombongan</> : "Berangkat sendiri?"}</button>}>
        {own
          ? <div className={css.ownFields}>
            <label className={css.miniField}><span>Dari</span>
              <input value={own.from} placeholder="Contoh: Magelang" aria-invalid={(tried && !own.from.trim()) || undefined} onChange={event => setOwnTrip({ from: event.target.value })} disabled={!open} /></label>
            <div className={css.miniField}><span id={`${ids}-mode`}>Naik</span>
              <span className={css.miniChips} role="radiogroup" aria-labelledby={`${ids}-mode`}>
                {OWN_MODES.map(mode => <button key={mode.key} type="button" role="radio" aria-checked={own.mode === mode.key} disabled={!open} onClick={() => setOwnTrip({ mode: mode.key as OwnMode })}>{mode.label}</button>)}
              </span></div>
            {own.mode !== "lainnya" && <label className={css.miniField}><span>Jarak sekali jalan</span>
              <span className={css.unitField}><input type="number" inputMode="numeric" min={1} value={own.km || ""} placeholder="0" aria-invalid={(tried && !(own.km > 0 && own.km <= 3000)) || undefined} disabled={!open} onChange={event => setOwnTrip({ km: Number(event.target.value) || 0 })} /><b>km</b></span></label>}
            <label className={css.miniCheck}><input type="checkbox" checked={own.roundTrip} disabled={!open} onChange={event => setOwnTrip({ roundTrip: event.target.checked })} />Pulang-pergi</label>
            {tried && ownBad && <em className={css.tileError}>Isi asal dan jarak 1–3.000 km.</em>}
          </div>
          : <><span className={css.tileValue}>{num(trip.km * (trip.roundTrip ? 2 : 1))} <small>km</small></span><span className={css.tileSub}>{tripLabel(trip)} · {groupModeLabel(trip.mode)}</span></>}
      </Tile>

      <Tile icon={BedDouble} label="Kamar" locked kg={tiles?.kamar ?? 0}>
        <span className={css.tileValue}>{num(nights)} <small>malam</small></span><span className={css.tileSub}>{occupants > 1 ? `Sekamar ${together}` : "Sendiri"}</span>
      </Tile>
      <Tile icon={Utensils} label="Makan" locked kg={tiles?.makan ?? 0}>
        <span className={css.tileValue}>{num(meals)} <small>porsi</small></span>
      </Tile>
      <ExtraTile icon={CupSoda} label="Botol plastik" unit="botol" limit={LIMIT.bottles} value={extra.bottles} disabled={!open} kg={tiles?.botol ?? 0} onChange={text => setExtra(current => ({ ...current, bottles: text }))} />
      <ExtraTile icon={Laptop} label="Laptop" unit="jam" limit={LIMIT.laptopHours} value={extra.laptopHours} disabled={!open} kg={tiles?.laptop ?? 0} onChange={text => setExtra(current => ({ ...current, laptopHours: text }))} />
      <ExtraTile icon={Smartphone} label="Isi daya HP" unit="kali" limit={LIMIT.phoneCharges} value={extra.phoneCharges} disabled={!open} kg={tiles?.hp ?? 0} onChange={text => setExtra(current => ({ ...current, phoneCharges: text }))} />
    </div>

    {open ? <button type="submit" className={css.save}><Check aria-hidden />Simpan</button> : <p className={css.otherNote}>Pengisian sudah ditutup.</p>}
  </form>;
}

/** A tile with a field only the participant knows (top-level, so typing keeps the focus). */
function ExtraTile({ icon, label, unit, limit, value, disabled, kg, onChange }: { icon: LucideIcon; label: string; unit: string; limit: number; value: string; disabled: boolean; kg: number; onChange: (text: string) => void }) {
  const over = (Number(value.replace(",", ".")) || 0) > limit;
  return <Tile icon={icon} label={label} kg={kg}>
    <span className={css.unitField}>
      <input type="number" inputMode="decimal" min={0} max={limit} value={value} placeholder="0" aria-label={`${label}, ${unit}`} disabled={disabled} aria-invalid={over || undefined} onChange={event => onChange(event.target.value)} />
      <b>{unit}</b>
    </span>
    {over && <em className={css.tileError}>Maksimal {limit} {unit}</em>}
  </Tile>;
}

function Tile({ icon: Icon, label, kg, locked, wide, action, children }: { icon: LucideIcon; label: string; kg: number; locked?: boolean; wide?: boolean; action?: ReactNode; children: ReactNode }) {
  return <section className={`${css.ctile} ${wide ? css.ctileWide : ""}`} aria-label={label}>
    <span className={css.ctileHead}>
      <span className={css.ctileIcon}><Icon aria-hidden /></span>
      <span className={css.ctileLabel}>{label}</span>
    </span>
    <div className={css.ctileBody}>{children}</div>
    {locked && <span className={css.lockedNote}><Lock aria-hidden />Dari panitia</span>}
    <span className={css.ctileFoot}><span className={css.ctileKg}>{tileKg(kg)}</span>{action}</span>
  </section>;
}
