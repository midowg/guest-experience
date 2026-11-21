"use client";

import { useEffect, useId, useState } from "react";
import { Card, ConsoleButton } from "@/components/console";
import { Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { mainWamAdminApi } from "@/lib/routes";
import type { QuizAgenda as QuizAgendaData } from "@/lib/server/main-wam/kuis/agenda";
import css from "./kuis-admin.module.css";

const when = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * Admin WAM → Kuis live → one quiz: which agenda item "Kuis live" it belongs to. That item's Detail sesi
 * then shows "Ikut kuis" while a game is on. Optional: Beranda's card works without it.
 */
export function QuizAgenda({ quizId }: { quizId: string }) {
  const field = useId();
  const [data, setData] = useState<QuizAgendaData | null>(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    adminRequest<QuizAgendaData>(mainWamAdminApi.quizAgenda(quizId))
      .then(result => { if (alive) { setData(result.data!); setChoice(result.data!.sessionId ?? ""); } })
      .catch(problem => { if (alive) setMessage({ tone: "error", text: errorMessage(problem) }); });
    return () => { alive = false; };
  }, [quizId]);

  async function save() {
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<unknown>(mainWamAdminApi.quizAgenda(quizId), { method: "PUT", body: JSON.stringify({ sessionId: choice || null }) });
      setData(current => (current ? { ...current, sessionId: choice || null } : current));
      setMessage({ tone: "success", text: result.message });
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(false); }
  }

  return <Card title="Agenda" id="kuis-agenda">
    <p className={css.note}>Tautkan kuis ke item agenda &quot;Kuis live&quot; di rundown. Detail sesi item itu lalu menampilkan tombol &quot;Ikut kuis&quot; selama permainan terbuka. Boleh dikosongkan: kartu di Beranda tetap muncul.</p>
    {data && !data.migrated && <Notice tone="warning">Menunggu pembaruan sistem (migrasi 202611270001). Pilihan agenda belum bisa disimpan.</Notice>}
    <div aria-live="polite">{message && <Notice tone={message.tone}>{message.text}</Notice>}</div>
    {data && <div className={css.inline}>
      <div className="field"><label htmlFor={field}>Item agenda</label>
        <select id={field} className="input" value={choice} onChange={event => setChoice(event.target.value)} disabled={busy || !data.migrated}>
          <option value="">Tidak ditautkan</option>
          {data.sessions.map(session => <option key={session.id} value={session.id}>{session.title} · {when(session.startsAt)}{session.status === "draf" ? " (draf)" : ""}</option>)}
        </select></div>
      <ConsoleButton type="button" disabled={busy || !data.migrated || choice === (data.sessionId ?? "")} onClick={() => void save()}>Simpan agenda</ConsoleButton>
    </div>}
  </Card>;
}
