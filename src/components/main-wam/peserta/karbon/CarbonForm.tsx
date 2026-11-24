"use client";

import { useState, type ReactNode } from "react";
import { BedDouble, Car, Check, CupSoda, Laptop, Lock, Smartphone, Utensils, type LucideIcon } from "lucide-react";
import { CARBON_EXTRA_LIMIT, CARBON_OWN_MAX_KM, draftProblems, kgText, tripNote, type CarbonDraft, type ExtraKey, type PersonalCarbonResult } from "@/lib/main-wam/peserta/carbon-saya";
import { OWN_MODES, ownTripValid, type OwnMode, type OwnTrip } from "@/lib/pra-wam/carbon";
import { number } from "@/lib/main-wam/i18n";
import { useLang, useT } from "@/components/main-wam/i18n";
import { Banner, Button, Segmented, Sheet, SwitchRow, TextField } from "@/components/main-wam/ui";
import css from "./karbon.module.css";

const NEW_TRIP: OwnTrip = { from: "", mode: "mobil", km: 0, roundTrip: true };
const EXTRA: { key: ExtraKey; icon: LucideIcon; label: "bottles" | "laptop" | "phone"; unit: "bottles" | "hours" | "times"; tile: "botol" | "laptop" | "hp" }[] = [
  { key: "bottles", icon: CupSoda, label: "bottles", unit: "bottles", tile: "botol" },
  { key: "laptopHours", icon: Laptop, label: "laptop", unit: "hours", tile: "laptop" },
  { key: "phoneCharges", icon: Smartphone, label: "phone", unit: "times", tile: "hp" },
];

/**
 * Jejak karbon's calculator (24 Nov 2026, owner: "seperti Pra WAM", in WAM 2026's look): a grid of tiles, each with
 * its kilograms. What the event's data already says is filled and said to be so (the trip, the room, the meals);
 * what only the person knows is a field (plastic bottles, laptop hours, phone charges); a person who does not go
 * with the group opens "Berangkat sendiri?" (a sheet: from where, by what, how far, round trip). The total on the
 * page above follows every keystroke; Simpan keeps it and waits for the server, its error right above the button.
 * Closed (a week after the event) it only shows; without storage it counts but says it cannot be saved yet.
 */
export function CarbonForm({ result, draft, onDraft, open, storage, saving, error, onSave, sample = false, initialSheet = false }: {
  result: PersonalCarbonResult;
  draft: CarbonDraft;
  onDraft: (draft: CarbonDraft) => void;
  open: boolean;
  storage: "ok" | "waiting";
  saving: boolean;
  error: string;
  onSave: () => void;
  sample?: boolean;
  /** Previews: the "Berangkat sendiri" sheet open from the start. */
  initialSheet?: boolean;
}) {
  const t = useT();
  const { lang } = useLang();
  const [sheet, setSheet] = useState(initialSheet);
  const [local, setLocal] = useState<OwnTrip>(draft.own ?? NEW_TRIP);
  const [sheetTried, setSheetTried] = useState(false);
  const problems = draftProblems(draft);
  const { basis, tiles } = result;
  const editable = open;

  const openSheet = () => { setLocal(draft.own ?? NEW_TRIP); setSheetTried(false); setSheet(true); };
  const applyOwn = () => {
    if (!ownTripValid(local)) { setSheetTried(true); return; }
    onDraft({ ...draft, own: { ...local, from: local.from.trim() } });
    setSheet(false);
  };
  const withGroup = () => { onDraft({ ...draft, own: null }); setSheet(false); };
  const submit = () => { if (!problems.any) onSave(); };

  const room = result.hotelFrom === "tagihan" ? t("peserta.carbon.form.roomBills")
    : result.hotelFrom === "rata" ? t("peserta.carbon.form.roomAverage")
      : basis.roomOccupants > 1 ? t("peserta.carbon.form.roomWith", { n: number(lang, basis.roomOccupants) }) : t("peserta.carbon.form.roomAlone");
  const km = (value: number) => number(lang, Math.round(value));
  const localBad = sheetTried && !ownTripValid(local);

  return <form className={css.form} noValidate aria-busy={saving || undefined} onSubmit={event => { event.preventDefault(); if (editable && storage === "ok" && !saving) submit(); }}>
    <p className={css.formLead}>{t("peserta.carbon.form.lead")}</p>
    <div className={css.tiles}>
      <Tile icon={Car} label={t("peserta.carbon.form.trip")} kg={tiles.perjalanan} fromData={!draft.own}
        action={editable && <Button variant="text" size="m" onClick={openSheet} aria-haspopup="dialog">{draft.own ? t("peserta.carbon.form.ownEdit") : t("peserta.carbon.form.ownTrip")}</Button>}>
        <Value value={km(basis.legKm)} unit={t("peserta.carbon.form.unit.km")} />
        <span className={css.ftSub}>{draft.own && ownTripValid(draft.own) ? t("peserta.carbon.form.ownSummary", { from: draft.own.from }) : tripNote(result, lang)}</span>
      </Tile>
      <Tile icon={BedDouble} label={t("peserta.carbon.form.room")} kg={tiles.kamar} fromData>
        <Value value={number(lang, basis.nights)} unit={t("peserta.carbon.form.unit.nights")} />
        <span className={css.ftSub}>{room}</span>
      </Tile>
      <Tile icon={Utensils} label={t("peserta.carbon.form.meals")} kg={tiles.makan} fromData>
        <Value value={number(lang, basis.meals)} unit={t("peserta.carbon.form.unit.meals")} />
      </Tile>
      {EXTRA.map(item => {
        const label = t(`peserta.carbon.form.${item.label}`);
        const unit = t(`peserta.carbon.form.unit.${item.unit}`);
        const limit = CARBON_EXTRA_LIMIT[item.key];
        const over = problems.extra[item.key];
        return <div key={item.key} className={css.ft}>
          <TextField label={label} icon={item.icon} suffix={unit} type="number" inputMode="decimal" min={0} max={limit} placeholder="0" disabled={!editable}
            value={draft[item.key]} onChange={event => onDraft({ ...draft, [item.key]: event.target.value })}
            error={over ? t("peserta.carbon.form.max", { n: number(lang, limit), unit }) : undefined} />
          <span className={css.ftFoot}><span className={css.ftKg}>{kgText(tiles[item.tile], lang)}</span></span>
        </div>;
      })}
    </div>

    {error && <p className={css.saveError} role="alert">{error}</p>}
    {!editable
      ? <Banner tone="info">{t("peserta.carbon.form.closed")}</Banner>
      : <>
        {storage === "waiting" && <Banner tone="warning">{t("peserta.carbon.form.waiting")}</Banner>}
        {sample && <p className={css.formNote}>{t("peserta.carbon.form.sample")}</p>}
        <Button type="submit" block loading={saving} loadingLabel={t("peserta.carbon.form.saving")} icon={<Check />} disabled={storage === "waiting"}>{t("peserta.carbon.form.save")}</Button>
      </>}

    <Sheet open={sheet} onClose={() => setSheet(false)} title={t("peserta.carbon.form.ownTitle")} subtitle={t("peserta.carbon.form.ownLead")}
      footer={<Button block onClick={applyOwn}>{t("peserta.carbon.form.ownDone")}</Button>}>
      <div className={css.sheetBody}>
        <TextField label={t("peserta.carbon.form.ownFrom")} value={local.from} maxLength={80} placeholder={t("peserta.carbon.form.ownFromHint")}
          error={localBad && !local.from.trim() ? t("peserta.carbon.form.ownError") : undefined} onChange={event => setLocal({ ...local, from: event.target.value })} />
        <div className={css.sheetGroup}>
          <span className={css.sheetLabel}>{t("peserta.carbon.form.ownMode")}</span>
          <Segmented label={t("peserta.carbon.form.ownMode")} value={local.mode} onChange={mode => setLocal({ ...local, mode: mode as OwnMode })}
            options={OWN_MODES.map(mode => ({ value: mode.key, label: t(`peserta.carbon.form.mode.${mode.key}`) }))} />
        </div>
        {local.mode === "lainnya"
          ? <p className={css.formNote}>{t("peserta.carbon.form.ownOther")}</p>
          : <TextField label={t("peserta.carbon.form.ownKm")} suffix={t("peserta.carbon.form.unit.km")} type="number" inputMode="numeric" min={1} max={CARBON_OWN_MAX_KM} placeholder="0"
            value={local.km ? String(local.km) : ""} help={t("peserta.carbon.form.ownKmHelp")}
            error={localBad && !(local.km > 0 && local.km <= CARBON_OWN_MAX_KM) ? t("peserta.carbon.form.ownError") : undefined}
            onChange={event => setLocal({ ...local, km: Math.max(0, Number(event.target.value) || 0) })} />}
        <SwitchRow title={t("peserta.carbon.form.ownRound")} checked={local.roundTrip} onChange={roundTrip => setLocal({ ...local, roundTrip })} />
        {draft.own && <Button variant="text" size="m" onClick={withGroup}>{t("peserta.carbon.form.group")}</Button>}
      </div>
    </Sheet>
  </form>;
}

/** The figure of a tile: Barlow, with its unit small beside it (wraps, never cut). */
function Value({ value, unit }: { value: string; unit: string }) {
  return <span className={css.ftValue}>{value} <small>{unit}</small></span>;
}

/** A tile: icon and name, its value, "Dari data acara" when the event's data fills it, and its kilograms. */
function Tile({ icon: Icon, label, kg, fromData, action, children }: { icon: LucideIcon; label: string; kg: number; fromData?: boolean; action?: ReactNode; children: ReactNode }) {
  const t = useT();
  const { lang } = useLang();
  return <section className={css.ft} aria-label={label}>
    <span className={css.ftHead}><span className={css.ftIcon}><Icon aria-hidden /></span><span className={css.ftLabel}>{label}</span></span>
    <div className={css.ftBody}>{children}</div>
    {fromData && <span className={css.ftLock}><Lock aria-hidden />{t("peserta.carbon.form.fromData")}</span>}
    <span className={css.ftFoot}><span className={css.ftKg}>{kgText(kg, lang)}</span>{action}</span>
  </section>;
}
