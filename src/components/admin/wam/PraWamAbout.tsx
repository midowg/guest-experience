"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { Field, Notice } from "@/components/ui";
import { ConsoleButton, ConsoleButtonLink, PageHeader, type Crumb } from "@/components/console";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import { AboutCard, AboutText } from "@/components/pra-wam/BerandaCards";
import { ABOUT_LIMITS, aboutProblems, cleanAbout, type About } from "@/lib/pra-wam/about";
import { praWamAboutApi, praWamPath } from "@/lib/routes";
import type { AboutState } from "@/lib/server/pra-wam/about";
import base from "@/components/pra-wam/pra-wam.module.css";
import css from "./pra-wam-rooms.module.css";

type Draft = { title: string; summary: string; body: string; points: string };
type Message = { tone: "success" | "error"; text: string } | null;

const toDraft = (about: About): Draft => ({ ...about, points: about.points.join("\n") });
const fromDraft = (draft: Draft): About => ({ ...draft, points: draft.points.split("\n") });
const updated = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const counter = (value: string, max: number) => `${value.trim().length}/${max} karakter`;

/**
 * Admin WAM → Apa itu WAM: an admin writes the title, the short summary for the card,
 * the full text and a few key points, and sees the card and the screen as participants will, in
 * a phone frame beside the form. Plain text only. Until something is saved, participants see the
 * default text. The page header (with Simpan, which submits the form) is drawn here, since it
 * follows the draft.
 */
export function PraWamAbout({ initial, crumbs = [], title = "Apa itu WAM" }: { initial: AboutState; crumbs?: readonly Crumb[]; title?: string }) {
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
    <PageHeader crumbs={crumbs} title={title}
      subtitle="Kartu di Beranda yang menjelaskan WAM kepada peserta. Ketuk kartunya membuka teks lengkap."
      actions={<>
        <ConsoleButtonLink href={praWamPath.home} target="_blank" rel="noopener" icon={<Eye size={18} aria-hidden="true" />}>Lihat di Beranda<span className="sr-only"> (tab baru)</span></ConsoleButtonLink>
        <ConsoleButton variant="primary" type="submit" form="about-form" disabled={locked || !changed}>{busy === "save" ? "Menyimpan…" : "Simpan"}</ConsoleButton>
      </>} />
    {!state.migrated
      ? <Notice tone="warning">Apa itu WAM menunggu migrasi 202611040008_pra_wam_about.sql. Sampai saat itu peserta melihat teks bawaan di bawah ini, dan isian belum bisa disimpan.</Notice>
      : <p className={css.note}>{state.custom && state.updatedAt ? `Teks tersimpan, terakhir diubah ${updated(state.updatedAt)} WIB.` : "Belum diubah: peserta melihat teks bawaan."} Tulis teks biasa: HTML tidak dijalankan, paragraf dipisah satu baris kosong.</p>}

    <div aria-live="polite">{message && <Notice tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>{message.text}</Notice>}</div>

    <div className={css.aboutLayout}>
      <form id="about-form" className="stack" noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
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
        <div className={css.actions}>
          {state.custom && <ConsoleButton disabled={locked} onClick={() => void reset()}>{busy === "reset" ? "Mengembalikan…" : "Kembalikan ke teks bawaan"}</ConsoleButton>}
          <span className={css.note}>{busy === "save" ? "Menyimpan…" : changed ? "Ada perubahan yang belum disimpan." : state.migrated ? "Belum ada perubahan." : ""}</span>
        </div>
      </form>

      <section aria-labelledby="about-preview" className={css.previewColumn}>
        <p id="about-preview" className={css.previewLabel}>Pratinjau <span>tampilan terang, seperti di HP peserta</span></p>
        <div className={css.phone}>
          <div className={css.phoneNotch} aria-hidden="true" />
          <div className={`${base.app} ${css.phoneScreen}`}>
            <AboutCard about={{ title: preview.title || "Judul", summary: preview.summary || "Ringkasan muncul di sini." }} preview />
            <AboutText about={{ ...preview, title: preview.title || "Judul" }} headingLevel={2} />
          </div>
        </div>
      </section>
    </div>
  </div>;
}
