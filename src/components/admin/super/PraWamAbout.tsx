"use client";

import { useState } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import { AboutCard, AboutText } from "@/components/pra-wam/BerandaCards";
import { ABOUT_LIMITS, aboutProblems, cleanAbout, type About } from "@/lib/pra-wam/about";
import { praWamAboutApi } from "@/lib/routes";
import type { AboutState } from "@/lib/server/pra-wam/about";
import base from "@/components/pra-wam/pra-wam.module.css";
import styles from "@/components/admin/admin.module.css";

type Draft = { title: string; summary: string; body: string; points: string };
type Message = { tone: "success" | "error"; text: string } | null;

const toDraft = (about: About): Draft => ({ ...about, points: about.points.join("\n") });
const fromDraft = (draft: Draft): About => ({ ...draft, points: draft.points.split("\n") });
const updated = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const counter = (value: string, max: number) => `${value.trim().length}/${max} karakter`;

/**
 * "Apa itu WAM?" on Beranda: the super admin writes the title, the short summary for the card,
 * the full text and a few key points, and sees the card and the screen as participants will.
 * Plain text only. Until something is saved, participants see the default text.
 */
export function PraWamAbout({ initial }: { initial: AboutState }) {
  const [state, setState] = useState(initial);
  const [draft, setDraft] = useState<Draft>(toDraft(initial.about));
  const [tried, setTried] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [message, setMessage] = useState<Message>(null);

  const about = fromDraft(draft);
  const preview = cleanAbout(about);
  const problems = tried ? aboutProblems(about) : {};
  const error = (key: keyof About) => problems[key] ?? serverErrors[key]?.[0] ?? Object.entries(serverErrors).find(([path]) => path.startsWith(`${key}.`))?.[1][0];
  const changed = JSON.stringify(preview) !== JSON.stringify(cleanAbout(state.about));
  const set = (key: keyof Draft) => (change: { target: { value: string } }) => { setDraft({ ...draft, [key]: change.target.value }); setMessage(null); };
  const done = (next: AboutState, text: string) => { setState(next); setDraft(toDraft(next.about)); setTried(false); setServerErrors({}); setMessage({ tone: "success", text }); };

  async function save() {
    setTried(true); setMessage(null); setServerErrors({});
    if (Object.keys(aboutProblems(about)).length) { setMessage({ tone: "error", text: "Periksa isian yang ditandai." }); return; }
    setBusy("save");
    try {
      const result = await adminRequest<AboutState>(praWamAboutApi, { method: "PUT", body: JSON.stringify(about) });
      if (result.data) done(result.data, result.message);
    } catch (problem) {
      if (problem instanceof AdminApiError && problem.fieldErrors) setServerErrors(problem.fieldErrors);
      setMessage({ tone: "error", text: errorMessage(problem) });
    } finally { setBusy(null); }
  }

  async function reset() {
    if (!window.confirm("Kembalikan Apa itu WAM ke teks bawaan? Teks yang tersimpan sekarang akan dihapus.")) return;
    setBusy("reset"); setMessage(null);
    try {
      const result = await adminRequest<AboutState>(praWamAboutApi, { method: "DELETE" });
      if (result.data) done(result.data, result.message);
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(null); }
  }

  const locked = !state.migrated || busy !== null;
  const describedBy = (key: keyof About) => `about-${key}-hint${error(key) ? ` about-${key}-error` : ""}`;
  return <div className="stack">
    <h2>Apa itu WAM</h2>
    <p>Kartu di Beranda yang menjelaskan WAM kepada peserta. Ketuk kartunya membuka teks lengkap. Tulis teks biasa: HTML tidak dijalankan, paragraf dipisah satu baris kosong.</p>
    {!state.migrated
      ? <Notice tone="warning">Apa itu WAM menunggu migrasi 202611040008_pra_wam_about.sql. Sampai saat itu peserta melihat teks bawaan di bawah ini, dan isian belum bisa disimpan.</Notice>
      : <p><small>{state.custom && state.updatedAt ? `Teks tersimpan, terakhir diubah ${updated(state.updatedAt)} WIB.` : "Belum diubah: peserta melihat teks bawaan."}</small></p>}

    <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 22rem), 1fr))", alignItems: "start" }}>
      <form className="stack" noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
        <Field label="Judul" name="about-title" error={error("title")} hint={counter(draft.title, ABOUT_LIMITS.title)}>
          <input id="about-title" className="input" value={draft.title} maxLength={ABOUT_LIMITS.title + 20} disabled={locked} onChange={set("title")}
            aria-invalid={!!error("title")} aria-describedby={describedBy("title")} />
        </Field>
        <Field label="Ringkasan untuk kartu" name="about-summary" error={error("summary")} hint={`Satu atau dua kalimat. ${counter(draft.summary, ABOUT_LIMITS.summary)}`}>
          <textarea id="about-summary" className="textarea" rows={3} value={draft.summary} disabled={locked} onChange={set("summary")}
            aria-invalid={!!error("summary")} aria-describedby={describedBy("summary")} />
        </Field>
        <Field label="Isi lengkap" name="about-body" error={error("body")} hint={`Pisahkan paragraf dengan satu baris kosong. ${counter(draft.body, ABOUT_LIMITS.body)}`}>
          <textarea id="about-body" className="textarea" rows={10} value={draft.body} disabled={locked} onChange={set("body")}
            aria-invalid={!!error("body")} aria-describedby={describedBy("body")} />
        </Field>
        <Field label="Poin penting (boleh kosong)" name="about-points" error={error("points")} hint={`Satu poin per baris, maksimal ${ABOUT_LIMITS.points}. Tulis "Label: isi" untuk label kecil di atasnya, misalnya "Kapan: 4–7 Jan 2027".`}>
          <textarea id="about-points" className="textarea" rows={5} value={draft.points} disabled={locked} onChange={set("points")}
            aria-invalid={!!error("points")} aria-describedby={describedBy("points")} />
        </Field>
        <div className={styles.qrActions}>
          <Button type="submit" disabled={locked || !changed}>{busy === "save" ? "Menyimpan…" : "Simpan"}</Button>
          {state.custom && <Button type="button" variant="secondary" disabled={locked} onClick={() => void reset()}>{busy === "reset" ? "Mengembalikan…" : "Kembalikan ke teks bawaan"}</Button>}
          {!changed && state.migrated && !busy && <small>Belum ada perubahan.</small>}
        </div>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
      </form>

      <section aria-label="Pratinjau" className="stack">
        <p><strong>Pratinjau</strong> <small>(tampilan terang, seperti di HP peserta)</small></p>
        <div className={base.app} style={{ minHeight: 0, padding: "16px", borderRadius: "16px", border: "1px solid var(--pw-line)", display: "grid", gap: "16px" }}>
          <AboutCard about={{ title: preview.title || "Judul", summary: preview.summary || "Ringkasan muncul di sini." }} preview />
          <AboutText about={{ ...preview, title: preview.title || "Judul" }} headingLevel={2} />
        </div>
      </section>
    </div>
  </div>;
}
