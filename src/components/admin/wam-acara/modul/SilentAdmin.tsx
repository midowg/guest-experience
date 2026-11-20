"use client";

import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, ConsoleButton, Pill } from "@/components/console";
import { Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { adminWhen, DEFAULT_TOPICS, WAITING_TEXT, type SilentQuestionInput } from "@/lib/main-wam/modul/admin";
import { timeRange } from "@/lib/main-wam/rundown";
import { mainWamAdminApi } from "@/lib/routes";
import type { AdminSilent } from "@/lib/server/main-wam/modul/admin";
import css from "./modul-admin.module.css";

type Message = { tone: "success" | "error"; text: string } | null;
type Question = AdminSilent["questions"][number];
type Session = AdminSilent["sessions"][number];
const when = (session: Session) => `${adminWhen(session.startsAt).split(" · ")[0]} · ${timeRange(session)}`;
const stateWords = { belum: "Belum dibuka", buka: "Dibuka", tutup: "Ditutup" } as const;

/**
 * Admin WAM 2026 → Silent Meeting (agen D): one question per session and its topics. It opens
 * at the session's start and closes at its end; panitia may open it earlier or close it earlier in
 * Rundown live, and once closed it never opens again. Admin sees its state; how many sent only once
 * closed from 5 feedbacks of 5 people (never while open, audit H2), never what they wrote (the BOD
 * read the recap in the app). Once opened, the question, topics and session stay.
 */
export function SilentAdmin({ initial, moduleOn = true }: { initial: AdminSilent; /** Modul Silent Meeting menyala di Pengaturan; mati: banner, isi tetap bisa disiapkan. */ moduleOn?: boolean }) {
  const [data, setData] = useState(initial);
  const [message, setMessage] = useState<Message>(null);
  const [editing, setEditing] = useState<string | "baru" | null>(null);
  const [busy, setBusy] = useState(false);
  const sessions = new Map(data.sessions.map(session => [session.id, session]));
  const used = new Set(data.questions.map(question => question.sessionId));

  async function run(action: () => Promise<string>) {
    setBusy(true); setMessage(null);
    try {
      const text = await action();
      setData((await adminRequest<AdminSilent>(mainWamAdminApi.silentQuestions)).data!);
      setMessage({ tone: "success", text });
      return true;
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); return false; }
    finally { setBusy(false); }
  }

  return <div className={css.stack}>
    {!moduleOn && <Notice tone="warning"><strong>Modul mati.</strong> Silent Meeting dipakai di Pra WAM; di aplikasi WAM 2026 tidak tampil di mana pun sampai modulnya dinyalakan di Pengaturan. Pertanyaan di bawah tetap tersimpan.</Notice>}
    {!data.migrated && <Notice tone="warning">{WAITING_TEXT}</Notice>}
    <div aria-live="polite">{message && <Notice tone={message.tone}>{message.text}</Notice>}</div>
    <p className={css.note}>Silent Meeting dibuka dan ditutup mengikuti jam sesinya. Panitia bisa membukanya lebih awal atau menutupnya lebih awal dari Rundown live; yang sudah ditutup tidak bisa dibuka lagi. Masukan disimpan tanpa nama dan tanpa jam. Jumlahnya tampil setelah ditutup, bila ada minimal 5 masukan dari 5 orang.</p>
    {data.questions.map(question => {
      const session = sessions.get(question.sessionId);
      const state = question.state;
      return <Card key={question.id} title={session?.title ?? "Sesi tidak ditemukan"} id={`silent-${question.id}`}>
        <div className={css.badges}>
          {state && <Pill tone={state === "buka" ? "ok" : "neutral"}>{stateWords[state]}</Pill>}
          {question.openedAt && <Pill tone="brass">Dibuka panitia lebih awal</Pill>}
        </div>
        <p className={css.meta}>
          {session && <span>{when(session)}</span>}
          {state === "tutup" && <span>{question.count !== null ? `${question.count} masukan` : "Masukan belum cukup untuk rekap"}</span>}
          <span>Topik: {question.topics.length ? question.topics.join(", ") : "tanpa topik"}</span>
        </p>
        <p className={css.note}>{question.question}</p>
        {session && session.module !== "silent" && <p className={css.warn}>Sesi ini belum ditandai modul Silent Meeting di Rundown, jadi tombol Kirim masukan tidak muncul di detail sesinya.</p>}
        {editing === question.id
          ? <QuestionForm question={question} sessions={data.sessions} used={used} busy={busy} onCancel={() => setEditing(null)}
            onSave={input => run(async () => (await adminRequest(mainWamAdminApi.silentQuestion(question.id), { method: "PATCH", body: JSON.stringify(input) })).message).then(ok => { if (ok) setEditing(null); })} />
          : <div className={css.actions}>
            <ConsoleButton disabled={busy || !data.migrated || question.locked} onClick={() => setEditing(question.id)}>Ubah</ConsoleButton>
            <ConsoleButton disabled={busy || !data.migrated || question.locked} icon={<Trash2 size={16} aria-hidden />}
              onClick={() => { if (window.confirm("Hapus pertanyaan ini?")) void run(async () => (await adminRequest(mainWamAdminApi.silentQuestion(question.id), { method: "DELETE" })).message); }}>Hapus</ConsoleButton>
          </div>}
      </Card>;
    })}
    {!data.questions.length && <p className={css.note}>Belum ada pertanyaan Silent Meeting.</p>}
    {editing === "baru"
      ? <Card title="Pertanyaan baru" id="silent-baru">
        <QuestionForm question={null} sessions={data.sessions} used={used} busy={busy} onCancel={() => setEditing(null)}
          onSave={input => run(async () => (await adminRequest(mainWamAdminApi.silentQuestions, { method: "POST", body: JSON.stringify(input) })).message).then(ok => { if (ok) setEditing(null); })} />
      </Card>
      : <div><ConsoleButton variant="primary" icon={<Plus size={16} aria-hidden />} disabled={busy || !data.migrated} onClick={() => setEditing("baru")}>Tambah pertanyaan</ConsoleButton></div>}
  </div>;
}

function QuestionForm({ question, sessions, used, busy, onSave, onCancel }: {
  question: Question | null; sessions: Session[]; used: Set<string>; busy: boolean; onSave: (input: SilentQuestionInput) => void; onCancel: () => void;
}) {
  const id = useId();
  const locked = !!question && question.locked;
  const choices = sessions.filter(session => session.id === question?.sessionId || !used.has(session.id))
    .sort((a, b) => Number(b.module === "silent") - Number(a.module === "silent") || a.startsAt.localeCompare(b.startsAt));
  const [sessionId, setSessionId] = useState(question?.sessionId ?? choices.find(session => session.module === "silent")?.id ?? "");
  const [text, setText] = useState(question?.question ?? "");
  const [topics, setTopics] = useState((question?.topics ?? DEFAULT_TOPICS).join(", "));
  const list = topics.split(",").map(topic => topic.trim()).filter(Boolean);
  return <form className={css.form} onSubmit={event => { event.preventDefault(); onSave({ sessionId, question: text, topics: list }); }}>
    <div className="field"><label htmlFor={`${id}-sesi`}>Sesi</label>
      <select id={`${id}-sesi`} className="select" required value={sessionId} disabled={locked} onChange={event => setSessionId(event.target.value)}>
        <option value="" disabled>Pilih sesi</option>
        {choices.map(session => <option key={session.id} value={session.id}>{session.title} · {when(session)}{session.module === "silent" ? " · Silent Meeting" : ""}</option>)}
      </select></div>
    <div className="field"><label htmlFor={`${id}-tanya`}>Pertanyaan</label>
      <textarea id={`${id}-tanya`} className="input" rows={3} required minLength={5} maxLength={300} disabled={locked} value={text} onChange={event => setText(event.target.value)} placeholder="Apa yang perlu kita ubah supaya kerja tahun depan lebih ringan?" /></div>
    {locked && <p className={css.small}>Sudah dibuka, jadi sesi, pertanyaan, dan topiknya tetap.</p>}
    <div className="field"><label htmlFor={`${id}-topik`}>Topik (pisahkan dengan koma, paling banyak 8)</label>
      <input id={`${id}-topik`} className="input" value={topics} disabled={locked} onChange={event => setTopics(event.target.value)} /></div>
    <div className={css.actions}>
      <ConsoleButton type="submit" variant="primary" disabled={busy || !sessionId || text.trim().length < 5 || list.length > 8}>{busy ? "Menyimpan…" : "Simpan"}</ConsoleButton>
      <ConsoleButton onClick={onCancel} disabled={busy}>Batal</ConsoleButton>
    </div>
  </form>;
}
