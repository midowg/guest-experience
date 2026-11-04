"use client";

import { useState, type FormEvent } from "react";
import { Link2 } from "lucide-react";
import { Button, Field, Notice } from "@/components/ui";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import { formStatuses, slugFromName, slugProblem, type FormStatus, type QForm } from "@/lib/pra-wam/questionnaire";
import { praWamPath, praWamQuestionnaireApi } from "@/lib/routes";
import type { AdminQuestionnaire } from "@/lib/server/pra-wam/questionnaire-admin";
import { statusHelp, statusLabels } from "./labels";
import styles from "./questionnaire.module.css";

type Message = { tone: "success" | "error" | "warning"; text: string } | null;
type Draft = { name: string; slug: string; intro: string; cardText: string; minutes: string; editUntil: string; stayDeleteOn: string };
type Errors = Record<string, string | undefined>;

const WIB = "+07:00";
/** An ISO moment as the value of a datetime-local field, in WIB. */
export const toWibInput = (iso: string | null) => iso ? new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 16) : "";
/** A datetime-local value, read as WIB. */
export const fromWibInput = (value: string) => value ? `${value}:00${WIB}` : null;
const toDraft = (form: QForm): Draft => ({
  name: form.name, slug: form.slug, intro: form.intro, cardText: form.cardText, minutes: String(form.minutes),
  editUntil: toWibInput(form.editUntil), stayDeleteOn: form.stayDeleteOn ?? "",
});
const payloadOf = (draft: Draft) => ({
  name: draft.name.trim(), slug: draft.slug.trim().toLowerCase(), intro: draft.intro, cardText: draft.cardText,
  minutes: Number(draft.minutes), editUntil: fromWibInput(draft.editUntil), stayDeleteOn: draft.stayDeleteOn || null,
});

/** The editor's own checks, in the server's words; the server checks again. */
export function settingsProblems(draft: Draft): Errors {
  const errors: Errors = {};
  const name = draft.name.replace(/\s+/g, " ").trim();
  if (name.length < 2) errors.name = "Nama minimal 2 karakter.";
  else if (name.length > 60) errors.name = "Nama paling panjang 60 karakter.";
  const slug = slugProblem(draft.slug.trim().toLowerCase());
  if (slug) errors.slug = slug;
  if (draft.intro.trim().length > 800) errors.intro = "Pengantar paling panjang 800 karakter.";
  if (draft.cardText.trim().length > 200) errors.cardText = "Teks kartu Beranda paling panjang 200 karakter.";
  const minutes = Number(draft.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) errors.minutes = "Perkiraan 1 sampai 120 menit.";
  return errors;
}

/**
 * Admin WAM → Kuesioner → Pengaturan: the name (which also gives the address unless the address
 * is set apart), the status (opening asks first), the texts on Beranda and the page, the time
 * estimate, the deadline for changing answers, and the day the stay data is deleted.
 */
export function QuestionnaireSettings({ initial }: { initial: QForm }) {
  const [form, setForm] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [follow, setFollow] = useState(initial.slug === slugFromName(initial.name));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState<"save" | FormStatus | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [confirm, confirmDialog] = useConfirm();

  const set = (key: keyof Draft, value: string) => {
    const next = { ...draft, [key]: value };
    if (key === "name" && follow) next.slug = slugFromName(value);
    if (key === "slug") setFollow(false);
    setDraft(next); setMessage(null);
    if (errors[key] || (key === "name" && errors.slug)) setErrors({ ...errors, [key]: undefined, ...(key === "name" ? { slug: undefined } : {}) });
  };
  const saved = JSON.stringify(payloadOf(toDraft(form)));
  const changed = JSON.stringify(payloadOf(draft)) !== saved;
  const slugMoves = draft.slug.trim().toLowerCase() !== form.slug;
  const error = (key: string) => errors[key];
  const described = (key: string, hint: boolean) => [hint ? `qs-${key}-hint` : "", error(key) ? `qs-${key}-error` : ""].filter(Boolean).join(" ") || undefined;

  async function send(body: Record<string, unknown>, key: "save" | FormStatus): Promise<boolean> {
    setBusy(key); setMessage(null);
    try {
      const result = await adminRequest<AdminQuestionnaire>(praWamQuestionnaireApi.form, { method: "PATCH", body: JSON.stringify(body) });
      if (!result.data) throw new AdminApiError("Respons server tidak berisi kuesioner. Muat ulang halaman.");
      setForm(result.data.form);
      if (key === "save") { setDraft(toDraft(result.data.form)); setErrors({}); }
      setMessage({ tone: "success", text: result.message });
      return true;
    } catch (problem) {
      if (problem instanceof AdminApiError && problem.fieldErrors) {
        const next: Errors = {};
        for (const [path, list] of Object.entries(problem.fieldErrors)) next[path.split(".")[0]] ??= list[0];
        setErrors(next);
      }
      setMessage({ tone: "error", text: errorMessage(problem) });
      return false;
    } finally { setBusy(null); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const problems = settingsProblems(draft);
    setErrors(problems);
    if (Object.values(problems).some(Boolean)) { setMessage({ tone: "error", text: "Periksa isian yang ditandai." }); return; }
    if (slugMoves && !(await confirm({
      title: "Ganti alamat kuesioner?",
      body: <>Alamat baru <strong>{praWamPath.questionnaire(draft.slug.trim().toLowerCase())}</strong>. Alamat lama <strong>{praWamPath.questionnaire(form.slug)}</strong> tetap dialihkan ke alamat baru, jadi tautan yang sudah dibagikan tetap jalan.</>,
      confirmLabel: "Ganti alamat",
    }))) return;
    await send(payloadOf(draft), "save");
  }

  async function setStatus(status: FormStatus) {
    if (status === form.status) return;
    const asks: Record<FormStatus, { title: string; body: string; confirmLabel: string; danger?: boolean }> = {
      buka: { title: "Buka untuk semua peserta?", body: "Kuesioner langsung tampil di Beranda semua peserta dan bisa diisi. Pastikan isi dan pengaturannya sudah benar.", confirmLabel: "Buka kuesioner" },
      tutup: { title: "Tutup kuesioner?", body: "Peserta tidak bisa mengisi atau mengubah jawaban lagi. Jawaban yang sudah masuk tetap tersimpan.", confirmLabel: "Tutup kuesioner", danger: true },
      draf: { title: "Kembalikan ke draf?", body: "Kuesioner disembunyikan dari peserta. Jawaban yang sudah masuk tetap tersimpan.", confirmLabel: "Jadikan draf" },
    };
    if (!(await confirm(asks[status]))) return;
    await send({ status }, status);
  }

  const locked = busy !== null;
  const address = praWamPath.questionnaire(draft.slug.trim().toLowerCase() || form.slug);
  return <div className="stack">
    <h2>Pengaturan</h2>
    <div aria-live="polite">{message && <Notice tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>{message.text}</Notice>}</div>

    <section className={styles.card} aria-labelledby="qs-status-title">
      <h3 id="qs-status-title">Status</h3>
      <div className={styles.statusChoices} role="group" aria-label="Status kuesioner">
        {formStatuses.map(status => <button key={status} type="button" className={styles.statusChoice} aria-pressed={form.status === status} disabled={locked} onClick={() => void setStatus(status)}>
          <strong>{busy === status ? "Menyimpan…" : statusLabels[status]}{form.status === status ? " (sekarang)" : ""}</strong>
          <span>{statusHelp[status]}</span>
        </button>)}
      </div>
    </section>

    <form className={styles.card} noValidate onSubmit={save} aria-labelledby="qs-form-title">
      <h3 id="qs-form-title">Nama, alamat, dan teks</h3>
      <Field label="Nama kuesioner" name="qs-name" error={error("name")} hint="Dipakai di kartu Beranda, judul halaman, dan menu admin. 2–60 karakter.">
        <input id="qs-name" className="input" value={draft.name} maxLength={80} disabled={locked} onChange={event => set("name", event.target.value)}
          aria-invalid={!!error("name")} aria-describedby={described("name", true)} />
      </Field>
      <Field label="Alamat" name="qs-slug" error={error("slug")} hint={follow ? "Mengikuti nama. Ubah di sini bila alamat perlu berbeda." : "Huruf kecil, angka, dan tanda hubung, 3–40 karakter."}>
        <input id="qs-slug" className="input" value={draft.slug} maxLength={60} disabled={locked} spellCheck={false} autoCapitalize="none" onChange={event => set("slug", event.target.value)}
          aria-invalid={!!error("slug")} aria-describedby={described("slug", true)} />
      </Field>
      <div className={styles.address}>
        <Link2 size={18} aria-hidden />
        <span>Alamat lengkap: <code>{address}</code></span>
        {!follow && <Button type="button" variant="quiet" disabled={locked} onClick={() => { setFollow(true); setDraft({ ...draft, slug: slugFromName(draft.name) }); setErrors({ ...errors, slug: undefined }); }}>Samakan dengan nama</Button>}
      </div>
      {slugMoves && <Notice tone="warning">Alamat akan berubah dari {praWamPath.questionnaire(form.slug)}. Alamat lama tetap dialihkan ke alamat baru.</Notice>}
      {form.oldSlugs.length > 0 && <p className={styles.muted}>Alamat lama yang tetap dialihkan: {form.oldSlugs.map(slug => praWamPath.questionnaire(slug)).join(", ")}.</p>}

      <Field label="Pengantar" name="qs-intro" error={error("intro")} hint={`Di awal halaman kuesioner. ${draft.intro.trim().length}/800 karakter.`}>
        <textarea id="qs-intro" className="textarea" rows={4} value={draft.intro} disabled={locked} onChange={event => set("intro", event.target.value)}
          aria-invalid={!!error("intro")} aria-describedby={described("intro", true)} />
      </Field>
      <Field label="Teks kartu Beranda" name="qs-cardText" error={error("cardText")} hint={`Satu atau dua kalimat. ${draft.cardText.trim().length}/200 karakter.`}>
        <textarea id="qs-cardText" className="textarea" rows={2} value={draft.cardText} disabled={locked} onChange={event => set("cardText", event.target.value)}
          aria-invalid={!!error("cardText")} aria-describedby={described("cardText", true)} style={{ minHeight: 72 }} />
      </Field>
      <div className={styles.editorGrid}>
        <Field label="Perkiraan waktu (menit)" name="qs-minutes" error={error("minutes")} hint={"Tampil sebagai \"sekitar N menit\"."}>
          <input id="qs-minutes" className="input" inputMode="numeric" value={draft.minutes} disabled={locked} onChange={event => set("minutes", event.target.value.replace(/[^\d]/g, ""))}
            aria-invalid={!!error("minutes")} aria-describedby={described("minutes", true)} />
        </Field>
        <Field label="Tenggat ubah jawaban (WIB)" name="qs-editUntil" error={error("editUntil")} hint="Kosongkan bila tidak ada tenggat. Bagian anonim tetap terkirim sekali.">
          <input id="qs-editUntil" type="datetime-local" className="input" value={draft.editUntil} disabled={locked} onChange={event => set("editUntil", event.target.value)}
            aria-invalid={!!error("editUntil")} aria-describedby={described("editUntil", true)} />
        </Field>
        <Field label="Tanggal hapus data menginap" name="qs-stayDeleteOn" error={error("stayDeleteOn")} hint="Paling lambat 30 hari setelah WAM. Penghapusan otomatis menyusul (tahap 4).">
          <input id="qs-stayDeleteOn" type="date" className="input" value={draft.stayDeleteOn} disabled={locked} onChange={event => set("stayDeleteOn", event.target.value)}
            aria-invalid={!!error("stayDeleteOn")} aria-describedby={described("stayDeleteOn", true)} />
        </Field>
      </div>
      <div className={styles.actions}>
        <Button type="submit" disabled={locked || !changed}>{busy === "save" ? "Menyimpan…" : "Simpan pengaturan"}</Button>
        {changed && <Button type="button" variant="secondary" disabled={locked} onClick={() => { setDraft(toDraft(form)); setFollow(form.slug === slugFromName(form.name)); setErrors({}); }}>Batalkan perubahan</Button>}
        {!changed && !busy && <small className={styles.muted}>Belum ada perubahan.</small>}
      </div>
    </form>
    {confirmDialog}
  </div>;
}
