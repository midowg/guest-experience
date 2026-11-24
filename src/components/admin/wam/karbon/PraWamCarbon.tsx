"use client";

import { useState } from "react";
import { Notice } from "@/components/ui";
import { ConsoleButton, PageHeader, type Crumb } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { carbonSetupSchema, tripLabel, tripValid, type CarbonSetup } from "@/lib/pra-wam/carbon";
import { praWamCarbonApi } from "@/lib/routes";
import type { CarbonAdminState } from "@/lib/server/pra-wam/carbon";
import base from "@/components/pra-wam/pra-wam.module.css";
import { CarbonAdminBody } from "./CarbonAdmin";
import css from "./carbon-admin.module.css";

type Message = { tone: "success" | "error"; text: string } | null;
const updated = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

/**
 * Admin Pra WAM → Jejak karbon (24 Nov 2026): the console's page head (Simpan follows the draft),
 * then the same body as the prototype (Ringkasan, Berangkat sendiri, Pengaturan acara), in the
 * Pra WAM look so the participant's card shows as on a phone. Simpan writes the setup; "Ke
 * rombongan" is saved at once.
 */
export function PraWamCarbon({ initial, crumbs = [], title = "Jejak karbon" }: { initial: CarbonAdminState; crumbs?: readonly Crumb[]; title?: string }) {
  const [state, setState] = useState(initial);
  const [draft, setDraft] = useState<CarbonSetup>(initial.setup);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const changed = JSON.stringify(draft) !== JSON.stringify(state.setup);
  const say = (text: string) => setMessage({ tone: "success", text });

  async function save() {
    const checked = carbonSetupSchema.safeParse(draft);
    if (!checked.success) { setMessage({ tone: "error", text: checked.error.issues[0]?.message ?? "Periksa isian." }); return; }
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<CarbonAdminState>(praWamCarbonApi, { method: "PUT", body: JSON.stringify(checked.data) });
      if (result.data) { setState(result.data); setDraft(result.data.setup); }
      setMessage({ tone: "success", text: result.message });
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(false); }
  }

  async function toGroup(id: string) {
    setMessage(null);
    try {
      const result = await adminRequest<CarbonAdminState>(praWamCarbonApi, { method: "POST", body: JSON.stringify({ id }) });
      if (result.data) setState(current => ({ ...current, people: result.data!.people }));
      setMessage({ tone: "success", text: result.message });
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
  }

  const line = [tripValid(draft.trip) ? tripLabel(draft.trip) : "Perjalanan belum diisi",
    state.updatedAt ? `Tersimpan ${updated(state.updatedAt)} WIB` : "Belum disimpan"].join(" · ");
  return <div className="stack">
    <PageHeader crumbs={crumbs} title={title} subtitle={line}
      actions={<ConsoleButton variant="primary" type="button" disabled={busy || !changed || !state.migrated} onClick={() => void save()}>{busy ? "Menyimpan…" : "Simpan"}</ConsoleButton>} />
    {!state.migrated && <Notice tone="warning">Jejak karbon menunggu tabel pw_settings (migrasi 202611120001).</Notice>}
    {state.migrated && state.people.length === 0 && <Notice tone="warning">Daftar kamar Misi Perjalanan belum ada, jadi belum ada peserta di sini.</Notice>}
    <div aria-live="polite">{message && <Notice tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>{message.text}</Notice>}</div>
    {changed && <p className={css.unsaved}>Ada perubahan yang belum disimpan.</p>}
    <div className={`${base.app} ${css.embedded}`}>
      <CarbonAdminBody setup={draft} people={state.people} say={say} onSetup={next => { setDraft(next); setMessage(null); }} onToGroup={person => void toGroup(person.id)} />
    </div>
  </div>;
}
