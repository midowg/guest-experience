"use client";

import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import { AUDIENCE_MIGRATION, type Audience, type QForm } from "@/lib/pra-wam/questionnaire";
import { praWamQuestionnaireApi } from "@/lib/routes";
import type { AdminQuestionnaire } from "@/lib/server/pra-wam/questionnaire-admin";
import styles from "./questionnaire.module.css";
import css from "./audience.module.css";

export type AudiencePerson = { id: string; name: string; department: string };
type Message = { tone: "success" | "error"; text: string } | null;

const NO_DEPARTMENT = "Tanpa departemen";
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(id => b.includes(id));
const matches = (person: AudiencePerson, words: string[]) =>
  words.every(word => `${person.name} ${person.department}`.toLocaleLowerCase("id").includes(word));

/** Departments A to Z with their active people, for the "whole department" shortcuts. */
export function departmentsOf(people: AudiencePerson[]): { name: string; ids: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const person of people) {
    const name = person.department || NO_DEPARTMENT;
    groups.set(name, [...(groups.get(name) ?? []), person.id]);
  }
  return [...groups].map(([name, ids]) => ({ name, ids })).sort((a, b) => a.name.localeCompare(b.name, "id"));
}

/** A whole department on: all of it in, or (when all are in already) all of it out. */
export function toggleGroup(chosen: string[], ids: string[]): string[] {
  const all = ids.every(id => chosen.includes(id));
  return all ? chosen.filter(id => !ids.includes(id)) : [...new Set([...chosen, ...ids])];
}

/**
 * Pengaturan → Untuk siapa: everyone (as before), or only chosen people. People are chosen a
 * whole department at a time and then one by one (search by name or department). The choice is
 * saved on its own; people outside it no longer see the questionnaire, its Beranda card or Kartu
 * rekan, get no reminder, and are left out of the progress. The server checks again.
 */
export function QuestionnaireAudience({ form, people, ready, onSaved }: {
  form: QForm; people: AudiencePerson[]; ready: boolean; onSaved: (form: QForm) => void;
}) {
  const [audience, setAudience] = useState<Audience>(form.audience);
  const [chosen, setChosen] = useState<string[]>(() => form.audienceIds.filter(id => people.some(person => person.id === id)));
  const [query, setQuery] = useState("");
  const [onlyChosen, setOnlyChosen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const departments = useMemo(() => departmentsOf(people), [people]);
  const shown = useMemo(() => {
    const words = query.trim().toLocaleLowerCase("id").split(/\s+/).filter(Boolean);
    return people.filter(person => (!onlyChosen || chosen.includes(person.id)) && matches(person, words));
  }, [people, query, onlyChosen, chosen]);
  const savedIds = form.audienceIds.filter(id => people.some(person => person.id === id));
  const changed = audience !== form.audience || (audience === "pilih" && !sameSet(chosen, savedIds));
  const open = form.status === "buka";

  const edit = (next: string[]) => { setChosen(next); setMessage(null); setError(null); };
  const toggle = (id: string) => edit(chosen.includes(id) ? chosen.filter(item => item !== id) : [...chosen, id]);

  async function save() {
    if (audience === "pilih" && !chosen.length && open) { setError("Pilih minimal satu orang, atau buka untuk semua peserta."); return; }
    if (open && !(await confirm(audience === "semua"
      ? { title: "Buka untuk semua peserta?", body: "Kuesioner langsung tampil di Beranda semua peserta dan bisa diisi.", confirmLabel: "Buka untuk semua" }
      : { title: `Hanya untuk ${chosen.length} orang?`, body: "Orang yang tidak terpilih langsung tidak melihat kuesioner, kartunya di Beranda, dan Kartu rekan. Jawaban yang sudah mereka isi tetap tersimpan, tapi tidak dihitung di progres.", confirmLabel: "Simpan pilihan" }))) return;
    setBusy(true); setMessage(null); setError(null);
    try {
      const result = await adminRequest<AdminQuestionnaire>(praWamQuestionnaireApi.form, { method: "PATCH", body: JSON.stringify({ audience, audienceIds: audience === "pilih" ? chosen : savedIds }) });
      if (!result.data) throw new AdminApiError("Respons server tidak berisi kuesioner. Muat ulang halaman.");
      onSaved(result.data.form);
      setChosen(result.data.form.audienceIds);
      setMessage({ tone: "success", text: result.message });
    } catch (problem) {
      if (problem instanceof AdminApiError && problem.fieldErrors?.audienceIds) setError(problem.fieldErrors.audienceIds[0]);
      setMessage({ tone: "error", text: errorMessage(problem) });
    } finally { setBusy(false); }
  }

  const reset = () => { setAudience(form.audience); edit(savedIds); };
  return <section className={styles.card} aria-labelledby="qa-title">
    {confirmDialog}
    <div className={css.head}>
      <span className={css.icon} aria-hidden="true"><Users size={20} /></span>
      <h3 id="qa-title">Untuk siapa</h3>
      <span className={css.count}>{form.audience === "semua" ? "Semua peserta" : `${savedIds.length} orang terpilih`}</span>
    </div>
    {!ready ? <Notice tone="warning">Pilihan peserta menunggu migrasi {AUDIENCE_MIGRATION}. Sampai migrasi dijalankan, kuesioner untuk semua peserta.</Notice> : <>
      <div className={styles.statusChoices} role="group" aria-label="Untuk siapa">
        <button type="button" className={styles.statusChoice} aria-pressed={audience === "semua"} disabled={busy} onClick={() => { setAudience("semua"); setMessage(null); setError(null); }}>
          <strong>Semua peserta</strong><span>Semua karyawan aktif melihat dan bisa mengisi.</span>
        </button>
        <button type="button" className={styles.statusChoice} aria-pressed={audience === "pilih"} disabled={busy} onClick={() => { setAudience("pilih"); setMessage(null); }}>
          <strong>Orang terpilih</strong><span>Hanya orang yang dicentang. Yang lain tidak melihatnya sama sekali.</span>
        </button>
      </div>

      {audience === "pilih" && <div className={css.picker}>
        <div className={css.pickerHead}>
          <strong aria-live="polite">{chosen.length} dari {people.length} orang dipilih</strong>
          {chosen.length > 0 && <Button type="button" variant="quiet" disabled={busy} onClick={() => edit([])}>Kosongkan</Button>}
        </div>
        <div className={css.groupBlock}>
          <span className={css.label} id="qa-departments">Satu departemen sekaligus</span>
          <div className={css.groups} role="group" aria-labelledby="qa-departments">
            {departments.map(group => {
              const inside = group.ids.filter(id => chosen.includes(id)).length;
              const state = inside === 0 ? "kosong" : inside === group.ids.length ? "penuh" : "sebagian";
              return <button key={group.name} type="button" className={css.group} data-state={state} aria-pressed={state === "penuh"} disabled={busy}
                onClick={() => edit(toggleGroup(chosen, group.ids))} title={state === "penuh" ? `Buang semua ${group.name}` : `Pilih semua ${group.name}`}>
                <span>{group.name}</span><small>{inside}/{group.ids.length}</small>
              </button>;
            })}
          </div>
        </div>
        <div className={css.tools}>
          <label className="sr-only" htmlFor="qa-search">Cari nama atau departemen</label>
          <span className={css.search}>
            <Search size={18} aria-hidden="true" />
            <input id="qa-search" className="input" type="search" placeholder="Cari nama atau departemen" value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" />
          </span>
          <label className={css.onlyChosen}><input type="checkbox" checked={onlyChosen} onChange={event => setOnlyChosen(event.target.checked)} /> Hanya yang dipilih</label>
        </div>
        {shown.length ? <ul className={css.people} aria-label="Daftar karyawan aktif">
          {shown.map(person => <li key={person.id}>
            <label className={css.person}>
              <input type="checkbox" checked={chosen.includes(person.id)} disabled={busy} onChange={() => toggle(person.id)} />
              <span><strong>{person.name}</strong><small>{person.department || NO_DEPARTMENT}</small></span>
            </label>
          </li>)}
        </ul> : <p className={styles.muted}>{onlyChosen && !chosen.length ? "Belum ada yang dipilih." : "Tidak ada karyawan aktif yang cocok."}</p>}
        {error && <p className={css.error} role="alert">{error}</p>}
      </div>}

      <div className={styles.actions}>
        <Button type="button" disabled={busy || !changed} onClick={() => void save()}>{busy ? "Menyimpan…" : "Simpan pilihan"}</Button>
        {changed && <Button type="button" variant="secondary" disabled={busy} onClick={reset}>Batalkan perubahan</Button>}
        {!changed && !busy && <small className={styles.muted}>{form.status === "draf" ? "Berlaku saat kuesioner dibuka." : "Belum ada perubahan."}</small>}
      </div>
    </>}
    <div aria-live="polite">{message && <Notice tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>{message.text}</Notice>}</div>
  </section>;
}
