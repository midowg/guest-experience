"use client";

import { useState } from "react";
import { Banner, SwitchRow } from "@/components/main-wam/ui";
import { useT } from "@/components/main-wam/i18n";
import { misiDetectApi } from "@/lib/main-wam/misi/detect-routes";
import { errorText, misiRequest } from "./request";

/**
 * "Deteksi misi otomatis" (docs/main-wam/KONTRAK.md §13): the person's own switch. On (the default): a Momen photo that meets
 * a mission's rules is sent for it by itself, and can be taken back while nobody has decided. Off: it is only suggested, and the
 * person taps Ajukan. `saved` false means the system has not been updated yet: the choice cannot be kept and photos are only suggested.
 * Used on the Misi page and in Pengaturan. Mode demo (`sample`) changes nothing on the server.
 */
export function AutoSwitch({ initial, saved, sample = false, inList = false }: { initial: boolean; saved: boolean; sample?: boolean; inList?: boolean }) {
  const t = useT();
  const [on, setOn] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function change(next: boolean) {
    if (sample) { setOn(next); return; }
    const before = on;
    setOn(next); setProblem(null); setBusy(true);
    try { await misiRequest(misiDetectApi.switch, { method: "PUT", json: { on: next } }); }
    catch (error) { setOn(before); setProblem(errorText(error) || t("misi.auto.switch.failed")); }
    finally { setBusy(false); }
  }
  return <>
    <SwitchRow inList={inList} title={t("misi.auto.switch.title")} sub={saved ? t(on ? "misi.auto.switch.on" : "misi.auto.switch.off") : t("misi.auto.switch.unsaved")}
      checked={saved ? on : false} disabled={busy || !saved} onChange={next => void change(next)} />
    {problem && <Banner tone="error">{problem}</Banner>}
  </>;
}
