"use client";

import { useState } from "react";
import { carbonView, personCarbonInput, type CarbonPerson, type CarbonSetup } from "@/lib/pra-wam/carbon";
import { CarbonCard } from "@/components/pra-wam/carbon/CarbonCard";
import { CarbonAdmin } from "./CarbonAdmin";
import css from "./carbon-admin.module.css";

/**
 * The Jejak karbon prototype as one story (23 Nov 2026): the same made-up data seen by a participant
 * on their phone and by the panitia (Admin Pra WAM), so a change on one side shows on the other at
 * once. Nothing leaves the page.
 */
export function CarbonPlayground({ setup: initialSetup, people: initialPeople, side }: { setup: CarbonSetup; people: CarbonPerson[]; side: "peserta" | "panitia" }) {
  const [setup, setSetup] = useState(initialSetup);
  const [people, setPeople] = useState(initialPeople);
  const [meId, setMeId] = useState(initialPeople[0]?.id ?? "");
  const me = people.find(person => person.id === meId) ?? people[0];

  if (side === "panitia") return <CarbonAdmin setup={setup} people={people} onSetup={setSetup} onPeople={setPeople} />;
  return <div className={css.phoneStage}>
    <label className={css.field}>
      <span className={css.label}>Masuk sebagai</span>
      <select className={css.input} value={me?.id} onChange={event => setMeId(event.target.value)}>
        {people.map(person => <option key={person.id} value={person.id}>{person.name}{person.travel?.own ? " (berangkat sendiri)" : ""}</option>)}
      </select>
    </label>
    {me && <CarbonCard key={me.id} view={carbonView(personCarbonInput(setup, me.travel, me.occupants))}
      form={{ trip: setup.trip, nights: setup.settings.nights, occupants: me.occupants, meals: setup.settings.mealsPerPerson, travel: me.travel, open: setup.formOpen,
        inputFor: travel => personCarbonInput(setup, travel, me.occupants),
        onSave: travel => setPeople(list => list.map(person => person.id === me.id ? { ...person, travel } : person)) }} />}
  </div>;
}
