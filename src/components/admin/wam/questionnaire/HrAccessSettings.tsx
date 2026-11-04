"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Lock, Plus, Search, Trash2, Users } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { HR_ACCESS_MAX, HR_ACCESS_MIGRATION, HR_UNLOCK_MINUTES } from "@/lib/pra-wam/hr-access";
import { praWamHrApi } from "@/lib/routes";
import type { HrAccessPerson, HrAccessSettings as Settings } from "@/lib/server/pra-wam/hr-lock";
import hr from "./hr.module.css";

type Message = { tone: "success" | "error"; text: string } | null;

const matches = (person: HrAccessPerson, words: string[]) =>
  words.every(word => `${person.name} ${person.department} ${person.email}`.toLocaleLowerCase("id").includes(word));

/**
 * Pengaturan → Akses Data HR: who may open Data HR with their own WAM email. Everyone sees the
 * list; only the super admin adds people (active employees with a WAM account, by search) and
 * removes them, after a confirmation. The server checks the role again and logs every change.
 */
export function HrAccessSettings({ initial, canEdit }: { initial: Settings; canEdit: boolean }) {
  const [people, setPeople] = useState(initial.people);
  const [candidates, setCandidates] = useState(initial.candidates);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [confirm, confirmDialog] = useConfirm();

  const searching = query.trim().length > 0;
  const results = useMemo(() => {
    const words = query.trim().toLocaleLowerCase("id").split(/\s+/).filter(Boolean);
    const onList = new Set(people.map(person => person.id));
    return words.length ? candidates.filter(person => !onList.has(person.id) && matches(person, words)).slice(0, 20) : [];
  }, [candidates, people, query]);
  const full = people.length >= HR_ACCESS_MAX;

  async function add(person: HrAccessPerson) {
    if (busy) return;
    setBusy(person.id); setMessage(null);
    try {
      const result = await adminRequest<HrAccessPerson[]>(praWamHrApi.access, { method: "POST", body: JSON.stringify({ employeeId: person.id }) });
      if (result.data) setPeople(result.data);
      setQuery("");
      setMessage({ tone: "success", text: `${person.name} sekarang bisa membuka Data HR dengan email WAM-nya.` });
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(null); }
  }

  async function remove(person: HrAccessPerson) {
    if (busy) return;
    if (!(await confirm({
      title: "Cabut akses Data HR?",
      body: <>{person.name} tidak bisa membuka Data HR lagi. Kalau sedang terbuka di perangkatnya, langsung terkunci. Perubahan ini dicatat di log akses.</>,
      confirmLabel: "Cabut akses",
      danger: true,
    }))) return;
    setBusy(person.id); setMessage(null);
    try {
      const result = await adminRequest<HrAccessPerson[]>(praWamHrApi.accessPerson(person.id), { method: "DELETE" });
      if (result.data) setPeople(result.data);
      if (person.canOpen) setCandidates(list => (list.some(item => item.id === person.id) ? list : [...list, person].sort((a, b) => a.name.localeCompare(b.name, "id"))));
      setMessage({ tone: "success", text: `Akses Data HR ${person.name} dicabut.` });
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(null); }
  }

  return <section className={hr.settings} aria-labelledby="hr-access-title">
    {confirmDialog}
    <div className={hr.settingsHead}>
      <span className={hr.settingsIcon} aria-hidden="true"><Users size={20} /></span>
      <h2 id="hr-access-title">Akses Data HR</h2>
      {initial.ready && <span className={`${hr.pill} ${people.length ? hr.pillOn : ""}`}>{people.length} orang</span>}
    </div>
    <p className={hr.lead}>
      Orang di daftar ini membuka Data HR (jawaban level HR dan Rahasia: kesehatan, data menginap, kontak) dengan email WAM masing-masing,
      setelah masuk admin. Terbuka {HR_UNLOCK_MINUTES} menit di perangkat itu saja, dan setiap buka serta data per orang yang dibuka dicatat atas nama orang itu.
    </p>

    {!initial.migrated ? <Notice tone="warning">Akses Data HR menunggu migrasi 202611040011_wam_questionnaire.sql.</Notice>
      : !initial.ready ? <Notice tone="warning">Akses Data HR menunggu migrasi {HR_ACCESS_MIGRATION}. Sampai migrasi diterapkan, Data HR tidak bisa dibuka.</Notice>
        : <>
          {people.length ? <ul className={hr.accessList}>
            {people.map(person => <li key={person.id} className={hr.accessItem}>
              <span className={hr.accessWho}>
                <strong>{person.name}</strong>
                <small>{person.department || "Tanpa departemen"} · {person.email || "Tanpa email"}</small>
                {!person.canOpen && <span className={hr.accessWarn}><AlertTriangle size={14} aria-hidden="true" /> Akun WAM belum aktif, jadi belum bisa membuka.</span>}
              </span>
              {canEdit && <Button type="button" variant="quiet" disabled={!!busy} onClick={() => void remove(person)} aria-label={`Cabut akses ${person.name}`}>
                <Trash2 size={16} aria-hidden="true" /> {busy === person.id ? "Mencabut…" : "Cabut"}
              </Button>}
            </li>)}
          </ul> : <p className={hr.lead}>Belum ada yang diberi akses Data HR.</p>}

          {canEdit ? <div className={hr.picker}>
            <h3>Tambah orang</h3>
            {full ? <p className={hr.lead}>Daftar sudah penuh ({HR_ACCESS_MAX} orang). Cabut akses seseorang dulu untuk menambah.</p> : <>
              <label className="sr-only" htmlFor="hr-access-search">Cari nama, departemen, atau email</label>
              <span className={hr.searchRow}>
                <Search size={18} aria-hidden="true" />
                <input id="hr-access-search" className="input" type="search" placeholder="Cari nama, departemen, atau email" value={query}
                  onChange={event => setQuery(event.target.value)} autoComplete="off" />
              </span>
              {searching && (results.length ? <ul className={hr.results}>
                {results.map(person => <li key={person.id}>
                  <button type="button" className={hr.person} disabled={!!busy} onClick={() => void add(person)}>
                    <span className={hr.personName}><strong>{person.name}</strong><small>{person.department || "Tanpa departemen"} · {person.email}</small></span>
                    <span className={hr.count}>{busy === person.id ? "…" : <><Plus size={14} aria-hidden="true" /><span className="sr-only">Tambah</span></>}</span>
                  </button>
                </li>)}
              </ul> : <p className={hr.lead}>Tidak ada karyawan aktif dengan akun WAM yang cocok.</p>)}
            </>}
          </div> : <p className={hr.readOnly}><Lock size={16} aria-hidden="true" /> Hanya super admin yang bisa mengubah.</p>}
        </>}
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
  </section>;
}
