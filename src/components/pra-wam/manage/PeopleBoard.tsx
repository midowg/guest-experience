"use client";

import { useMemo, useState } from "react";
import { CardGrid, FilterChips, PersonCard, Pill, SectionToolbar, ViewToggle, useViewPreference, type ConsoleTone, type FilterChip } from "@/components/console";
import cs from "@/components/console/console.module.css";
import styles from "../panitia.module.css";

export type PersonItem = {
  id: string; name: string; job: string; unit: string; isLead: boolean; href: string;
  /** "Aktif" / "Belum login"…: the account, for the table. */
  account: string;
  today: { label: string; tone: ConsoleTone; key: "hadir" | "belum" | "kosong" };
  /** "Forum HC · Kam, 5 Nov 13.00", or null. */
  next: string | null;
};

type Filter = "semua" | "hadir" | "sesi";

/**
 * Peserta for the panitia (console "K3"): search, filters that the data can answer, and every
 * person as a card or a table row (remembered on this device). Each opens the person's profile.
 * No questionnaire filter: who has filled it in, by name, stays with Admin WAM (its Progres tab).
 */
export function PeopleBoard({ people, attendanceReady }: { people: PersonItem[]; attendanceReady: boolean }) {
  const [view, setView] = useViewPreference("wam-manage-peserta");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("semua");
  const counts = useMemo(() => ({
    hadir: people.filter(person => person.today.key === "hadir").length,
    sesi: people.filter(person => person.today.key !== "kosong").length,
  }), [people]);
  const chips: FilterChip<Filter>[] = [
    { value: "semua", label: "Semua", count: people.length },
    ...(attendanceReady ? [{ value: "hadir" as const, label: "Hadir hari ini", count: counts.hadir }] : []),
    { value: "sesi", label: "Punya sesi hari ini", count: counts.sesi },
  ];
  const words = query.trim().toLowerCase();
  const shown = people.filter(person => {
    if (filter === "hadir" && person.today.key !== "hadir") return false;
    if (filter === "sesi" && person.today.key === "kosong") return false;
    return !words || [person.name, person.unit, person.job].some(text => text.toLowerCase().includes(words));
  });

  return <section className={styles.section} aria-label="Daftar peserta">
    <SectionToolbar title="Semua peserta" count={shown.length === people.length ? people.length : `${shown.length} dari ${people.length}`}
      search={{ label: "Cari peserta", placeholder: "Cari nama, unit, jabatan", value: query, onChange: setQuery }}
      view={<ViewToggle value={view} onChange={setView} />} />
    <FilterChips label="Saring peserta" chips={chips} value={filter} onChange={setFilter} />
    {shown.length === 0 ? <p className={styles.empty}>{people.length ? "Tidak ada peserta yang cocok." : "Belum ada peserta. Data karyawan diisi super admin."}</p>
      : view === "kartu" ? <CardGrid label="Peserta">
        {shown.map(person => <PersonCard key={person.id} name={person.name} job={[person.isLead ? "Lead" : "", person.job].filter(Boolean).join(" · ") || undefined}
          unit={person.unit} roles={person.isLead ? [{ label: "HOD", tone: "purple" }] : ["Peserta"]} status={{ label: person.today.label, tone: person.today.tone }}
          meta={`Sesi berikutnya: ${person.next ?? "belum ada"}`} href={person.href} />)}
      </CardGrid>
      : <div className={cs.tableWrap}>
        <table className={cs.table}>
          <thead><tr><th>Nama</th><th>Unit</th><th>Hari ini</th><th>Sesi berikutnya</th><th>Akun</th></tr></thead>
          <tbody>{shown.map(person => <tr key={person.id}>
            <td><span className={styles.cellMain}><a className={styles.cellLink} href={person.href}>{person.name}</a>{(person.job || person.isLead) && <small>{[person.isLead ? "Lead" : "", person.job].filter(Boolean).join(" · ")}</small>}</span></td>
            <td>{person.unit || "—"}</td>
            <td><Pill tone={person.today.tone}>{person.today.label}</Pill></td>
            <td className={cs.tableMuted}>{person.next ?? "Belum ada"}</td>
            <td className={cs.tableMuted}>{person.account}</td>
          </tr>)}</tbody>
        </table>
      </div>}
  </section>;
}
