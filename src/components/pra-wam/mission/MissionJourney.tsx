"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { BarChart3, Check, ChevronRight, HelpCircle, Mail, MapPin, MessageCircleQuestion, Puzzle } from "lucide-react";
import {
  AGENDA, agendaSession, byVotes, HINT_COUNT, initials, journeyPercent, missionsOf, QUESTION_CATEGORIES, SAMPLE_QUESTIONS, scrambled,
  sentenceLabel, sentenceRight, SENTENCES, signalPair, SIGNALS, type MissionKey, type MissionView, type Question,
} from "@/lib/pra-wam/mission";
import { Sheet } from "../Sheet";
import { MissionRoad } from "./MissionRoad";
import css from "./mission.module.css";

/*
 * Misi Perjalanan (prototype; design: the artifact "Misi Perjalanan WAM", flow reworked 24 Nov 2026).
 * One main screen, read top to bottom: the trip (bus, road, a stop per mission), the room mystery,
 * the missions, Tanya CEO for the 16.00 session, then the agenda. Every task opens in a sheet over
 * it and comes back to the same place; "Sudah tiba di venue" stays at the bottom until check-in,
 * after which the room is revealed at the top. No intro screen, no launch, no tabs. A demo: kept on
 * this device (localStorage, per account).
 */

type SheetKey = MissionKey | "guess" | "arrive" | "bod" | "session" | "ceo";
type Agree = { ac: string | null; lampu: string | null; alarm: string | null };
type State = {
  done: Record<MissionKey, boolean>; hints: number;
  kalIdx: number; pool: number[]; answer: number[];
  signal: Record<number, string>; message: string; guess: string[]; guessSaved: boolean;
  arrived: boolean; change: string; agree: Agree; agreed: boolean;
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
    done: { kal: false, sig: false, pes: false }, hints: 0,
    kalIdx: 0, pool: view.sentences.length ? scrambled(view.sentences[0]) : [], answer: [],
    signal: {}, message: "", guess: [], guessSaved: false, arrived: false, change: "", agree: { ac: null, lampu: null, alarm: null }, agreed: false,
    session: "s1", questions, presenting: null, seq,
  };
}

const AGREEMENT: [keyof Agree, string, string[]][] = [["ac", "Suhu AC", ["22°", "24°", "26°"]], ["lampu", "Lampu dimatikan", ["22.00", "23.00", "24.00"]], ["alarm", "Alarm pagi", ["05.30", "06.00", "06.30"]]];
const MISSION_TEXT: Record<MissionKey, { title: string; Icon: typeof Puzzle }> = {
  kal: { title: "Susun Kalimatmu", Icon: Puzzle }, sig: { title: "Future Signal", Icon: BarChart3 }, pes: { title: "Pesan untuk 2027", Icon: Mail },
};

/** One row of the main screen: an icon, two lines, and what tapping it does. */
function Row({ icon, title, sub, done = false, onOpen }: { icon: ReactNode; title: string; sub: string; done?: boolean; onOpen: () => void }) {
  return <button type="button" className={`${css.mission} ${done ? css.missionDone : ""}`} onClick={onOpen}>
    <span className={css.ic}>{done ? <Check aria-hidden /> : icon}</span>
    <span><b>{title}</b><small>{sub}</small></span>
    {done ? <span className={`${css.tag} ${css.tagOk}`}>Selesai</span> : <ChevronRight className={css.chev} aria-hidden />}
  </button>;
}

export function MissionJourney({ view, detailHref }: { view: MissionView; detailHref: string }) {
  const storage = `wam-misi-${view.employeeId}`;
  // Drawn in the browser only: the demo's place is on this device, read when the state is made.
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);
  const [s, setS] = useState<State>(() => {
    if (typeof window === "undefined") return fresh(view);
    try { const saved = localStorage.getItem(storage); return saved ? { ...fresh(view), ...JSON.parse(saved) as State } : fresh(view); } catch { return fresh(view); }
  });
  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const [toast, setToast] = useState("");
  const [miss, setMiss] = useState(false);
  const [ask, setAsk] = useState({ text: "", cat: null as string | null, anon: false });
  const hod = view.role === "HoD" && !!view.room;
  const missions = useMemo(() => missionsOf(view), [view]);
  const doneCount = missions.filter(item => s.done[item]).length;
  const pair = signalPair(view.employeeId);
  const percent = journeyPercent({ launched: true, done: doneCount, missions: missions.length, arrived: s.arrived });

  useEffect(() => { try { localStorage.setItem(storage, JSON.stringify(s)); } catch { /* full or blocked: still works */ } }, [s, storage]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 2600); return () => clearTimeout(timer); }, [toast]);

  const update = (patch: Partial<State> | ((current: State) => Partial<State>)) => setS(current => ({ ...current, ...(typeof patch === "function" ? patch(current) : patch) }));
  const close = () => { setSheet(null); setMiss(false); };
  function complete(mission: MissionKey, label: string) {
    update(current => ({ done: { ...current.done, [mission]: true }, hints: hod ? Math.min(HINT_COUNT, current.hints + 1) : current.hints }));
    close();
    setToast(`${label} selesai${hod && s.hints < HINT_COUNT ? " · petunjuk baru terbuka" : ""}`);
  }
  const openSession = (id: string) => { update({ session: id }); setSheet("session"); };
  const guessRight = !!view.room && s.guessSaved && view.room.mates.every(mate => s.guess.includes(keyOf(mate.name)));

  /* ---- the room mystery card (before check-in), or the room itself (after) ---- */
  function mystery(full: boolean) {
    if (!view.room) return null;
    const { mates, code } = view.room;
    const shown = full ? HINT_COUNT : s.hints;
    return <section className={css.mystery} aria-label={full ? `Kamar ${code}` : "Misteri Kamar"}>
      <div className={css.between}><span className={css.eyebrow}>{full ? "Kamarmu" : "Misteri Kamar"}</span><span className={`${css.tag} ${css.tagGold}`}>{shown}/{HINT_COUNT} petunjuk</span></div>
      <div className={css.digits}><span className={css.lbl}>Kamar</span>
        {full ? <span className={`${css.digit} ${css.digitOn}`}>{code}</span> : <><span className={css.digit}>?</span><span className={css.note}>terungkap saat tiba di venue</span></>}
      </div>
      <div className={css.mates}>{mates.map(mate => <div key={mate.name} className={css.mate}><span className={css.ava} aria-hidden>{full ? initials(mate.name) : "?"}</span>{full ? mate.nick : "???"}</div>)}</div>
      {/* Only the hints already open; the rest is one line, so the missions stay in view. */}
      {shown > 0 && <div className={css.hints}>{Array.from({ length: shown }, (_, at) =>
        <div key={at} className={css.hint}><b>Petunjuk {at + 1}</b>{mates.map((mate, index) => <span key={mate.name}>{mates.length > 1 ? `Teman ${index + 1}: ` : ""}{mate.hints[at]}</span>)}</div>)}</div>}
      {shown < HINT_COUNT && <p className={`${css.hint} ${css.hintLocked}`}>{shown === 0 ? "Selesaikan misi di bawah: setiap misi membuka satu petunjuk tentang teman sekamarmu." : `${HINT_COUNT - shown} petunjuk lagi terbuka dari misi berikutnya.`}</p>}
      {!full && !s.arrived && <button type="button" className={css.btn} onClick={() => setSheet("guess")}>
        <HelpCircle aria-hidden className={css.btnIcon} /> {s.guessSaved ? "Ubah tebakan teman sekamar" : "Tebak teman sekamar"}</button>}
    </section>;
  }

  function arrivedCard() {
    if (!s.arrived) return null;
    if (!hod || !view.room) return <section className={`${css.card} ${css.welcome}`}>
      <span className={css.eyebrow}>Sudah tiba</span><b className={css.cardTitle}>Selamat datang di Villa Cangkringan, {view.nick}</b>
      <p>16.00 · Business Overview & Evaluation: kalimat dibacakan berurutan dan pertanyaan Tanya CEO dijawab.</p>
      <p className={css.note}>Sabtu · Final Wrap-Up: Pesan untuk 2027 dibuka bersama.</p></section>;
    const { mates, self } = view.room;
    const rhythm = (nick: string, sleep: string | null, wake: string | null, you = false) => <div key={nick}><span>{nick}{you ? " (kamu)" : ""}</span><span>Tidur {sleep ?? "belum ada data"}</span><span>Bangun {wake ?? "–"}</span></div>;
    const ready = !!(s.agree.ac && s.agree.lampu && s.agree.alarm);
    return <>
      {mystery(true)}
      <section className={css.card}><span className={css.eyebrow}>Teman sekamarmu</span>
        {mates.map(mate => <div key={mate.name}><b>{mate.name}</b><div className={css.note}>{mate.dept}</div></div>)}
        {s.guessSaved && <p className={css.verdict}>{guessRight ? "Tebakanmu benar!" : "Tebakanmu belum tepat, tapi sekarang kalian sudah kenalan."}</p>}
        <p className={css.note}>Ambil key card kamar {view.room.code} di meja panitia.</p>
      </section>
      <section className={css.card}><span className={css.eyebrow}>Ritme tidur kamar</span><div className={css.rhythm}>{rhythm(view.nick, self.sleep, self.wake, true)}{mates.map(mate => rhythm(mate.nick, mate.sleep, mate.wake))}</div></section>
      {s.agreed ? <section className={css.card}><b>Kesepakatan kamar</b><p className={css.note}>AC {s.agree.ac} · lampu mati {s.agree.lampu} · alarm {s.agree.alarm}.</p></section>
        : <section className={css.card}><b>Kesepakatan kamar</b>{AGREEMENT.map(([field, label, options]) => <div key={field}><span className={css.note}>{label}</span>
            <div className={css.chips} role="group" aria-label={label}>{options.map(option => <button key={option} type="button" className={css.chip} aria-pressed={s.agree[field] === option} onClick={() => update(current => ({ agree: { ...current.agree, [field]: option } }))}>{option}</button>)}</div></div>)}
          <button type="button" className={`${css.btn} ${css.primary}`} disabled={!ready} onClick={() => { update({ agreed: true }); setToast("Kesepakatan kamar tersimpan"); }}>Simpan kesepakatan</button></section>}
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
              setToast("Kalimat pertama selesai · lanjut kalimat kedua");
            } else {
              update({ answer: [] });
              complete("kal", "Susun Kalimatmu");
            }
          }, 600);
        };
        const right = s.answer.length === pieces.length && sentenceRight(s.answer, number);
        return {
          title: "Susun Kalimatmu", subtitle: `Kalimat nomor ${sentenceLabel(number)}${multi ? ` · ${s.kalIdx + 1} dari ${view.sentences.length}` : ""}`,
          body: <div className={css.sheetStack}>
            <p className={css.sub}>{multi ? "Kamu memegang dua departemen, jadi ada dua kalimat. " : "Kalimat ini mewakili departemenmu. "}Ketuk potongan sesuai urutan yang benar; ketuk lagi untuk mengembalikan.</p>
            <div className={`${css.answer} ${miss ? css.shake : ""} ${right ? css.win : ""}`} role="group" aria-label="Susunan kalimat">
              {s.answer.length === 0 && <span className={css.note}>Ketuk potongan di bawah</span>}
              {s.answer.map(piece => <button key={piece} type="button" className={`${css.tile} ${css.tileIn}`} onClick={() => { setMiss(false); update({ answer: s.answer.filter(item => item !== piece), pool: [...s.pool, piece] }); }}>{pieces[piece]}</button>)}
            </div>
            {miss && <p className={css.missNote} role="status">Belum pas. Ketuk potongan di atas untuk mengembalikan, lalu coba urutan lain.</p>}
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
        title: "Future Signal", subtitle: "Dua pertanyaan untukmu",
        body: <div className={css.sheetStack}>
          <p className={css.sub}>Pertanyaanmu berbeda dengan peserta lain. Hasil gabungannya tampil di sesi 16.00.</p>
          {pair.map((index, at) => <section key={index} className={css.card}><b>{SIGNALS[index].q}</b>
            <div className={css.chips} role="group" aria-label={SIGNALS[index].q}>{SIGNALS[index].o.map(option =>
              <button key={option} type="button" className={css.chip} aria-pressed={s.signal[at] === option} onClick={() => update(current => ({ signal: { ...current.signal, [at]: option } }))}>{option}</button>)}</div>
          </section>)}
        </div>,
        footer: <button type="button" className={`${css.btn} ${css.primary}`} disabled={!s.signal[0] || !s.signal[1]} onClick={() => complete("sig", "Future Signal")}>Kirim jawaban</button>,
      };
      case "pes": return {
        title: "Pesan untuk 2027", subtitle: "Dibaca BoD bersama namamu",
        body: <div className={css.sheetStack}>
          <p className={css.sub}>Tulis satu harapan atau komitmenmu untuk 2027. Pesan dibuka bersama di Final Wrap-Up hari Sabtu.</p>
          <label className={css.field}>Pesanmu
            <textarea maxLength={160} value={s.message} placeholder="Contoh: Di 2027 saya ingin timku lebih berani mencoba hal baru." onChange={event => update({ message: event.target.value })} />
          </label>
          <span className={css.note}>{s.message.length}/160</span>
        </div>,
        footer: <button type="button" className={`${css.btn} ${css.primary}`} disabled={!s.message.trim()} onClick={() => complete("pes", "Pesan untuk 2027")}>Kirim ke BoD</button>,
      };
      case "guess": {
        if (!view.room) return null;
        const need = view.room.mates.length;
        return {
          title: "Tebak teman sekamar", subtitle: `Pilih ${need} orang · bisa diubah sampai tiba`,
          body: <div className={css.sheetStack}>
            {s.hints > 0 ? <div className={css.hints}>{Array.from({ length: s.hints }, (_, at) => <div key={at} className={css.hint}><b>Petunjuk {at + 1}</b>
              {view.room!.mates.map((mate, index) => <span key={mate.name}>{need > 1 ? `Teman ${index + 1}: ` : ""}{mate.hints[at]}</span>)}</div>)}</div>
              : <p className={css.note}>Belum ada petunjuk. Selesaikan misi untuk membuka petunjuk, atau tebak sekarang.</p>}
            <div className={css.picks}>{view.room.others.map(person => <button key={person.id} type="button" className={css.pick} aria-pressed={s.guess.includes(person.id)} onClick={() => {
              if (s.guess.includes(person.id)) update(current => ({ guess: current.guess.filter(id => id !== person.id) }));
              else if (s.guess.length < need) update(current => ({ guess: current.guess.length < need ? [...current.guess, person.id] : current.guess }));
            }}><i aria-hidden>{initials(person.name)}</i>{person.name}</button>)}</div>
          </div>,
          footer: <button type="button" className={`${css.btn} ${css.primary}`} disabled={s.guess.length !== need} onClick={() => { update({ guessSaved: true }); close(); setToast("Tebakan disimpan"); }}>Simpan tebakan</button>,
        };
      }
      case "arrive": return {
        title: "Sudah tiba di venue?", subtitle: "Villa Cangkringan",
        body: <div className={css.sheetStack}>
          <p>Data dari kuesionermu sudah diterima: kontak darurat, makanan, dan ukuran kaos. Tidak perlu diisi ulang.</p>
          <label className={css.field}>Ada data yang berubah? (opsional)<input type="text" value={s.change} placeholder="Contoh: ukuran kaos jadi L" onChange={event => update({ change: event.target.value })} /></label>
          {hod && <p className={css.note}>Setelah ini kamarmu dan teman sekamarmu terungkap.</p>}
        </div>,
        footer: <button type="button" className={`${css.btn} ${css.primary}`} onClick={() => { update({ arrived: true, hints: HINT_COUNT }); close(); window.scrollTo({ top: 0, behavior: "smooth" }); setToast(hod ? "Selamat datang · kamarmu terbuka" : "Selamat datang di Villa Cangkringan"); }}>Saya sudah tiba</button>,
      };
      case "bod": return {
        title: "Pesan HoD untuk 2027", subtitle: "Khusus BoD",
        body: <div className={css.sheetStack}>
          <p className={css.sub}>Di prototipe ini pesan belum terkirim antar akun. Nanti setiap pesan HoD muncul di sini bersama namanya.</p>
          <div className={css.msg}><p>Di 2027 saya ingin tim berani mencoba satu cara kerja baru setiap kuartal.</p><span className={css.note}>Contoh pesan</span></div>
        </div>,
      };
      case "session": {
        const session = agendaSession(s.session);
        if (!session) return null;
        const list = byVotes(s.questions[s.session] ?? []);
        return {
          title: "Tanya CEO", subtitle: `${session.title} · ${session.day}, ${session.t}–${session.end}`,
          body: <div className={css.sheetStack}>
            <section className={css.card}><span className={css.eyebrow}>Topik sesi</span><p>{session.desc}</p><p className={css.note}>Pertanyaan ditutup saat sesi dimulai pukul {session.t}.</p></section>
            <section className={css.card}><b>Ajukan pertanyaan</b>
              <div className={css.chips} role="group" aria-label="Kategori">{QUESTION_CATEGORIES.map(cat => <button key={cat} type="button" className={css.chip} aria-pressed={ask.cat === cat} onClick={() => setAsk({ ...ask, cat: ask.cat === cat ? null : cat })}>{cat}</button>)}</div>
              <label className={css.field}>Pertanyaanmu<textarea maxLength={200} value={ask.text} placeholder="Tulis pertanyaan yang ingin dijawab CEO di sesi ini" onChange={event => setAsk({ ...ask, text: event.target.value })} /></label>
              <span className={css.note}>{ask.text.length}/200</span>
              <label className={css.switch}>Kirim tanpa nama<input type="checkbox" checked={ask.anon} onChange={event => setAsk({ ...ask, anon: event.target.checked })} /></label>
              <button type="button" className={`${css.btn} ${css.primary}`} disabled={!ask.text.trim()} onClick={() => {
                const question: Question = { id: `q${s.seq + 1}`, text: ask.text.trim(), by: view.nick, anon: ask.anon, votes: 0, cat: ask.cat ?? "Lainnya", voted: false, mine: true, status: "baru" };
                update(current => ({ seq: current.seq + 1, questions: { ...current.questions, [current.session]: [...(current.questions[current.session] ?? []), question] } }));
                setAsk({ text: "", cat: null, anon: false });
              }}>Kirim pertanyaan</button>
            </section>
            <div className={css.between}><b>Pertanyaan ({list.length})</b><span className={css.note}>Dukungan terbanyak di atas</span></div>
            {list.length ? list.map(question => <div key={question.id} className={`${css.q} ${question.mine ? css.qMine : ""}`}>
              <div><p>{question.text}</p><div className={css.meta}><span>{question.mine ? "Pertanyaanmu" : question.by === "Contoh" ? "Contoh" : question.anon ? "Tanpa nama" : question.by}</span><span>· {question.cat}</span>
                {question.status === "dijawab" && <span className={`${css.st} ${css.stOk}`}>Sudah dijawab</span>}{s.presenting === question.id && <span className={`${css.st} ${css.stLive}`}>Sedang dibahas</span>}</div></div>
              <button type="button" className={css.vote} aria-pressed={question.voted} disabled={question.mine} aria-label={`Dukung pertanyaan ini, ${question.votes} dukungan`}
                onClick={() => update(current => ({ questions: { ...current.questions, [current.session]: current.questions[current.session].map(item => item.id === question.id ? { ...item, voted: !item.voted, votes: item.votes + (item.voted ? -1 : 1) } : item) } }))}>
                <span>+1</span><span>{question.votes}</span></button>
            </div>) : <p className={css.note}>Belum ada pertanyaan.</p>}
          </div>,
          footer: view.ceo ? <button type="button" className={css.btn} onClick={() => setSheet("ceo")}>Buka Mode CEO</button> : undefined,
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
            {live ? <div className={css.present}><span className={css.eyebrow}>Di layar sekarang</span><p>{live.text}</p><span>{live.votes} dukungan</span></div>
              : <p className={css.sub}>Pilih pertanyaan untuk ditampilkan di layar meeting.</p>}
            {list.map(question => <div key={question.id} className={css.q}><div><p>{question.text}</p>
              <div className={css.meta}><span>{question.anon || question.by === "Contoh" ? "Tanpa nama" : question.by}</span><span>· {question.cat}</span><span>· {question.votes} dukungan</span></div>
              <div className={css.row}>
                <button type="button" className={`${css.mini} ${s.presenting === question.id ? css.miniLive : ""}`} onClick={() => update({ presenting: s.presenting === question.id ? null : question.id })}>{s.presenting === question.id ? "Sedang di layar" : "Tampilkan di layar"}</button>
                <button type="button" className={`${css.mini} ${question.status === "dijawab" ? css.miniOn : ""}`} onClick={() => answered(question.id)}>{question.status === "dijawab" ? "Sudah dijawab" : "Tandai sudah dijawab"}</button>
              </div></div></div>)}
          </div>,
          footer: <button type="button" className={css.btn} onClick={() => setSheet("session")}>Kembali ke tampilan peserta</button>,
        };
      }
      default: return null;
    }
  }

  if (!inBrowser) return <div className={css.phone}><p className={css.note} role="status">Memuat misi perjalanan…</p></div>;
  const open = sheetBody();
  const missionSub: Record<MissionKey, string> = {
    kal: s.done.kal ? "Kalimatmu sudah tersusun" : view.sentences.length > 1 ? "±10 menit · 2 kalimat untuk 2 departemenmu" : "±5 menit · kalimat departemenmu",
    sig: s.done.sig ? "Jawabanmu sudah terkirim" : "±2 menit · dua pertanyaan",
    pes: s.done.pes ? "Terkirim ke BoD" : "±3 menit · dibaca BoD",
  };
  const firstSession = agendaSession("s1")!;

  return <div className={`${css.phone} ${s.arrived ? "" : css.withDock}`}>
    <header className={css.appbar}>
      <span className={css.who}>Misi Perjalanan · {view.role} · {view.nick}</span>
      <MissionRoad percent={percent} missions={missions.length} done={doneCount} arrived={s.arrived} launched />
    </header>

    <main className={css.screen}>
      {arrivedCard()}
      {!s.arrived && hod && mystery(false)}

      <section className={css.stack} aria-labelledby="misi-judul">
        <h2 id="misi-judul" className={css.glabel}>Misi di perjalanan · {doneCount} dari {missions.length}</h2>
        {missions.map(key => { const { title, Icon } = MISSION_TEXT[key]; return <Row key={key} icon={<Icon aria-hidden />} title={title} sub={missionSub[key]} done={s.done[key]}
          onOpen={() => s.done[key] ? setToast("Misi ini sudah selesai") : setSheet(key)} />; })}
        {view.role === "BoD" && <Row icon={<Mail aria-hidden />} title="Pesan HoD untuk 2027" sub="Khusus BoD" onOpen={() => setSheet("bod")} />}
      </section>

      <section className={css.stack} aria-labelledby="tanya-judul">
        <h2 id="tanya-judul" className={css.glabel}>Sebelum sesi {firstSession.t}</h2>
        <Row icon={<MessageCircleQuestion aria-hidden />} title="Tanya CEO" sub={`${firstSession.title} · ${s.questions.s1?.length ?? 0} pertanyaan masuk`} onOpen={() => openSession("s1")} />
      </section>

      <section className={css.stack} aria-labelledby="agenda-judul">
        <h2 id="agenda-judul" className={css.glabel}>Agenda · The Villa Cangkringan, 24–28 Nov</h2>
        <p className={css.note}>Ketuk sesi meeting untuk membaca topiknya dan mengirim pertanyaan ke CEO.</p>
        {AGENDA.map(day => <div key={day.day} className={css.stack}><p className={css.day}>{day.day}</p>{day.items.map(item => item.id
          ? <button key={item.id} type="button" className={css.agendaItem} onClick={() => openSession(item.id!)}>
              <time>{item.t}</time><span><b>{item.title}</b><small>{item.t}–{item.end} · {s.questions[item.id!]?.length ?? 0} pertanyaan</small></span><ChevronRight className={css.chev} aria-hidden /></button>
          : <div key={item.title + item.t} className={`${css.agendaItem} ${css.plain}`}><time>{item.t}</time><span><b>{item.title}</b><small>{item.desc}</small></span><span /></div>)}</div>)}
      </section>
    </main>

    <footer className={css.foot}>
      <span>Prototipe · tersimpan di perangkat ini.</span>
      <a href={detailHref}>Detail sesi</a>
      <button type="button" onClick={() => { if (window.confirm("Ulangi demo dari awal? Progres di perangkat ini dihapus.")) { setS(fresh(view)); close(); setToast("Demo diulang"); } }}>Ulangi demo</button>
    </footer>

    {!s.arrived && <div className={css.dock}>
      <button type="button" className={`${css.btn} ${css.primary}`} onClick={() => setSheet("arrive")}><MapPin aria-hidden className={css.btnIcon} /> Sudah tiba di venue</button>
    </div>}

    {open && <Sheet open onClose={close} title={open.title} subtitle={open.subtitle} footer={open.footer}>{open.body}</Sheet>}
    <div className={`${css.toast} ${toast ? css.toastShow : ""}`} role="status">{toast}</div>
  </div>;
}
