"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowLeftRight, ArrowRight, Bus, Car, Check, ChevronRight, Footprints, Leaf, TrainFront, type LucideIcon } from "lucide-react";
import { OTHER_ROUTE, modeLabel, type CarbonRoute, type CarbonTravel, type CarbonView } from "@/lib/pra-wam/carbon";
import css from "./carbon.module.css";

const id = (value: number) => new Intl.NumberFormat("id-ID").format(value);
type Step = 0 | 1 | 2 | 3;

/**
 * The participant's own part of Jejak karbon (23 Nov 2026), as a small green app: one question per
 * step, answered with one tap on a big tile (never a number), a progress bar and Kembali, and the
 * estimate growing at the bottom as they answer. Steps: where they leave from (the panitia's routes
 * or "Lainnya"), back the same way, the shuttle; then a summary with the figure where every answer
 * can be changed, and Simpan. Distances, nights and meals are the panitia's; the room is automatic.
 */
export function CarbonTravelForm({ routes, value, estimate, onSave }: {
  routes: CarbonRoute[]; value: CarbonTravel | null;
  /** The figure for an answer, so the person sees it grow; left out, no figure is shown. */
  estimate?: (travel: CarbonTravel) => CarbonView;
  onSave: (travel: CarbonTravel) => void;
}) {
  const known = value && (value.routeId === OTHER_ROUTE || routes.some(route => route.id === value.routeId)) ? value.routeId : "";
  const [routeId, setRouteId] = useState(known);
  const [roundTrip, setRoundTrip] = useState<boolean | null>(known ? value!.roundTrip : null);
  const [shuttle, setShuttle] = useState<boolean | null>(known ? value!.shuttle : null);
  const [step, setStep] = useState<Step>(known ? 3 : 0);

  const draft: CarbonTravel = { routeId: routeId || OTHER_ROUTE, roundTrip: roundTrip ?? true, shuttle: shuttle ?? false, answeredAt: new Date().toISOString() };
  const figure = routeId && estimate ? estimate(draft) : null;
  const route = routes.find(item => item.id === routeId);
  const next = (to: Step) => window.setTimeout(() => setStep(to), 160);

  return <div className={css.wizard}>
    <div className={css.stepHead}>
      {step > 0
        ? <button type="button" className={css.backBtn} onClick={() => setStep((step - 1) as Step)} aria-label="Kembali"><ArrowLeft aria-hidden /></button>
        : <span className={css.backSpace} aria-hidden />}
      <span className={css.progress} role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step + 1} aria-label={`Langkah ${step + 1} dari 4`}>
        {[0, 1, 2, 3].map(index => <i key={index} data-on={index <= step || undefined} />)}
      </span>
      <span className={css.stepCount}>{step + 1}/4</span>
    </div>

    <div key={step} className={css.stepBody}>
      {step === 0 && <Question title="Berangkat dari mana?">
        <div className={css.tiles} role="radiogroup" aria-label="Berangkat dari mana?">
          {routes.map(item => <Tile key={item.id} icon={item.mode === "kereta" ? TrainFront : Bus} title={item.from} sub={`${modeLabel(item.mode)} · ${id(item.km)} km`}
            checked={routeId === item.id} onPick={() => { setRouteId(item.id); if (shuttle === null) setShuttle(item.mode === "kereta"); next(1); }} />)}
          <Tile icon={Car} title="Lainnya" sub="Mobil, pesawat" checked={routeId === OTHER_ROUTE} onPick={() => { setRouteId(OTHER_ROUTE); if (shuttle === null) setShuttle(false); next(1); }} />
        </div>
      </Question>}

      {step === 1 && <Question title="Pulang lewat jalan yang sama?">
        <div className={`${css.tiles} ${css.tilesTall}`} role="radiogroup" aria-label="Pulang lewat jalan yang sama?">
          <Tile icon={ArrowLeftRight} title="Ya" sub="Pulang-pergi" checked={roundTrip === true} onPick={() => { setRoundTrip(true); next(2); }} />
          <Tile icon={ArrowRight} title="Tidak" sub="Pergi saja" checked={roundTrip === false} onPick={() => { setRoundTrip(false); next(2); }} />
        </div>
      </Question>}

      {step === 2 && <Question title="Naik shuttle ke venue?">
        <div className={`${css.tiles} ${css.tilesTall}`} role="radiogroup" aria-label="Naik shuttle ke venue?">
          <Tile icon={Bus} title="Ya" sub="Dari stasiun" checked={shuttle === true} onPick={() => { setShuttle(true); next(3); }} />
          <Tile icon={Footprints} title="Tidak" sub="Sendiri" checked={shuttle === false} onPick={() => { setShuttle(false); next(3); }} />
        </div>
      </Question>}

      {step === 3 && <div className={css.summary}>
        <div className={css.result}>
          <span className={css.resultLeaf}><Leaf aria-hidden /></span>
          {figure?.kind === "ada"
            ? <><span className={css.resultNumber}>{figure.total.value}</span><span className={css.resultUnit}>{figure.total.unit} · perkiraan</span></>
            : <span className={css.resultUnit}>Siap disimpan</span>}
        </div>
        <ul className={css.answers}>
          <Answer icon={route ? (route.mode === "kereta" ? TrainFront : Bus) : Car} label="Berangkat" value={route ? route.from : "Lainnya"} onEdit={() => setStep(0)} />
          <Answer icon={roundTrip ? ArrowLeftRight : ArrowRight} label="Pulang" value={roundTrip ? "Pulang-pergi" : "Pergi saja"} onEdit={() => setStep(1)} />
          <Answer icon={shuttle ? Bus : Footprints} label="Shuttle" value={shuttle ? "Ya" : "Tidak"} onEdit={() => setStep(2)} />
        </ul>
        {routeId === OTHER_ROUTE && <p className={css.otherNote}>Rute lain belum dihitung.</p>}
        <button type="button" className={css.save} onClick={() => onSave({ ...draft, answeredAt: new Date().toISOString() })}><Check aria-hidden />Simpan</button>
      </div>}
    </div>

    {step < 3 && figure?.kind === "ada" && <div className={css.live} aria-live="polite">
      <Leaf aria-hidden /><span>Perkiraanmu</span><strong>{figure.total.value} {figure.total.unit}</strong>
    </div>}
  </div>;
}

function Question({ title, children }: { title: string; children: ReactNode }) {
  return <section className={css.question}><h3>{title}</h3>{children}</section>;
}

function Tile({ icon: Icon, title, sub, checked, onPick }: { icon: LucideIcon; title: string; sub: string; checked: boolean; onPick: () => void }) {
  return <button type="button" role="radio" aria-checked={checked} className={css.tile} onClick={onPick}>
    <span className={css.tileIcon}><Icon aria-hidden /></span>
    <span className={css.tileText}><strong>{title}</strong><span>{sub}</span></span>
    {checked && <span className={css.tileCheck} aria-hidden><Check /></span>}
  </button>;
}

function Answer({ icon: Icon, label, value, onEdit }: { icon: LucideIcon; label: string; value: string; onEdit: () => void }) {
  return <li><button type="button" className={css.answer} onClick={onEdit} aria-label={`${label}: ${value}. Ubah`}>
    <span className={css.answerIcon}><Icon aria-hidden /></span>
    <span className={css.answerText}><span>{label}</span><strong>{value}</strong></span>
    <ChevronRight aria-hidden className={css.answerGo} />
  </button></li>;
}
