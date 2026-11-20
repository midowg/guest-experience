"use client";

import { useId, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Download, Link2, Play, Plus, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Card, ConsoleButton, ConsoleButtonLink, Pill } from "@/components/console";
import { Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { OPTION_LETTERS, levelLabels, levelMs } from "@/lib/main-wam/kuis/rules";
import type { QuestionInput } from "@/lib/main-wam/kuis/admin";
import type { QuizLevel } from "@/lib/main-wam/kuis/types";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { mainWamAdminApi, mainWamAdminPath } from "@/lib/routes";
import type { AdminQuestion, AdminQuiz, AdminResults, AdminRun } from "@/lib/server/main-wam/kuis/admin";
import css from "./kuis-admin.module.css";

type Message = { tone: "success" | "error"; text: string } | null;
const LEVELS: QuizLevel[] = [1, 2, 3, 4];
const phaseWords: Record<AdminRun["phase"], string> = {
  siap: "Siap, belum dibuka", lobi: "Lobi terbuka", bersiap: "Berjalan", soal: "Berjalan", batal: "Berjalan", skor: "Papan skor", podium: "Podium", selesai: "Selesai",
};
const when = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * One quiz in Admin WAM 2027 (rancangan §8a): its questions (text, 4 options, the key, the level; played easy to
 * very hard, the order within a level by the arrows), the pengendali, the big screen's link (shown once),
 * games (a new one ends the one not over), and each game's results with names for the prizes.
 */
export function QuizEditor({ initial, moduleOn }: { initial: AdminQuiz; moduleOn: boolean }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | "baru" | null>(null);
  const [title, setTitle] = useState(initial.quiz.title);
  const [host, setHost] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [results, setResults] = useState<AdminResults | null>(null);
  const id = data.quiz.id;
  const live = data.runs.find(run => run.phase !== "selesai") ?? null;

  async function run(action: () => Promise<string>, reload = true) {
    setBusy(true); setMessage(null);
    try {
      const text = await action();
      if (reload) setData((await adminRequest<AdminQuiz>(mainWamAdminApi.quiz(id))).data!);
      setMessage({ tone: "success", text });
      return true;
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); return false; }
    finally { setBusy(false); }
  }
  const send = (url: string, method: string, body?: unknown) => adminRequest<unknown>(url, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

  async function makeLink() {
    if (data.quiz.screenHint && !window.confirm("Ganti tautan layar besar? Tautan lama langsung tidak berlaku (layar yang sedang membukanya berhenti).")) return;
    await run(async () => {
      const result = await adminRequest<{ path: string }>(mainWamAdminApi.quizScreen(id), { method: "POST" });
      setLink(`${window.location.origin}${result.data!.path}`);
      return result.message;
    });
  }

  async function newGame() {
    const sure = live
      ? window.confirm(`Permainan ${live.number} (${phaseWords[live.phase].toLowerCase()}) akan diakhiri dan diganti permainan baru. Hasilnya tetap tersimpan. Lanjutkan?`)
      : window.confirm(`Mulai permainan baru dengan ${data.questions.length} soal seperti sekarang? Pengendali lalu membuka lobinya dari aplikasi.`);
    if (!sure) return;
    await run(async () => (await send(mainWamAdminApi.quizRuns(id), "POST")).message);
  }

  async function showResults(runId: string) {
    setBusy(true); setMessage(null);
    try { setResults((await adminRequest<AdminResults>(mainWamAdminApi.quizResults(id, runId))).data!); }
    catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(false); }
  }

  const hosted = new Set(data.hosts.map(person => person.id));
  return <div className={css.stack}>
    {!moduleOn && <Notice tone="warning"><strong>Modul mati.</strong> Kuis ini tidak tampil di aplikasi dan layar besarnya tidak aktif sampai modul Kuis live dinyalakan di Main WAM → Pengaturan.</Notice>}
    <div aria-live="polite">{message && <Notice tone={message.tone}>{message.text}</Notice>}</div>

    <Card title="Judul" id="kuis-judul">
      <form className={css.inline} onSubmit={event => { event.preventDefault(); void run(async () => (await send(mainWamAdminApi.quiz(id), "PATCH", { title })).message); }}>
        <div className="field"><label htmlFor="kuis-judul-isi">Judul (tampil di layar besar dan kartu Beranda)</label>
          <input id="kuis-judul-isi" className="input" required minLength={2} maxLength={80} value={title} onChange={event => setTitle(event.target.value)} /></div>
        <ConsoleButton type="submit" disabled={busy || title.trim().length < 2 || title === data.quiz.title}>Simpan judul</ConsoleButton>
      </form>
    </Card>

    <Card title={`Soal · ${data.questions.length}`} id="kuis-soal">
      <p className={css.note}>Dimainkan urut dari Mudah ke Sangat sulit; panah mengubah urutan di dalam satu level. Benar 300–500 (makin cepat makin besar), salah −100, tidak menjawab 0. Perubahan soal berlaku untuk permainan baru; permainan yang sudah dibuat memakai salinannya sendiri.</p>
      {LEVELS.map(level => {
        const list = data.questions.filter(question => question.level === level);
        if (!list.length) return null;
        return <section key={level} className={css.level} aria-label={levelLabels[level]}>
          <h3 className={css.levelHead}>{levelLabels[level]} <span>{levelMs(level) / 1000} detik per soal · {list.length} soal</span></h3>
          <ol className={css.questions}>
            {list.map((question, index) => <li key={question.id} className={css.question}>
              {editing === question.id
                ? <QuestionForm question={question} busy={busy} onCancel={() => setEditing(null)}
                  onSave={input => run(async () => (await send(mainWamAdminApi.quizQuestion(id, question.id), "PATCH", input)).message).then(ok => { if (ok) setEditing(null); })} />
                : <>
                  <span className={css.qbody}>{question.body}</span>
                  <ul className={css.options}>{question.options.map((option, i) => <li key={i} className={i === question.correct ? css.correct : undefined}>{OPTION_LETTERS[i]}. {option}{i === question.correct ? " (benar)" : ""}</li>)}</ul>
                  <div className={css.actions}>
                    <ConsoleButton disabled={busy} onClick={() => setEditing(question.id)}>Ubah</ConsoleButton>
                    <ConsoleButton disabled={busy || index === 0} icon={<ArrowUp size={16} aria-hidden />} onClick={() => void run(async () => (await send(mainWamAdminApi.quizQuestionMove(id, question.id), "POST", { direction: "naik" })).message)}>Naik</ConsoleButton>
                    <ConsoleButton disabled={busy || index === list.length - 1} icon={<ArrowDown size={16} aria-hidden />} onClick={() => void run(async () => (await send(mainWamAdminApi.quizQuestionMove(id, question.id), "POST", { direction: "turun" })).message)}>Turun</ConsoleButton>
                    <ConsoleButton disabled={busy} icon={<Trash2 size={16} aria-hidden />} onClick={() => { if (window.confirm("Hapus soal ini?")) void run(async () => (await send(mainWamAdminApi.quizQuestion(id, question.id), "DELETE")).message); }}>Hapus</ConsoleButton>
                  </div>
                </>}
            </li>)}
          </ol>
        </section>;
      })}
      {editing === "baru"
        ? <QuestionForm question={null} busy={busy} onCancel={() => setEditing(null)}
          onSave={input => run(async () => (await send(mainWamAdminApi.quizQuestions(id), "POST", input)).message).then(ok => { if (ok) setEditing(null); })} />
        : <div className={css.actions}><ConsoleButton icon={<Plus size={16} aria-hidden />} disabled={busy} onClick={() => setEditing("baru")}>Tambah soal</ConsoleButton></div>}
    </Card>

    <Card title="Pengendali" id="kuis-pengendali">
      <p className={css.note}>Yang boleh membuka Kendalikan kuis untuk kuis ini (Lanjut, Jeda, Batalkan soal). Pemegang akses {WAM_EVENT_ADMIN_LABEL} selalu boleh (dengan akun WAM-nya); Panitia WAM saja tidak cukup.</p>
      <ul className={css.rows}>
        {data.hosts.map(person => <li key={person.id} className={css.row}>
          <span className={css.rowText}><span>{person.fullName}</span><span>{person.department}</span></span>
          <ConsoleButton disabled={busy} icon={<Trash2 size={16} aria-hidden />} onClick={() => void run(async () => (await send(mainWamAdminApi.quizHost(id, person.id), "DELETE")).message)}>Hapus</ConsoleButton>
        </li>)}
      </ul>
      {!data.hosts.length && <p className={css.small}>Belum ada pengendali selain pemegang akses {WAM_EVENT_ADMIN_LABEL}.</p>}
      <form className={css.inline} onSubmit={event => { event.preventDefault(); void run(async () => (await send(mainWamAdminApi.quizHosts(id), "POST", { employeeId: host })).message).then(ok => { if (ok) setHost(""); }); }}>
        <div className="field"><label htmlFor="kuis-host">Tambah pengendali</label>
          <select id="kuis-host" className="select" value={host} onChange={event => setHost(event.target.value)}>
            <option value="">Pilih orang</option>
            {data.people.filter(person => !hosted.has(person.id)).map(person => <option key={person.id} value={person.id}>{person.fullName}{person.department ? ` · ${person.department}` : ""}</option>)}
          </select></div>
        <ConsoleButton type="submit" icon={<UserPlus size={16} aria-hidden />} disabled={busy || !host}>Tambah</ConsoleButton>
      </form>
    </Card>

    <Card title="Layar besar" id="kuis-layar">
      <p className={css.note}>Halaman tanpa login untuk proyektor atau LED, seperti TV kantor. Tautannya rahasia: hanya tampil sekali saat dibuat; yang disimpan hanya sidik kuncinya. Membuat tautan baru mengakhiri tautan lama. Layar besar hanya hidup selama modul Kuis live menyala.</p>
      <div className={css.badges}>{data.quiz.screenHint ? <Pill tone="blue">Tautan aktif ••••{data.quiz.screenHint}</Pill> : <Pill tone="warn">Belum ada tautan</Pill>}</div>
      {link && <>
        <p className={css.link}>{link}</p>
        <div className={css.actions}>
          <ConsoleButton icon={<Copy size={16} aria-hidden />} onClick={() => { void navigator.clipboard?.writeText(link).then(() => setMessage({ tone: "success", text: "Tautan disalin." }), () => undefined); }}>Salin tautan</ConsoleButton>
          <ConsoleButtonLink href={link} target="_blank" rel="noreferrer noopener">Buka di tab baru</ConsoleButtonLink>
        </div>
        <p className={css.small}>Simpan tautan ini sekarang. Setelah halaman dimuat ulang, tautannya tidak bisa dilihat lagi (buat yang baru bila hilang).</p>
      </>}
      <div className={css.actions}><ConsoleButton icon={<Link2 size={16} aria-hidden />} disabled={busy} onClick={() => void makeLink()}>{data.quiz.screenHint ? "Ganti tautan" : "Buat tautan"}</ConsoleButton></div>
    </Card>

    <Card title="Permainan dan hasil" id="kuis-permainan">
      <p className={css.note}>Permainan baru memakai soal seperti sekarang dan mulai di Siap; pengendali membuka lobinya dari aplikasi (Beranda → Kendalikan kuis). Hasil lengkap dengan nama hanya ada di sini, untuk hadiah.</p>
      <ul className={css.rows}>
        {data.runs.map(game => <li key={game.id} className={css.row}>
          <span className={css.rowText}><span>Permainan {game.number}</span><span>{phaseWords[game.phase]} · {game.players} pemain · {game.count} soal · dibuat {when(game.createdAt)}</span></span>
          <ConsoleButton disabled={busy} onClick={() => void showResults(game.id)}>Hasil</ConsoleButton>
        </li>)}
      </ul>
      {!data.runs.length && <p className={css.small}>Belum ada permainan.</p>}
      <div className={css.actions}><ConsoleButton variant="primary" icon={<Play size={16} aria-hidden />} disabled={busy || !data.questions.length} onClick={() => void newGame()}>{live ? "Mulai ulang (permainan baru)" : "Mulai permainan baru"}</ConsoleButton></div>
      {!data.questions.length && <p className={css.small}>Tambahkan soal dulu.</p>}
    </Card>

    {results && <Card title={`Hasil permainan ${results.run.number} · ${results.run.players} pemain`} id="kuis-hasil">
      <div className={css.actions}><ConsoleButtonLink href={mainWamAdminApi.quizResults(id, results.run.id, true)} icon={<Download size={16} aria-hidden />}>Unduh Excel</ConsoleButtonLink></div>
      <div className={css.tableWrap}><table className={css.table}>
        <thead><tr><th className={css.num}>#</th><th>Nama</th><th>Departemen</th><th>Tokoh</th><th className={css.num}>Nilai</th><th className={css.num}>Benar</th><th className={css.num}>Waktu benar (dtk)</th></tr></thead>
        <tbody>{results.rows.map(row => <tr key={`${row.rank}`}><td className={css.num}>{row.rank}</td><td>{row.fullName}</td><td>{row.department}</td><td>{row.alias}</td><td className={css.num}>{row.total}</td><td className={css.num}>{row.correct}</td><td className={css.num}>{row.correctTime}</td></tr>)}</tbody>
      </table></div>
      {!results.rows.length && <p className={css.small}>Belum ada pemain.</p>}
      <h3 className={css.levelHead}>Per soal</h3>
      <div className={css.tableWrap}><table className={css.table}>
        <thead><tr><th className={css.num}>No</th><th>Level</th><th>Soal</th><th className={css.num}>Menjawab</th><th className={css.num}>Benar</th><th /></tr></thead>
        <tbody>{results.questions.map(item => <tr key={item.index}><td className={css.num}>{item.index + 1}</td><td>{levelLabels[item.level]}</td><td>{item.body}</td><td className={css.num}>{item.answered}</td><td className={css.num}>{item.correct}</td><td>{item.canceled ? "Dibatalkan" : ""}</td></tr>)}</tbody>
      </table></div>
    </Card>}

    <Card title="Hapus kuis" id="kuis-hapus">
      <p className={css.note}>Menghapus kuis menghapus soal, permainan, jawaban, dan hasilnya. Kuis yang sedang dimainkan tidak bisa dihapus.</p>
      <div className={css.actions}><ConsoleButton className={css.danger} icon={<Trash2 size={16} aria-hidden />} disabled={busy}
        onClick={() => { if (window.confirm(`Hapus "${data.quiz.title}" beserta semua permainan dan hasilnya? Ini tidak bisa dibatalkan.`)) void run(async () => { const result = await send(mainWamAdminApi.quiz(id), "DELETE"); router.push(mainWamAdminPath.quizzes); return result.message; }, false); }}>Hapus kuis</ConsoleButton></div>
    </Card>
  </div>;
}

function QuestionForm({ question, busy, onSave, onCancel }: { question: AdminQuestion | null; busy: boolean; onSave: (input: QuestionInput) => void; onCancel: () => void }) {
  const id = useId();
  const [level, setLevel] = useState<QuizLevel>(question?.level ?? 1);
  const [body, setBody] = useState(question?.body ?? "");
  const [options, setOptions] = useState<string[]>(question?.options ?? ["", "", "", ""]);
  const [correct, setCorrect] = useState(question?.correct ?? 0);
  const filled = options.every(option => option.trim().length > 0);
  const distinct = new Set(options.map(option => option.trim().toLocaleLowerCase("id"))).size === 4;
  return <form className={css.form} onSubmit={event => { event.preventDefault(); onSave({ level, body: body.trim(), options: options.map(option => option.trim()), correct }); }}>
    <div className={css.formGrid}>
      <div className="field"><label htmlFor={`${id}-level`}>Level</label>
        <select id={`${id}-level`} className="select" value={level} onChange={event => setLevel(Number(event.target.value) as QuizLevel)}>
          {LEVELS.map(value => <option key={value} value={value}>{levelLabels[value]} · {levelMs(value) / 1000} detik</option>)}
        </select></div>
    </div>
    <div className="field"><label htmlFor={`${id}-soal`}>Soal</label>
      <textarea id={`${id}-soal`} className="input" rows={2} required minLength={3} maxLength={200} value={body} onChange={event => setBody(event.target.value)} placeholder="Gunung tertinggi di Pulau Jawa?" /></div>
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend>Pilihan (tandai yang benar)</legend>
      {options.map((option, i) => <div key={i} className={css.optionRow}>
        <input type="radio" name={`${id}-benar`} aria-label={`Pilihan ${OPTION_LETTERS[i]} benar`} checked={correct === i} onChange={() => setCorrect(i)} />
        <input className="input" required maxLength={80} aria-label={`Pilihan ${OPTION_LETTERS[i]}`} placeholder={`Pilihan ${OPTION_LETTERS[i]}`} value={option}
          onChange={event => setOptions(options.map((value, j) => (j === i ? event.target.value : value)))} />
      </div>)}
    </fieldset>
    {filled && !distinct && <p className={css.small}>Keempat pilihan harus berbeda.</p>}
    <div className={css.actions}>
      <ConsoleButton type="submit" variant="primary" disabled={busy || body.trim().length < 3 || !filled || !distinct}>{busy ? "Menyimpan…" : "Simpan soal"}</ConsoleButton>
      <ConsoleButton onClick={onCancel} disabled={busy}>Batal</ConsoleButton>
    </div>
  </form>;
}
