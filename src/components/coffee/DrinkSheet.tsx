"use client";

import { useId, useState, type ReactNode } from "react";
import { CircleAlert, Flame, Info, Snowflake, X } from "lucide-react";
import { ICE_LEVELS, SUGAR_LEVELS, type Drink, type Ice, type Sugar, type Temperature } from "@/lib/coffee/menu";
import { monthName, resetDay } from "@/lib/coffee/setup";
import type { CoffeeMe } from "@/lib/coffee/types";
import { coffeePath } from "@/lib/routes";
import { newKey, type ClaimBody } from "./api";
import { Layer } from "./Layer";
import css from "./coffee.module.css";

function Option({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={css.option} aria-pressed={on} onClick={onClick}>{children}</button>;
}

/**
 * One drink's options and "Ajukan klaim". Panas/Es only when the drink comes in both; takaran es
 * only for Es. The key is drawn once per opened sheet, so sending twice (a double tap, a slow
 * network, a retry) is one claim. While the claim is being sent the sheet stays open.
 * `onSubmit` answers with what went wrong ("" when the claim went through).
 */
export function DrinkSheet({ drink, me, onClose, onSubmit }: {
  drink: Drink; me: CoffeeMe; onClose: () => void; onSubmit: (body: ClaimBody) => Promise<string>;
}) {
  const titleId = useId();
  const [key] = useState(newKey);
  const [temperature, setTemperature] = useState<Temperature>(drink.temperatures[0]);
  const [sugar, setSugar] = useState<Sugar>("Normal");
  const [ice, setIce] = useState<Ice>("Normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const empty = me.left <= 0;

  const send = async () => {
    if (busy || empty) return;
    setBusy(true); setError("");
    const problem = await onSubmit({ slug: drink.slug, temperature, sugar, ice: temperature === "es" ? ice : "Normal", key });
    // Sent: the app closes the sheet. Refused: it stays, with the reason above the button.
    if (problem) { setError(problem); setBusy(false); }
  };

  return (
    <Layer onClose={() => { if (!busy) onClose(); }} labelledBy={titleId}>
      <span className={css.grabber} aria-hidden />
      <div className={css.sheetHead}>
        {/* eslint-disable-next-line @next/next/no-img-element -- small local photos, sized here */}
        <img src={coffeePath.photo(drink.slug)} alt="" width={88} height={88} />
        <div><h2 id={titleId}>{drink.name}</h2><p>{drink.description}</p></div>
        <button type="button" className={css.iconButton} aria-label="Tutup" disabled={busy} onClick={onClose}><X aria-hidden size={22} /></button>
      </div>

      {drink.temperatures.length > 1 && (
        <fieldset className={css.field} disabled={busy}>
          <legend>Suhu</legend>
          <div className={css.options} data-cols="2">
            <Option on={temperature === "panas"} onClick={() => setTemperature("panas")}><Flame aria-hidden size={18} />Panas</Option>
            <Option on={temperature === "es"} onClick={() => setTemperature("es")}><Snowflake aria-hidden size={18} />Es</Option>
          </div>
        </fieldset>
      )}
      <fieldset className={css.field} disabled={busy}>
        <legend>Gula</legend>
        <div className={css.options} data-cols="3">
          {SUGAR_LEVELS.map(level => <Option key={level} on={sugar === level} onClick={() => setSugar(level)}>{level}</Option>)}
        </div>
      </fieldset>
      {temperature === "es" && (
        <fieldset className={css.field} disabled={busy}>
          <legend>Takaran es</legend>
          <div className={css.options} data-cols="3">
            {ICE_LEVELS.map(level => <Option key={level} on={ice === level} onClick={() => setIce(level)}>{level}</Option>)}
          </div>
        </fieldset>
      )}

      <div className={css.sheetFoot}>
        {error && <p className={css.problem} role="alert"><CircleAlert aria-hidden size={18} /><span>{error}</span></p>}
        {!empty && <p className={css.sendTo}><Info aria-hidden size={16} /><span>Dikirim ke pengelola Werkudara Coffee: HR dan admin yang punya akses.</span></p>}
        <p className={css.muted}>{empty ? `Jatah bulan ini habis. Kembali ${resetDay(me.month)}.` : `Ini klaim ke-${me.used + 1} dari ${me.quota} bulan ${monthName(me.month)}.`}</p>
        <button type="button" className={css.primary} disabled={empty} aria-disabled={busy || undefined} onClick={send}>
          {empty ? "Jatah habis" : busy ? "Mengirim…" : "Ajukan klaim"}
        </button>
      </div>
    </Layer>
  );
}
