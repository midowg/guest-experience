"use client";

import { useEffect, useState } from "react";
import { carbonView, personCarbonInput, type CarbonSetup, type CarbonTravel } from "@/lib/pra-wam/carbon";
import { praWamApi, praWamPath } from "@/lib/routes";
import { praWamRequest } from "../api";
import { CarbonCard, CarbonDetail } from "./CarbonCard";
import css from "./carbon.module.css";

type Props = { setup: CarbonSetup; occupants: number; travel: CarbonTravel | null };

/**
 * The Jejak karbon row on Beranda and Ringkasan BoD (24 Nov 2026): the size of the other cards, under
 * the session card, opening its own page (praWamPath.carbon).
 */
export function CarbonHome({ setup, occupants, travel }: Props) {
  return <CarbonCard compact href={praWamPath.carbon} view={carbonView(personCarbonInput(setup, travel, occupants))} />;
}

/**
 * The page: the calculator (the panitia's values locked, the person's own fields), saved with
 * PUT /api/wam/carbon; the total on top follows at once, "Tersimpan" after Simpan, no reload.
 */
export function CarbonPage({ setup, occupants, travel: saved }: Props) {
  const [travel, setTravel] = useState(saved);
  const [toast, setToast] = useState("");
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 2600); return () => clearTimeout(timer); }, [toast]);
  const inputFor = (answer: CarbonTravel | null) => personCarbonInput(setup, answer, occupants);
  return <div className={css.page}>
    <CarbonDetail onSaved={() => setToast("Jejak karbon disimpan")} form={{
      trip: setup.trip, nights: setup.settings.nights, occupants, meals: setup.settings.mealsPerPerson,
      travel, open: setup.formOpen, inputFor,
      onSave: async answer => {
        const { own, bottles, laptopHours, phoneCharges } = answer;
        const { data } = await praWamRequest<CarbonTravel>(praWamApi.carbon, { method: "PUT", json: { own, bottles, laptopHours, phoneCharges } });
        setTravel(data);
      },
    }} />
    <div className={`${css.toast} ${toast ? css.toastShow : ""}`} role="status">{toast}</div>
  </div>;
}
