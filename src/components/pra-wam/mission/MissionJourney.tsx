"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { BarChart3, CalendarDays, Check, ChevronRight, KeyRound, MapPin, Puzzle, ThumbsUp } from "lucide-react";
import {
  AGENDA, agendaSession, answerKey, byVotes, HINT_COUNT, hintsOpen, initials, journeyPercent, missionsOf, QUESTION_CATEGORIES, SAMPLE_QUESTIONS, scrambled,
  sentenceLabel, sentenceRight, SENTENCES, signalPair, SIGNALS, type MissionKey, type MissionView, type Question,
} from "@/lib/pra-wam/mission";
import { useConfirm } from "../ConfirmDialog";
import { Sheet } from "../Sheet";
import { MissionMiniBar, MysteryPerson, tripStatus } from "./MissionBits";
import { MissionRoad } from "./MissionRoad";
import css from "./mission.module.css";

/*
 * Misi Perjalanan (prototype; design: the artifact "Misi Perjalanan WAM", reworked 24 Nov 2026).
 * One short main screen for people who prefer few words and large type: the trip, the room
 * mystery (HoD), two missions, and one row for the agenda with Tanya CEO. Everything else opens in a
 * sheet; "Sudah tiba di venue" stays at the bottom until check-in, then the room is shown on top.
 * Nothing the questionnaire already asks is asked again (Pesan 2027, the room agreement and three
 * Future Signal questions left out). Pra WAM's own colours. A demo: kept on this device.
 */

type SheetKey = MissionKey | "quiz" | "arrive" | "agenda" | "session" | "ceo";
type State = {
  done: Record<MissionKey, boolean>;
  kalIdx: number; pool: number[]; answer: number[];
  signal: Record<number, string>;
  /** The name picked for each roommate (their key → the picked person's key). */
  guess: Record<string, string>;
  arrived: boolean;
  session: string; questions: Record<string, Question[]>; presenting: string | null; seq: number;
};
const noop = () => () => {};
const keyOf = (name: string) => name.trim().replace(/\s+/g, " ").toUpperCase();

function fresh(view: MissionView): State {
  const questions: Record<string, Question[]> = {};
  let seq = 0;
  for (const day of AGENDA) for (const item of day.items) if (item.id) {
    questions[item.id] = (SAMPLE_QUESTIONS[item.id] ?? []).map(sample => ({ ...sample, id: `c${++seq}`, by: "Contoh", anon: true, voted: false, mine: false, status: "baru" as const }));
  }
  return {
    done: { kal: false, sig: false },
    kalIdx: 0, pool: view.sentences.length ? scrambled(view.sentences[0]) : [], answer: [],
    signal: {}, guess: {}, arrived: false,
    session: "s1", questions, presenting: null, seq,
  };
}

const MISSION_TEXT: Record<MissionKey, { title: string; sub: string; Icon: typeof Puzzle }> = {
  kal: { title: "Susun Kalimatmu", sub: "Urutkan kalimat departemenmu", Icon: Puzzle },
  sig: { title: "Future Signal", sub: "Pilih jawaban untuk dua pertanyaan", Icon: BarChart3 },
};

/** One row of the main screen: a large icon, a title and one short line. */
function Row({ icon, title, sub, done = false, onOpen }: { icon: ReactNode; title: string; sub: string; done?: boolean; onOpen: () => void }) {
  return <button type="button" className={`${css.mission} ${done ? css.missionDone : ""}`} onClick={onOpen}>
    <span className={css.ic}>{done ? <Check aria-hidden /> : icon}</span>
    <span><b>{title}</b><small>{done ? "Selesai" : sub}</small></span>
    {done ? <span className={`${css.tag} ${css.tagOk}`}>Selesai</span> : <ChevronRight className={css.chev} aria-hidden />}
  </button>;
}

export function MissionJourney({ view, detailHref }: { view: MissionView; detailHref: string }) {
  const storage = `wam-misi-${view.employeeId}`;
  // Drawn in the browser only: the demo's place is on this device, read when the state is made.
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);
  const [s, setS] = useState<State>(() => {
    if (typeof window === "undefined") return fresh(view);
    try { const saved = localStorage.getItem(storage); if (!saved) return fresh(view);
      const loaded = { ...fresh(view), ...JSON.parse(saved) as State };
      return { ...loaded, guess: Array.isArray(loaded.guess) ? {} : loaded.guess }; } catch { return fresh(view); }
  });
  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const [toast, setToast] = useState("");
  const [miss, setMiss] = useState(false);
  /** Which roommate the quiz sheet is on (27 Nov 2026). */
  const [quizAt, setQuizAt] = useState(0);
  // The big scene scrolled away → the small bar shows (27 Nov 2026).
  const roadBox = useRef<HTMLDivElement>(null);
  const [roadGone, setRoadGone] = useState(false);
  useEffect(() => {
    const box = roadBox.current;
    if (!box || typeof IntersectionObserver === "undefined") return;
    const watch = new IntersectionObserver(([entry]) => setRoadGone(!entry.isIntersecting && entry.boundingClientRect.top < 0), { threshold: 0 });
    watch.observe(box);
    return () => watch.disconnect();
  }, [inBrowser]);
  const [ask, setAsk] = useState({ text: "", cat: null as string | null });
  // The app's own question (26 Nov 2026): the browser's confirm() is blocked without a word in an
  // installed app and in some in-app browsers, so "Ulangi" seemed to do nothing.
  const [confirm, confirmDialog] = useConfirm();
  async function restart() {
    const ok = await confirm({ title: "Ulangi dari awal?", body: "Misi, tebakan teman sekamar, dan pertanyaanmu di HP ini dihapus. HP lain tidak berubah.", confirmLabel: "Ya, ulangi" });
    if (!ok) return;
    setS(fresh(view)); close(); window.scrollTo({ top: 0 }); setToast("Diulang dari awal");
  }
  const hod = view.role === "HoD" && !!view.room;
  const missions = useMemo(() => missionsOf(view), [view]);
  const doneCount = missions.filter(item => s.done[item]).length;
  const hints = s.arrived ? HINT_COUNT : hintsOpen(doneCount, missions.length);
  const pair = signalPair(view.employeeId);
  const percent = journeyPercent({ launched: true, done: doneCount, missions: missions.length, arrived: s.arrived });

  useEffect(() => { try { localStorage.setItem(storage, JSON.stringify(s)); } catch { /* full or blocked: still works */ } }, [s, storage]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 2800); return () => clearTimeout(timer); }, [toast]);

  const update = (patch: Partial<State> | ((current: State) => Partial<State>)) => setS(current => ({ ...current, ...(typeof patch === "function" ? patch(current) : patch) }));
  const close = () => { setSheet(null); setMiss(false); };
  function complete(mission: MissionKey, label: string) {
    update(current => ({ done: { ...current.done, [mission]: true } }));
    close();
    setToast(`${label} selesai${hod ? " · petunjuk baru terbuka" : ""}`);
  }
  const openSession = (id: string) => { update({ session: id }); setSheet("session"); };

  /** The open questions, in order (27 Nov 2026): roommate 1's, then roommate 2's; each opens with its hint. */
  function quizSteps() {
    const mates = view.room?.mates ?? [];
    return mates.flatMap((mate, m) => mate.questions.slice(0, hints).map((question, q) => ({ m, q, mate, question, key: answerKey(keyOf(mate.name), q) })));
  }

  /** The roommates revealed at the venue: name, department, and each question with the answer given. */
  function roommates() {
    if (!view.room) return null;
    const { mates } = view.room;
    return <section className={css.stack} aria-labelledby="kamar-judul">
      <h2 id="kamar-judul" className={css.sectionTitle}>Teman sekamarmu</h2>
      {mates.map((mate, index) => {
        const key = keyOf(mate.name);
        const answers = mate.questions.map((question, q) => {
          const picked = s.guess[answerKey(key, q)];
          return { hint: mate.hints[q], picked, name: question.choices.find(choice => choice.id === picked)?.name, right: picked === key };
        });
        const right = answers.filter(answer => answer.right).length;
        const all = right === answers.length;
        return <article key={mate.name} className={`${css.quiz} ${all ? css.quizSolved : css.quizMissed}`} aria-labelledby={`teman-${index}`}>
          <h3 id={`teman-${index}`} className={css.quizTitle}>{mate.name}</h3>
          <p className={css.note}>{mate.dept}</p>
          <p className={all ? css.verdict : css.verdictMiss}>{all ? `Semua tebakanmu benar (${right} dari ${answers.length})` : `${right} dari ${answers.length} tebakanmu benar`}</p>
          <ol className={css.answers}>{answers.map((answer, q) => <li key={q}>
            <span>{answer.hint}</span>
            <small className={answer.right ? css.answerRight : css.answerWrong}>{!answer.picked ? "Tidak dijawab" : answer.right ? "✓ Benar" : `✗ Kamu memilih ${answer.name}`}</small>
          </li>)}</ol>
        </article>;
      })}
    </section>;
  }

  /** On the way (27 Nov 2026): the mystery and one button into the quiz. */
  function guessCard() {
    if (!view.room) return null;
    const { mates } = view.room;
    const steps = quizSteps();
    const total = mates.reduce((sum, mate) => sum + mate.questions.length, 0);
    const answered = steps.filter(step => s.guess[step.key]).length;
    // Before any mission (27 Nov 2026) the button is never dead: it opens the first mission, which unlocks the questions.
    const firstMission = missions.find(key => !s.done[key]);
    const locked = steps.length === 0;
    const label = locked ? "Mulai misi untuk membuka pertanyaan" : answered === 0 ? "Ayo tebak teman sekamarmu" : answered < steps.length ? "Lanjut menebak" : "Lihat atau ubah tebakan";
    return <section className={css.guess} aria-labelledby="tebak-judul">
      <div className={css.guessPeople}>{mates.map(mate => <MysteryPerson key={mate.name} size={64} />)}</div>
      <h2 id="tebak-judul" className={css.cardTitle}>Siapa teman sekamarmu?</h2>
      <p className={css.lead}>Kamu sekamar dengan {mates.length} orang. Ada {total} pertanyaan dari profil mereka; nama yang cocok dengan semua petunjuk adalah teman sekamarmu. Jawabannya dibuka saat tiba di venue.</p>
      <p className={css.note}>{locked ? "Pertanyaan terbuka bertahap: selesaikan satu misi, pertanyaan pertama untuk setiap teman sekamar langsung terbuka." : `Terjawab ${answered} dari ${steps.length} pertanyaan terbuka${steps.length < total ? ` · ${total - steps.length} lagi terbuka dari misi berikutnya` : ""}`}</p>
      <button type="button" className={`${css.btn} ${css.primary}`} onClick={() => {
        if (locked) { if (firstMission) setSheet(firstMission); return; }
        const next = steps.findIndex(step => !s.guess[step.key]); setQuizAt(next < 0 ? 0 : next); setSheet("quiz"); }}>{label}</button>
    </section>;
  }

  function arrivedCard() {
    if (!s.arrived) return null;
    if (!hod || !view.room) return <section className={`${css.card} ${css.welcome}`}>
      <h2 className={css.cardTitle}>Selamat datang di Villa Cangkringan</h2>
      <p className={css.lead}>Sesi pertama mulai pukul 16.00.</p></section>;
    const { mates, self, code } = view.room;
    const rhythm = (nick: string, sleep: string | null, wake: string | null, you = false) => <div key={nick}><span>{nick}{you ? " (kamu)" : ""}</span><span>Tidur {sleep ?? "–"}</span><span>Bangun {wake ?? "–"}</span></div>;
    return <>
      {/* The room (27 Nov 2026): its number, who is in it with full names, and where the key is. */}
      <section className={`${css.card} ${css.roomCard}`} aria-labelledby="kamar-kode">
        <div className={css.roomHead}>
          <div className={css.roomTitle}>
            <span className={css.eyebrow}>Kamarmu</span>
            <h2 id="kamar-kode" className={css.roomCode}><span className={css.srOnly}>Kamar </span>{code}</h2>
            <span className={css.note}>Villa Cangkringan</span>
          </div>
          <span className={css.roomKey} aria-hidden><KeyRound size={30} strokeWidth={2} /></span>
        </div>
        <ul className={css.roomPeople} aria-label={`Penghuni kamar ${code}`}>
          {mates.map(mate => <li key={mate.name}>
            <span className={css.ava} aria-hidden>{initials(mate.name)}</span>
            <span className={css.personText}><b>{mate.name}</b><small>{[mate.nick, mate.dept].filter(Boolean).join(" · ")}</small></span>
          </li>)}
          <li>
            <span className={`${css.ava} ${css.avaYou}`} aria-hidden>{initials(view.name)}</span>
            <span className={css.personText}><b>{view.name}</b><small>Kamu</small></span>
          </li>
        </ul>
        <p className={css.keyNote}><KeyRound size={20} aria-hidden /><span>Ambil kunci kamar <b>{code}</b> di meja panitia.</span></p>
      </section>
      {roommates()}
      <section className={css.card}><h2 className={css.cardTitle}>Jam tidur di kamarmu</h2><div className={css.rhythm}>{rhythm(view.nick, self.sleep, self.wake, true)}{mates.map(mate => rhythm(mate.nick, mate.sleep, mate.wake))}</div></section>
    </>;
  }

  /* ---- what each sheet holds, and its buttons ---- */
  function sheetBody(): { title: string; subtitle?: string; body: ReactNode; footer?: ReactNode } | null {
    switch (sheet) {
      case "kal": {
        const number = view.sentences[s.kalIdx];
        const pieces = SENTENCES[number] ?? [];
        const multi = view.sentences.length > 1;
        const place = (piece: number) => {
          const answer = [...s.answer, piece];
          update({ pool: s.pool.filter(item => item !== piece), answer });
          setMiss(false);
          if (answer.length < pieces.length) return;
          if (!sentenceRight(answer, number)) { setMiss(true); return; }
          setTimeout(() => {
            if (s.kalIdx < view.sentences.length - 1) {
              const next = view.sentences[s.kalIdx + 1];
              update(current => ({ kalIdx: current.kalIdx + 1, pool: scrambled(next), answer: [] }));
              setToast("Benar! Lanjut kalimat kedua");
            } else {
              update({ answer: [] });
              complete("kal", "Susun Kalimatmu");
            }
          }, 600);
        };
        const right = s.answer.length === pieces.length && sentenceRight(s.answer, number);
        return {
          title: "Susun Kalimatmu", subtitle: `Kalimat ${sentenceLabel(number)}${multi ? ` · ${s.kalIdx + 1} dari ${view.sentences.length}` : ""}`,
          body: <div className={css.sheetStack}>
            <p className={css.lead}>Ketuk potongan kalimat sesuai urutannya.</p>
            <div className={`${css.answer} ${miss ? css.shake : ""} ${right ? css.win : ""}`} role="group" aria-label="Susunan kalimat">
              {s.answer.map(piece => <button key={piece} type="button" className={`${css.tile} ${css.tileIn}`} onClick={() => { setMiss(false); update({ answer: s.answer.filter(item => item !== piece), pool: [...s.pool, piece] }); }}>{pieces[piece]}</button>)}
            </div>
            {miss && <p className={css.missNote} role="status">Belum pas. Ketuk Ulangi, lalu coba lagi.</p>}
            <div className={css.pool} role="group" aria-label="Potongan kalimat">
              {s.pool.map(piece => <button key={piece} type="button" className={css.tile} onClick={() => place(piece)}>{pieces[piece]}</button>)}
            </div>
          </div>,
          footer: <div className={css.row}>
            <button type="button" className={css.btn} onClick={() => { setMiss(false); update({ answer: [0], pool: [...s.pool, ...s.answer].filter(item => item !== 0) }); }}>Bantuan</button>
            <button type="button" className={css.btn} onClick={() => { setMiss(false); update({ pool: [...s.pool, ...s.answer], answer: [] }); }}>Ulangi</button>
          </div>,
        };
      }
      case "sig": return {
        title: "Future Signal", subtitle: "Pilih satu jawaban untuk setiap pertanyaan",
        body: <div className={css.sheetStack}>
          {pair.map((index, at) => <section key={index} className={css.card}><b className={css.question}>{SIGNALS[index].q}</b>
            <div className={css.chips} role="group" aria-label={SIGNALS[index].q}>{SIGNALS[index].o.map(option =>
              <button key={option} type="button" className={css.chip} aria-pressed={s.signal[at] === option} onClick={() => update(current => ({ signal: { ...current.signal, [at]: option } }))}>{option}</button>)}</div>
          </section>)}
        </div>,
        footer: <button type="button" className={`${css.btn} ${css.primary}`} disabled={!s.signal[0] || !s.signal[1]} onClick={() => complete("sig", "Future Signal")}>Kirim jawaban</button>,
      };
      case "quiz": {
        const steps = quizSteps();
        if (!view.room || steps.length === 0) return null;
        const at = Math.min(quizAt, steps.length - 1);
        const { m, q, mate, question, key } = steps[at];
        const picked = s.guess[key];
        const last = at === steps.length - 1;
        const total = view.room.mates.reduce((sum, item) => sum + item.questions.length, 0);
        return {
          title: `Teman sekamar ${view.room.mates.length > 1 ? m + 1 : ""}`.trim(), subtitle: `Pertanyaan ${q + 1} dari ${mate.questions.length} · jawaban dibuka saat tiba`,
          body: <div className={css.sheetStack}>
            <div className={css.quizDots} aria-hidden>{steps.map((step, index) => <span key={step.key} className={index === at ? css.dotOn : s.guess[step.key] ? css.dotDone : css.dot} />)}</div>
            <div className={css.quizHero}><MysteryPerson size={80} label={`Teman sekamar ${m + 1}, masih rahasia`} /></div>
            <section className={css.card}>
              <span className={css.clueLabel}>Petunjuk {q + 1}</span>
              <p className={css.clue}>{mate.hints[q]}</p>
            </section>
            <b className={css.question}>Siapa dia?</b>
            <div className={css.picks}>{question.choices.map(choice => <button key={choice.id} type="button" className={css.pick} aria-pressed={picked === choice.id}
              onClick={() => update(current => ({ guess: { ...current.guess, [key]: choice.id } }))}>
              <i aria-hidden>{picked === choice.id ? <Check /> : initials(choice.name)}</i>{choice.name}{choice.nick ? <small>{choice.nick}</small> : null}
            </button>)}</div>
            {q > 0 && <p className={css.note}>Ingat petunjuk sebelumnya: nama yang cocok dengan semua petunjuk adalah teman sekamarmu.</p>}
          </div>,
          footer: <div className={css.row}>
            {at > 0 && <button type="button" className={css.btn} onClick={() => setQuizAt(at - 1)}>Sebelumnya</button>}
            <button type="button" className={`${css.btn} ${css.primary}`} disabled={!picked} onClick={() => {
              if (!last) { setQuizAt(at + 1); return; }
              close(); setToast(steps.length < total ? "Tersimpan · sisanya terbuka dari misi" : "Tersimpan · dibuka saat tiba");
            }}>{last ? "Selesai" : "Lanjut"}</button>
          </div>,
        };
      }
      case "arrive": return {
        title: "Sudah tiba?", subtitle: "Villa Cangkringan",
        body: <div className={css.sheetStack}>
          <p className={css.lead}>Data dari kuesionermu sudah ada, jadi tidak perlu diisi lagi.</p>
        </div>,
        footer: <button type="button" className={`${css.btn} ${css.primary}`} onClick={() => { update({ arrived: true }); close(); window.scrollTo({ top: 0, behavior: "smooth" }); setToast(hod ? "Selamat datang · kamarmu terbuka" : "Selamat datang"); }}>Ya, saya sudah tiba</button>,
      };
      case "agenda": return {
        title: "Agenda & Tanya CEO", subtitle: "The Villa Cangkringan, 24–28 Nov",
        body: <div className={css.sheetStack}>
          <p className={css.lead}>Ketuk sesi meeting untuk melihat topiknya dan bertanya ke CEO.</p>
          {AGENDA.map(day => <div key={day.day} className={css.stack}><p className={css.day}>{day.day}</p>{day.items.map(item => item.id
            ? <button key={item.id} type="button" className={css.agendaItem} onClick={() => openSession(item.id!)}>
                <time>{item.t}</time><span><b>{item.title}</b><small>{s.questions[item.id!]?.length ?? 0} pertanyaan</small></span><ChevronRight className={css.chev} aria-hidden /></button>
            : <div key={item.title + item.t} className={`${css.agendaItem} ${css.plain}`}><time>{item.t}</time><span><b>{item.title}</b></span><span /></div>)}</div>)}
        </div>,
      };
      case "session": {
        const session = agendaSession(s.session);
        if (!session) return null;
        const list = byVotes(s.questions[s.session] ?? []);
        return {
          title: "Tanya CEO", subtitle: `${session.title} · ${session.day}, ${session.t}`,
          body: <div className={css.sheetStack}>
            <p className={css.lead}>{session.desc}</p>
            <section className={css.card}>
              <label className={css.field}>Pertanyaanmu<textarea maxLength={200} value={ask.text} placeholder="Tulis pertanyaan untuk CEO" onChange={event => setAsk({ ...ask, text: event.target.value })} /></label>
              <div className={css.chips} role="group" aria-label="Topik (boleh dilewati)">{QUESTION_CATEGORIES.map(cat => <button key={cat} type="button" className={css.chip} aria-pressed={ask.cat === cat} onClick={() => setAsk({ ...ask, cat: ask.cat === cat ? null : cat })}>{cat}</button>)}</div>
              <p className={css.note}>Dikirim atas nama {view.name}.</p>
              <button type="button" className={`${css.btn} ${css.primary}`} disabled={!ask.text.trim()} onClick={() => {
                const question: Question = { id: `q${s.seq + 1}`, text: ask.text.trim(), by: view.name, anon: false, votes: 0, cat: ask.cat ?? "Lainnya", voted: false, mine: true, status: "baru" };
                update(current => ({ seq: current.seq + 1, questions: { ...current.questions, [current.session]: [...(current.questions[current.session] ?? []), question] } }));
                setAsk({ text: "", cat: null }); setToast("Pertanyaan terkirim");
              }}>Kirim pertanyaan</button>
            </section>
            <h3 className={css.cardTitle}>Pertanyaan masuk ({list.length})</h3>
            {list.length > 0 && <p className={css.note}>Setuju dengan pertanyaan orang lain? Ketuk jempolnya. Angka di bawah jempol adalah jumlah dukungan.</p>}
            {list.length ? list.map(question => <div key={question.id} className={`${css.q} ${question.mine ? css.qMine : ""}`}>
              <div><p>{question.text}</p><div className={css.meta}><span>{question.mine ? `${question.by} (kamu)` : question.by}</span>
                {question.status === "dijawab" && <span className={`${css.st} ${css.stOk}`}>Sudah dijawab</span>}{s.presenting === question.id && <span className={`${css.st} ${css.stLive}`}>Sedang dibahas</span>}</div></div>
              <button type="button" className={css.vote} aria-pressed={question.voted} disabled={question.mine} aria-label={`Dukung pertanyaan ini, ${question.votes} dukungan`}
                onClick={() => update(current => ({ questions: { ...current.questions, [current.session]: current.questions[current.session].map(item => item.id === question.id ? { ...item, voted: !item.voted, votes: item.votes + (item.voted ? -1 : 1) } : item) } }))}>
                <ThumbsUp aria-hidden /><span>{question.votes}</span></button>
            </div>) : <p className={css.note}>Belum ada pertanyaan.</p>}
          </div>,
          footer: view.ceo ? <button type="button" className={css.btn} onClick={() => setSheet("ceo")}>Buka Mode CEO</button> : <button type="button" className={css.btn} onClick={() => setSheet("agenda")}>Kembali ke agenda</button>,
        };
      }
      case "ceo": {
        const session = agendaSession(s.session);
        if (!session || !view.ceo) return null;
        const list = byVotes(s.questions[s.session] ?? []);
        const live = list.find(question => question.id === s.presenting);
        const answered = (id: string) => update(current => ({ questions: { ...current.questions, [current.session]: current.questions[current.session].map(item => item.id === id ? { ...item, status: item.status === "dijawab" ? "baru" as const : "dijawab" as const } : item) } }));
        return {
          title: "Mode CEO", subtitle: `${session.title} · ${session.t}`,
          body: <div className={css.sheetStack}>
            {live ? <div className={css.present}><span>Di layar sekarang</span><p>{live.text}</p></div>
              : <p className={css.lead}>Pilih pertanyaan untuk ditampilkan di layar meeting.</p>}
            {list.map(question => <div key={question.id} className={css.q}><div><p>{question.text}</p>
              <div className={css.meta}><span>{question.by}</span><span>· {question.votes} dukungan</span></div>
              <div className={css.row}>
                <button type="button" className={`${css.mini} ${s.presenting === question.id ? css.miniLive : ""}`} onClick={() => update({ presenting: s.presenting === question.id ? null : question.id })}>{s.presenting === question.id ? "Sedang di layar" : "Tampilkan"}</button>
                <button type="button" className={`${css.mini} ${question.status === "dijawab" ? css.miniOn : ""}`} onClick={() => answered(question.id)}>{question.status === "dijawab" ? "Sudah dijawab" : "Tandai dijawab"}</button>
              </div></div></div>)}
          </div>,
          footer: <button type="button" className={css.btn} onClick={() => setSheet("session")}>Kembali</button>,
        };
      }
      default: return null;
    }
  }

  if (!inBrowser) return <div className={css.phone}><p className={css.note} role="status">Memuat misi perjalanan…</p></div>;
  const open = sheetBody();
  const first = agendaSession("s1")!;

  return <div className={css.phone}>
    <div ref={roadBox}><MissionRoad percent={percent} missions={missions.length} done={doneCount} arrived={s.arrived} launched /></div>
    <MissionMiniBar percent={percent} status={tripStatus({ done: doneCount, missions: missions.length, arrived: s.arrived })} shown={roadGone && !open} />

    <main className={css.screen}>
      {arrivedCard()}
      {!s.arrived && hod && guessCard()}

      <section className={css.stack} aria-labelledby="misi-judul">
        <h2 id="misi-judul" className={css.sectionTitle}>Misi di perjalanan</h2>
        {missions.map(key => { const { title, sub, Icon } = MISSION_TEXT[key]; return <Row key={key} icon={<Icon aria-hidden />} title={title} sub={sub} done={s.done[key]}
          onOpen={() => s.done[key] ? setToast("Misi ini sudah selesai") : setSheet(key)} />; })}
      </section>

      <section className={css.stack} aria-labelledby="agenda-judul">
        <h2 id="agenda-judul" className={css.sectionTitle}>Agenda</h2>
        <Row icon={<CalendarDays aria-hidden />} title="Agenda & Tanya CEO" sub={`Sesi pertama ${first.t} · kirim pertanyaanmu`} onOpen={() => setSheet("agenda")} />
      </section>
    </main>

    <footer className={css.foot}>
      <span>Prototipe</span>
      <a href={detailHref}>Detail sesi</a>
      <button type="button" onClick={() => { void restart(); }}>Ulangi dari awal</button>
    </footer>

    {!s.arrived && <div className={css.dock}>
      <button type="button" className={`${css.btn} ${css.primary}`} onClick={() => setSheet("arrive")}><MapPin aria-hidden className={css.btnIcon} /> Sudah tiba di venue</button>
    </div>}

    {confirmDialog}
    {open && <Sheet open onClose={close} title={open.title} subtitle={open.subtitle} footer={open.footer}>{open.body}</Sheet>}
    <div className={`${css.toast} ${toast ? css.toastShow : ""}`} role="status">{toast}</div>
  </div>;
}
