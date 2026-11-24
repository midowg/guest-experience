"use client";

import { useState } from "react";
import { carbonView, personCarbonInput, type CarbonSetup, type CarbonTravel } from "@/lib/pra-wam/carbon";
import { praWamApi } from "@/lib/routes";
import { praWamRequest } from "../api";
import { CarbonCard } from "./CarbonCard";

/**
 * Beranda's Jejak karbon (24 Nov 2026): the card for the signed-in participant, the panitia's setup
 * and their room size from the server, their own answer saved with PUT /api/wam/carbon. After Simpan
 * the card shows the new figure at once, without reloading the page.
 */
export function CarbonHome({ setup, occupants, travel: saved }: { setup: CarbonSetup; occupants: number; travel: CarbonTravel | null }) {
  const [travel, setTravel] = useState(saved);
  const inputFor = (answer: CarbonTravel | null) => personCarbonInput(setup, answer, occupants);
  return <CarbonCard view={carbonView(inputFor(travel))} form={{
    trip: setup.trip, nights: setup.settings.nights, occupants, meals: setup.settings.mealsPerPerson,
    travel, open: setup.formOpen, inputFor,
    onSave: async answer => {
      const { own, bottles, laptopHours, phoneCharges } = answer;
      const { data } = await praWamRequest<CarbonTravel>(praWamApi.carbon, { method: "PUT", json: { own, bottles, laptopHours, phoneCharges } });
      setTravel(data);
    },
  }} />;
}
