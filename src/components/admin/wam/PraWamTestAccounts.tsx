"use client";

import { useMemo, useState } from "react";
import { ExternalLink, FlaskConical, Search, X } from "lucide-react";
import { Notice } from "@/components/ui";
import { ConsoleButton, ConsoleButtonLink, PageHeader, type Crumb } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { MISSION_SESSION_ID } from "@/lib/pra-wam/mission";
import { TEST_ACCOUNTS_MAX } from "@/lib/pra-wam/test-accounts";
import { praWamPath, praWamTestAccountsApi } from "@/lib/routes";
import type { TestAccountsState } from "@/lib/server/pra-wam/test-accounts";
import css from "./test-accounts.module.css";

type Message = { tone: "success" | "error"; text: string } | null;

/**
 * Admin Pra WAM → Akun uji (24 Nov 2026): pick the accounts that may try Misi Perjalanan as a HoD
 * (a made-up room, roommates and quiz) and Jejak karbon now, before the event. Removing one, and
 * Simpan, returns it to normal. "Jejak karbon hanya untuk akun uji" keeps the card from everyone
 * else while it is tested.
 */
export function PraWamTestAccounts({ initial, crumbs = [], title = "Akun uji" }: { initial: TestAccountsState; crumbs?: readonly Crumb[]; title?: string }) {
  const [state, setState] = useState(initial);
  const [ids, setIds] = useState(initial.accounts.ids);
  const [carbonTestOnly, setCarbonTestOnly] = useState(initial.accounts.ids.length ? initial.accounts.carbonTestOnly : true);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const byId = useMemo(() => new Map(state.people.map(person => [person.id, person])), [state.people]);
  const found = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return state.people.filter(person => !ids.includes(person.id) && words.every(word => `${person.name} ${person.department}`.toLowerCase().includes(word))).slice(0, 8);
  }, [query, state.people, ids]);
  const changed = ids.join() !== state.accounts.ids.join() || carbonTestOnly !== state.accounts.carbonTestOnly;
  const full = ids.length >= TEST_ACCOUNTS_MAX;
  const locked = !state.migrated || busy;

  async function save() {
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<TestAccountsState>(praWamTestAccountsApi, { method: "PUT", body: JSON.stringify({ ids, carbonTestOnly }) });
      if (result.data) { setState(result.data); setIds(result.data.accounts.ids); setCarbonTestOnly(result.data.accounts.carbonTestOnly); }
      setMessage({ tone: "success", text: result.message });
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(false); }
  }

  return <div className="stack">
    <PageHeader crumbs={crumbs} title={title}
      subtitle="Akun yang boleh mencoba Misi Perjalanan sebagai HoD dan Jejak karbon sebelum acara. Hapus dari daftar untuk mengembalikannya."
      actions={<>
        <ConsoleButtonLink href={praWamPath.session(MISSION_SESSION_ID)} target="_blank" rel="noopener" icon={<ExternalLink size={18} aria-hidden />}>Buka Misi Perjalanan<span className="sr-only"> (tab baru)</span></ConsoleButtonLink>
        <ConsoleButton variant="primary" type="submit" form="uji-form" disabled={locked || !changed}>{busy ? "Menyimpan…" : "Simpan"}</ConsoleButton>
      </>} />
    {!state.migrated && <Notice tone="warning">Akun uji menunggu tabel pw_settings (migrasi 202611120001).</Notice>}
    <div aria-live="polite">{message && <Notice tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>{message.text}</Notice>}</div>

    <form id="uji-form" className={css.layout} noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
      <section className={css.panel} aria-labelledby="uji-daftar">
        <h2 id="uji-daftar" className={css.h}>Akun uji <span className={css.count}>{ids.length}/{TEST_ACCOUNTS_MAX}</span></h2>
        {ids.length === 0
          ? <p className={css.empty}><FlaskConical aria-hidden />Belum ada. Cari nama di bawah untuk menambah.</p>
          : <ul className={css.list}>{ids.map(id => {
            const person = byId.get(id);
            return <li key={id}>
              <span><strong>{person?.name ?? "Akun tidak aktif"}</strong><small>{person?.department || "—"}</small></span>
              <button type="button" className={css.remove} disabled={locked} onClick={() => { setIds(ids.filter(item => item !== id)); setMessage(null); }} aria-label={`Hapus ${person?.name ?? "akun"} dari akun uji`}><X aria-hidden />Hapus</button>
            </li>;
          })}</ul>}

        <label className={css.search}>
          <span className="sr-only">Cari karyawan</span>
          <Search aria-hidden />
          <input className="input" type="search" value={query} placeholder={full ? `Paling banyak ${TEST_ACCOUNTS_MAX} akun` : "Cari nama atau departemen"} disabled={locked || full} onChange={event => setQuery(event.target.value)} />
        </label>
        {found.length > 0 && <ul className={css.found} aria-label="Hasil pencarian">{found.map(person => <li key={person.id}>
          <button type="button" disabled={locked} onClick={() => { setIds([...ids, person.id]); setQuery(""); setMessage(null); }}>
            <span><strong>{person.name}</strong><small>{person.department || "—"}</small></span><span className={css.add}>Tambah</span>
          </button>
        </li>)}</ul>}
        {query.trim() && found.length === 0 && <p className={css.hint}>Tidak ada nama yang cocok.</p>}
      </section>

      <section className={css.panel} aria-labelledby="uji-apa">
        <h2 id="uji-apa" className={css.h}>Yang didapat akun uji</h2>
        <ul className={css.points}>
          <li><strong>Misi Perjalanan sebagai HoD</strong>: kamar contoh UJI dengan dua teman sekamar contoh, misi, kuis, dan Sudah tiba. Tidak ada nama atau jawaban peserta asli.</li>
          <li><strong>Jejak karbon</strong>: kartu di Beranda dan halamannya, setelah perjalanan rombongan diisi di Jejak karbon.</li>
          <li>Progres Misi tersimpan di HP masing-masing. Ulangi dari awal ada di bagian bawah halamannya.</li>
        </ul>
        <label className={css.check}>
          <input type="checkbox" checked={carbonTestOnly} disabled={locked} onChange={event => { setCarbonTestOnly(event.target.checked); setMessage(null); }} />
          <span><strong>Jejak karbon hanya untuk akun uji</strong><small>Peserta lain belum melihat kartunya. Matikan untuk membukanya ke semua HoD dan BoD di daftar.</small></span>
        </label>
      </section>
    </form>
  </div>;
}
