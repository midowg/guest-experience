"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowLeft, BarChart3, CalendarDays, Check, HelpCircle, Mail, MessageCircleQuestion, Puzzle, Star } from "lucide-react";
import {
  AGENDA, agendaSession, byVotes, HINT_COUNT, initials, missionsOf, POINTS, QUESTION_CATEGORIES, SAMPLE_QUESTIONS, scrambled,
  sentenceLabel, sentenceRight, SENTENCES, signalPair, SIGNALS, type MissionKey, type MissionView, type Question,
} from "@/lib/pra-wam/mission";
import css from "./mission.module.css";

/*
 * Misi Perjalanan (prototype, 23 Nov 2026; design: the artifact "Misi Perjalanan WAM"). One screen
 * at a time, like the artifact's phone: Beranda → Launch → Daftar misi (missions, the room mystery,
 * the guess, Tanya CEO for 16.00) → check-in at the venue → the room revealed; Agenda & Tanya CEO
 * in its own tab. A demo: everything is kept on this device (localStorage, per account).
 */

type Screen = "home" | "launch" | "hub" | "kal" | "sig" | "pes" | "guess" | "arrive" | "reveal" | "done" | "bod" | "agenda" | "session" | "ceo";
type Agree = { ac: string | null; lampu: string | null; alarm: string | null };
type State = {
  screen: Screen; launched: boolean; done: Record<MissionKey, boolean>; hints: number; points: number;
  kalIdx: number; pool: number[]; answer: number[]; tries: number;
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
    screen: "home", launched: false, done: { kal: false, sig: false, pes: false }, hints: 0, points: 0,
    kalIdx: 0, pool: view.sentences.length ? scrambled(view.sentences[0]) : [], answer: [], tries: 0,
    signal: {}, message: "", guess: [], guessSaved: false, arrived: false, change: "", agree: { ac: null, lampu: null, alarm: null }, agreed: false,
    session: "s1", questions, presenting: null, seq,
  };
}

const AGREEMENT: [keyof Agree, string, string[]][] = [["ac", "Suhu AC", ["22°", "24°", "26°"]], ["lampu", "Lampu dimatikan", ["22.00", "23.00", "24.00"]], ["alarm", "Alarm pagi", ["05.30", "06.00", "06.30"]]];

export function MissionJourney({ view, detailHref }: { view: MissionView; detailHref: string }) {
  const storage = `wam-misi-${view.employeeId}`;
  // Drawn in the browser only: the demo's place is on this device, read when the state is made.
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);
  const [s, setS] = useState<State>(() => {
    if (typeof window === "undefined") return fresh(view);
    try { const saved = localStorage.getItem(storage); return saved ? { ...fresh(view), ...JSON.parse(saved) as State } : fresh(view); } catch { return fresh(view); }
  });
  const [toast, setToast] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [shake, setShake] = useState(false);
  const [ask, setAsk] = useState({ text: "", cat: null as string | null, anon: false });
  const hod = view.role === "HoD" && !!view.room;
  const missions = useMemo(() => missionsOf(view), [view]);
  const doneCount = missions.filter(item => s.done[item]).length;
  const pair = signalPair(view.employeeId);

  // The demo keeps its place on this device.
  useEffect(() => { try { localStorage.setItem(storage, JSON.stringify(s)); } catch { /* full or blocked: still works */ } }, [s, storage]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 2400); return () => clearTimeout(timer); }, [toast]);

  const go = (screen: Screen) => { setS(current => ({ ...current, screen })); window.scrollTo({ top: 0 }); };
  const update = (patch: Partial<State> | ((current: State) => Partial<State>)) => setS(current => ({ ...current, ...(typeof patch === "function" ? patch(current) : patch) }));
  function complete(mission: MissionKey, points: number, label: string) {
    let opened = false;
    update(current => {
      opened = hod && current.hints < HINT_COUNT;
      return { done: { ...current.done, [mission]: true }, points: current.points + points, hints: opened ? current.hints + 1 : current.hints, screen: "hub" };
    });
    setToast(`${label} selesai · +${points} poin${hod ? " · petunjuk baru terbuka" : ""}`);
  }

  const progress = s.screen === "home" ? 0 : s.screen === "launch" ? 4 : s.arrived ? 100 : Math.min(90, 10 + doneCount * 26);
  const tab = s.screen === "agenda" || s.screen === "session" || s.screen === "ceo" ? "agenda" : "misi";
  const back = (to: Screen, label: string) => <button type="button" className={css.back} onClick={() => go(to)}><ArrowLeft aria-hidden /> {label}</button>;
  const notFor = (text: string) => <><p className={css.eyebrow}>Tidak tersedia</p><h2 className={css.title}>{text}</h2><button type="button" className={css.btn} onClick={() => go("hub")}>Ke daftar misi</button></>;

  /* ---- the room mystery card ---- */
  function mystery(full: boolean) {
    if (!view.room) return null;
    const { mates, code } = view.room;
    const shown = full ? HINT_COUNT : s.hints;
    return <section className={css.mystery} aria-label="Misteri Kamar">
      <div className={css.between}><span className={css.eyebrow}>Misteri Kamar</span><span className={`${css.tag} ${css.tagGold}`}>{shown}/{HINT_COUNT} petunjuk</span></div>
      <div className={css.digits}><span className={css.lbl}>Kamar</span>
        {full ? <span className={`${css.digit} ${css.digitOn}`}>{code}</span> : <><span className={css.digit}>?</span><span className={css.note}>terungkap saat check-in</span></>}
      </div>
      <div className={css.mates}>{mates.map(mate => <div key={mate.name} className={css.mate}><span className={css.ava} aria-hidden>{full ? initials(mate.name) : "?"}</span>{full ? mate.nick : "???"}</div>)}</div>
      <div className={css.hints}>{Array.from({ length: HINT_COUNT }, (_, at) => at < shown
        ? <div key={at} className={css.hint}><b>Petunjuk {at + 1}</b>{mates.map((mate, index) => <span key={mate.name}>{mates.length > 1 ? `Teman ${index + 1}: ` : ""}{mate.hints[at]}</span>)}</div>
        : <div key={at} className={`${css.hint} ${css.hintLocked}`}><b>Petunjuk {at + 1}</b><span>Terbuka setelah satu misi lagi selesai.</span></div>)}</div>
    </section>;
  }

  /* ---- screens ---- */
  function screen() {
    switch (s.screen) {
      case "home": return <>
        <p className={css.eyebrow}>Khusus HoD, BoD & CoS</p>
        <h1 className={css.title}>Selamat siang, {view.nick}</h1>
        <p className={css.sub}>45 menit dari kantor ke Villa Cangkringan. {hod
          ? <>Selesaikan misi di perjalanan untuk membuka satu rahasia: <b>kamu sekamar dengan siapa?</b></>
          : "Ikuti misi di perjalanan dan kirim pertanyaanmu untuk sesi pertama pukul 16.00."}</p>
        {hod && <section className={css.mystery}><span className={css.eyebrow}>Misteri Kamar</span>
          <div className={css.digits}><span className={css.lbl}>Kamar</span><span className={css.digit}>?</span></div>
          <p className={css.note}>Setiap misi yang selesai membuka satu petunjuk tentang teman sekamarmu. Kode kamar baru terungkap di akhir, setelah check-in di venue.</p></section>}
        <button type="button" className={`${css.btn} ${css.primary} ${css.end}`} onClick={() => go(s.launched ? "hub" : "launch")}>Masuk ke misi perjalanan</button>
      </>;
      case "launch": return s.launched ? <>
        <p className={css.eyebrow}>Misi terbuka</p><div className={css.count}>GO</div>
        <button type="button" className={`${css.btn} ${css.primary}`} onClick={() => go("hub")}>Lihat daftar misi</button>
      </> : <>
        <p className={css.eyebrow}>Menunggu aba-aba</p><h1 className={css.title}>Siap meluncur</h1>
        <p className={css.sub}>Saat acara, misi terbuka bersamaan setelah CEO menekan Launch. Di prototipe ini kamu yang menekannya.</p>
        <div className={css.count} aria-live="polite">{count ?? 3}</div>
        <button type="button" className={`${css.btn} ${css.primary}`} disabled={count !== null} onClick={() => {
          let left = 3; setCount(left);
          const timer = setInterval(() => {
            left -= 1;
            if (left > 0) { setCount(left); return; }
            clearInterval(timer); setCount(null);
            update(current => ({ launched: true, points: current.points + POINTS.launch, screen: "hub" })); setToast("Misi terbuka!");
          }, 700);
        }}>Launch</button>
      </>;
      case "hub": {
        const item = (key: MissionKey, title: string, sub: string, Icon: typeof Puzzle) => {
          const finished = s.done[key];
          return <button key={key} type="button" className={`${css.mission} ${finished ? css.missionDone : ""}`} aria-disabled={finished}
            onClick={() => finished ? setToast("Misi ini sudah selesai") : go(key)}>
            <span className={css.ic}>{finished ? <Check aria-hidden /> : <Icon aria-hidden />}</span>
            <span><b>{title}</b><small>{sub}</small></span>
            <span className={`${css.tag} ${finished ? css.tagOk : ""}`}>{finished ? "Selesai" : "Mulai"}</span>
          </button>;
        };
        const guessNames = view.room?.others.filter(person => s.guess.includes(person.id)).map(person => person.name.split(" ")[0]).join(" & ");
        return <>
          <p className={css.eyebrow}>Di perjalanan · {doneCount} dari {missions.length} misi</p>
          {hod && mystery(false)}
          {view.role === "BoD" && <button type="button" className={css.mission} onClick={() => go("bod")}>
            <span className={css.ic}><Mail aria-hidden /></span><span><b>Pesan HoD untuk 2027</b><small>Khusus BoD</small></span><span className={`${css.tag} ${css.tagGold}`}>Baca</span></button>}
          <p className={css.glabel}>Misi</p>
          {missions.includes("kal") && item("kal", "Susun Kalimatmu", view.sentences.length > 1 ? "±10 menit · 2 kalimat untuk 2 departemenmu" : "±5 menit · kalimat departemenmu", Puzzle)}
          {item("sig", "Future Signal", "±2 menit · dua pertanyaan", BarChart3)}
          {missions.includes("pes") && item("pes", "Pesan untuk 2027", "±3 menit · dibaca BoD", Mail)}
          {hod && !s.arrived && <button type="button" className={css.mission} onClick={() => go("guess")}>
            <span className={css.ic}><HelpCircle aria-hidden /></span>
            <span><b>{s.guessSaved ? "Ubah tebakan" : "Tebak teman sekamar"}</b><small>{s.guessSaved ? `Tebakanmu: ${guessNames}` : "Bisa kapan saja, ada bonus poin"}</small></span>
            <span className={`${css.tag} ${css.tagGold}`}>{s.guessSaved ? "Tersimpan" : "Tebak"}</span></button>}
          <p className={css.glabel}>Sebelum sesi 16.00</p>
          <button type="button" className={css.mission} onClick={() => { update({ session: "s1" }); go("session"); }}>
            <span className={css.ic}><MessageCircleQuestion aria-hidden /></span><span><b>Tanya CEO</b><small>Business Overview & Evaluation · kirim sebelum tiba</small></span>
            <span className={`${css.tag} ${css.tagGold}`}>{s.questions.s1?.length ?? 0} tanya</span></button>
          {s.arrived
            ? <button type="button" className={`${css.btn} ${css.primary}`} onClick={() => go(hod ? "reveal" : "done")}>{hod ? "Lihat kamarku" : "Lihat ringkasan"}</button>
            : <button type="button" className={`${css.btn} ${css.end}`} onClick={() => go("arrive")}>Sudah tiba di venue</button>}
        </>;
      }
      case "kal": {
        if (!view.sentences.length) return notFor("Belum ada kalimat untuk akun ini");
        if (s.done.kal) return notFor("Misi ini sudah selesai");
        const number = view.sentences[s.kalIdx];
        const pieces = SENTENCES[number] ?? [];
        const multi = view.sentences.length > 1;
        const place = (piece: number) => {
          const answer = [...s.answer, piece];
          update({ pool: s.pool.filter(item => item !== piece), answer });
          if (answer.length < pieces.length) return;
          const tries = s.tries + 1;
          if (!sentenceRight(answer, number)) { update({ tries }); setShake(true); setTimeout(() => setShake(false), 450); setToast("Belum pas. Coba ubah urutannya"); return; }
          setTimeout(() => {
            if (s.kalIdx < view.sentences.length - 1) {
              const next = view.sentences[s.kalIdx + 1];
              update(current => ({ kalIdx: current.kalIdx + 1, pool: scrambled(next), answer: [], tries: 0, points: current.points + POINTS.sentencePart }));
              setToast("Kalimat pertama selesai · lanjut kalimat kedua");
            } else {
              update({ answer: [], tries: 0 });
              complete("kal", tries === 1 ? POINTS.sentenceFirstTry : POINTS.sentence, "Susun Kalimat");
            }
          }, 600);
        };
        const right = s.answer.length === pieces.length && sentenceRight(s.answer, number);
        return <>
          {back("hub", "Daftar misi")}
          <p className={css.eyebrow}>Kalimat nomor {sentenceLabel(number)}{multi ? ` · ${s.kalIdx + 1} dari ${view.sentences.length}` : ""}</p>
          <h1 className={css.title}>Susun Kalimatmu</h1>
          <p className={css.sub}>{multi ? "Kamu memegang dua departemen, jadi ada dua kalimat yang perlu disusun. " : "Kalimat ini mewakili departemenmu. "}Ketuk potongan sesuai urutan yang benar, dan ketuk lagi untuk mengembalikan.</p>
          <div className={`${css.answer} ${shake ? css.shake : ""} ${right ? css.win : ""}`} role="group" aria-label="Susunan kalimat">
            {s.answer.map(piece => <button key={piece} type="button" className={`${css.tile} ${css.tileIn}`} onClick={() => update({ answer: s.answer.filter(item => item !== piece), pool: [...s.pool, piece] })}>{pieces[piece]}</button>)}
          </div>
          <div className={css.pool} role="group" aria-label="Potongan kalimat">
            {s.pool.map(piece => <button key={piece} type="button" className={css.tile} onClick={() => place(piece)}>{pieces[piece]}</button>)}
          </div>
          <div className={`${css.row} ${css.end}`}>
            <button type="button" className={css.btn} onClick={() => { const all = [...s.pool, ...s.answer].filter(item => item !== 0); update({ answer: [0], pool: all }); setToast("Potongan pertama sudah dipasang"); }}>Bantuan</button>
            <button type="button" className={css.btn} onClick={() => update({ pool: [...s.pool, ...s.answer], answer: [] })}>Ulangi</button>
          </div>
        </>;
      }
      case "sig": {
        if (s.done.sig) return notFor("Misi ini sudah selesai");
        const ready = !!s.signal[0] && !!s.signal[1];
        return <>
          {back("hub", "Daftar misi")}
          <p className={css.eyebrow}>Dua pertanyaan untukmu</p><h1 className={css.title}>Future Signal</h1>
          <p className={css.sub}>Pertanyaanmu berbeda dengan peserta lain. Hasil gabungannya tampil di sesi 16.00.</p>
          {pair.map((index, at) => <section key={index} className={css.card}><b>{SIGNALS[index].q}</b>
            <div className={css.chips} role="group" aria-label={SIGNALS[index].q}>{SIGNALS[index].o.map(option =>
              <button key={option} type="button" className={css.chip} aria-pressed={s.signal[at] === option} onClick={() => update(current => ({ signal: { ...current.signal, [at]: option } }))}>{option}</button>)}</div>
          </section>)}
          <button type="button" className={`${css.btn} ${css.primary} ${css.end}`} disabled={!ready} onClick={() => complete("sig", POINTS.signal, "Future Signal")}>Kirim jawaban</button>
        </>;
      }
      case "pes":
        if (view.role === "BoD") return notFor("Misi ini untuk HoD dan CoS");
        if (s.done.pes) return notFor("Misi ini sudah selesai");
        return <>
          {back("hub", "Daftar misi")}
          <p className={css.eyebrow}>Satu kalimat</p><h1 className={css.title}>Pesan untuk 2027</h1>
          <p className={css.sub}>Tulis satu harapan atau komitmenmu untuk 2027.</p>
          <section className={css.card}><b>Siapa yang membaca?</b><p className={css.note}>Pesan ini dibaca BoD bersama namamu, lalu dibuka bersama di Final Wrap-Up hari Sabtu.</p></section>
          <label className={css.field}>Pesanmu
            <textarea maxLength={160} value={s.message} placeholder="Contoh: Di 2027 saya ingin timku lebih berani mencoba hal baru." onChange={event => update({ message: event.target.value })} />
          </label>
          <span className={css.note}>{s.message.length}/160</span>
          <button type="button" className={`${css.btn} ${css.primary} ${css.end}`} disabled={!s.message.trim()} onClick={() => complete("pes", POINTS.message, "Pesan untuk 2027")}>Kirim ke BoD</button>
        </>;
      case "guess": {
        if (!hod || !view.room) return notFor("Tebak teman sekamar hanya untuk HoD");
        if (s.arrived) return notFor("Kamu sudah check-in, kamarmu sudah terbuka");
        const need = view.room.mates.length;
        return <>
          {back("hub", "Daftar misi")}
          <p className={css.eyebrow}>Bonus poin kalau benar</p><h1 className={css.title}>Tebak teman sekamar</h1>
          <p className={css.sub}>Pilih {need} HoD yang kamu kira sekamar denganmu. Tebakan bisa diubah sampai kamu tiba di venue.</p>
          {s.hints > 0 ? <div className={css.hints}>{Array.from({ length: s.hints }, (_, at) => <div key={at} className={css.hint}><b>Petunjuk {at + 1}</b>
            {view.room!.mates.map((mate, index) => <span key={mate.name}>{need > 1 ? `Teman ${index + 1}: ` : ""}{mate.hints[at]}</span>)}</div>)}</div>
            : <p className={css.note}>Belum ada petunjuk. Selesaikan misi untuk membuka petunjuk, atau tebak sekarang.</p>}
          <div className={css.picks}>{view.room.others.map(person => <button key={person.id} type="button" className={css.pick} aria-pressed={s.guess.includes(person.id)} onClick={() => {
            if (s.guess.includes(person.id)) update(current => ({ guess: current.guess.filter(id => id !== person.id) }));
            else if (s.guess.length < need) update(current => ({ guess: current.guess.length < need ? [...current.guess, person.id] : current.guess }));
            else setToast(`Pilih ${need} orang saja`);
          }}><i aria-hidden>{initials(person.name)}</i>{person.name}</button>)}</div>
          <button type="button" className={`${css.btn} ${css.primary}`} disabled={s.guess.length !== need} onClick={() => { update({ guessSaved: true, screen: "hub" }); setToast("Tebakan disimpan. Masih bisa diubah sampai tiba."); }}>Simpan tebakan</button>
        </>;
      }
      case "arrive":
        if (s.arrived) return notFor("Kamu sudah check-in");
        return <>
          <p className={css.eyebrow}>Villa Cangkringan</p><h1 className={css.title}>Selamat datang, {view.nick}</h1>
          <section className={css.card}><p>Data dari kuesionermu sudah kami terima: kontak darurat, makanan, dan ukuran kaos. Tidak perlu diisi ulang.</p>
            <label className={css.field}>Ada data yang berubah? (opsional)<input type="text" value={s.change} placeholder="Contoh: ukuran kaos jadi L" onChange={event => update({ change: event.target.value })} /></label></section>
          <button type="button" className={`${css.btn} ${css.primary} ${css.end}`} onClick={() => {
            const right = hod && s.guessSaved && view.room!.mates.every(mate => s.guess.includes(keyOf(mate.name)));
            update(current => ({ arrived: true, hints: HINT_COUNT, points: current.points + POINTS.arrive + (right ? POINTS.guessRight : 0), screen: hod ? "reveal" : "done" }));
            setToast("Check-in berhasil");
          }}>Saya sudah tiba</button>
        </>;
      case "reveal": {
        if (!hod || !view.room) return notFor("Reveal kamar hanya untuk HoD");
        if (!s.arrived) return notFor("Kamar terbuka setelah check-in di venue");
        const { mates, code, self } = view.room;
        const right = s.guessSaved && mates.every(mate => s.guess.includes(keyOf(mate.name)));
        const rhythm = (nick: string, sleep: string | null, wake: string | null, you = false) => <div key={nick}><span>{nick}{you ? " (kamu)" : ""}</span><span>Tidur {sleep ?? "belum ada data"}</span><span>Bangun {wake ?? "–"}</span></div>;
        const ready = !!(s.agree.ac && s.agree.lampu && s.agree.alarm);
        return <>
          <p className={css.eyebrow}>Check-in berhasil</p><div className={css.big}>Kamar {code}</div>
          {mystery(true)}
          <section className={css.card}><span className={css.eyebrow}>Teman sekamarmu</span>{mates.map(mate => <div key={mate.name}><b>{mate.name}</b><div className={css.note}>{mate.dept}</div></div>)}</section>
          {s.guessSaved && <section className={`${css.card} ${css.center}`}><b>{right ? `Tebakanmu benar! +${POINTS.guessRight} poin` : "Tebakanmu belum tepat, tapi sekarang kalian sudah kenalan."}</b></section>}
          <section className={css.card}><span className={css.eyebrow}>Ritme tidur kamar</span><div className={css.rhythm}>{rhythm(view.nick, self.sleep, self.wake, true)}{mates.map(mate => rhythm(mate.nick, mate.sleep, mate.wake))}</div></section>
          {s.agreed ? <section className={css.card}><b>Kesepakatan kamar tersimpan</b><p className={css.note}>AC {s.agree.ac} · lampu mati {s.agree.lampu} · alarm {s.agree.alarm}.</p></section>
            : <section className={css.card}><b>Kesepakatan kamar</b>{AGREEMENT.map(([field, label, options]) => <div key={field}><span className={css.note}>{label}</span>
                <div className={css.chips} role="group" aria-label={label}>{options.map(option => <button key={option} type="button" className={css.chip} aria-pressed={s.agree[field] === option} onClick={() => update(current => ({ agree: { ...current.agree, [field]: option } }))}>{option}</button>)}</div></div>)}
              <button type="button" className={`${css.btn} ${css.primary}`} disabled={!ready} onClick={() => { update(current => ({ agreed: true, points: current.points + POINTS.agree })); setToast("Kesepakatan kamar tersimpan"); }}>Simpan kesepakatan</button></section>}
          <button type="button" className={css.btn} onClick={() => go("done")}>Selesai</button>
        </>;
      }
      case "done": return <>
        <div className={css.big}>Sampai jumpa di sesi 16.00</div>
        <p className={`${css.sub} ${css.center}`}>{s.points} poin terkumpul. Poin ini bertambah selama acara.</p>
        <section className={css.card}><span className={css.eyebrow}>Berikutnya</span>
          {hod && <p>Ambil key card kamar {view.room!.code} di meja panitia.</p>}
          <p>16.00 · Business Overview & Evaluation: kalimat dibacakan berurutan dan pertanyaan Tanya CEO dijawab.</p>
          <p>Sabtu · Final Wrap-Up: Pesan untuk 2027 dibuka bersama.</p></section>
        <button type="button" className={css.btn} onClick={() => go("hub")}>Kembali ke daftar misi</button>
      </>;
      case "bod":
        if (view.role !== "BoD") return notFor("Halaman ini khusus BoD");
        return <>
          {back("hub", "Daftar misi")}
          <p className={css.eyebrow}>Khusus BoD</p><h1 className={css.title}>Pesan HoD untuk 2027</h1>
          <p className={css.sub}>Di prototipe ini pesan belum terkirim antar akun. Saat versi penuh, setiap pesan HoD muncul di sini bersama namanya.</p>
          <div className={css.msg}><p>Di 2027 saya ingin tim berani mencoba satu cara kerja baru setiap kuartal.</p><span className={css.note}>Contoh pesan</span></div>
        </>;
      case "agenda": return <>
        <p className={css.eyebrow}>The Villa Cangkringan · 24–28 Nov</p><h1 className={css.title}>Agenda & Tanya CEO</h1>
        <p className={css.sub}>Baca topik setiap sesi dan kirim pertanyaanmu sebelum sesi dimulai. CEO menjawab langsung saat meeting.</p>
        {AGENDA.map(day => <div key={day.day} className={css.stack}><p className={css.day}>{day.day}</p>{day.items.map(item => item.id
          ? <button key={item.id} type="button" className={css.agendaItem} onClick={() => { update({ session: item.id! }); go("session"); }}>
              <time>{item.t}</time><span><b>{item.title}</b><small>{item.t}–{item.end} · Tanya CEO terbuka</small></span><span className={css.qcount}>{s.questions[item.id!]?.length ?? 0} tanya</span></button>
          : <div key={item.title + item.t} className={`${css.agendaItem} ${css.plain}`}><time>{item.t}</time><span><b>{item.title}</b><small>{item.desc}</small></span><span /></div>)}</div>)}
      </>;
      case "session": {
        const session = agendaSession(s.session);
        if (!session) return notFor("Sesi tidak ditemukan");
        const list = byVotes(s.questions[s.session] ?? []);
        return <>
          {back("agenda", "Agenda")}
          <p className={css.eyebrow}>{session.day} · {session.t}–{session.end}</p><h1 className={css.title}>{session.title}</h1>
          <section className={css.card}><span className={css.eyebrow}>Topik sesi</span><p>{session.desc}</p><p className={css.note}>Pertanyaan ditutup saat sesi dimulai pukul {session.t}.</p></section>
          <section className={css.card}><b>Ajukan pertanyaan ke CEO</b>
            <div className={css.chips} role="group" aria-label="Kategori">{QUESTION_CATEGORIES.map(cat => <button key={cat} type="button" className={css.chip} aria-pressed={ask.cat === cat} onClick={() => setAsk({ ...ask, cat: ask.cat === cat ? null : cat })}>{cat}</button>)}</div>
            <label className={css.field}>Pertanyaanmu<textarea maxLength={200} value={ask.text} placeholder="Tulis pertanyaan yang ingin dijawab CEO di sesi ini" onChange={event => setAsk({ ...ask, text: event.target.value })} /></label>
            <span className={css.note}>{ask.text.length}/200</span>
            <label className={css.switch}>Kirim tanpa nama<input type="checkbox" checked={ask.anon} onChange={event => setAsk({ ...ask, anon: event.target.checked })} /></label>
            <button type="button" className={`${css.btn} ${css.primary}`} disabled={!ask.text.trim()} onClick={() => {
              const question: Question = { id: `q${s.seq + 1}`, text: ask.text.trim(), by: view.nick, anon: ask.anon, votes: 0, cat: ask.cat ?? "Lainnya", voted: false, mine: true, status: "baru" };
              update(current => ({ seq: current.seq + 1, points: current.points + POINTS.ask, questions: { ...current.questions, [current.session]: [...(current.questions[current.session] ?? []), question] } }));
              setAsk({ text: "", cat: null, anon: false }); setToast(`Pertanyaan terkirim · +${POINTS.ask} poin`);
            }}>Kirim pertanyaan</button>
          </section>
          <div className={css.between}><b>Pertanyaan ({list.length})</b><span className={css.note}>Urut dari dukungan terbanyak</span></div>
          {list.length ? list.map(question => <div key={question.id} className={`${css.q} ${question.mine ? css.qMine : ""}`}>
            <div><p>{question.text}</p><div className={css.meta}><span>{question.mine ? "Pertanyaanmu" : question.by === "Contoh" ? "Contoh" : question.anon ? "Tanpa nama" : question.by}</span><span>· {question.cat}</span>
              {question.status === "dijawab" && <span className={`${css.st} ${css.stOk}`}>Sudah dijawab</span>}{question.status === "live" && <span className={`${css.st} ${css.stLive}`}>Sedang dibahas</span>}</div></div>
            <button type="button" className={css.vote} aria-pressed={question.voted} disabled={question.mine} aria-label={`Dukung pertanyaan ini, ${question.votes} dukungan`}
              onClick={() => update(current => ({ questions: { ...current.questions, [current.session]: current.questions[current.session].map(item => item.id === question.id ? { ...item, voted: !item.voted, votes: item.votes + (item.voted ? -1 : 1) } : item) } }))}>
              <span>+1</span><span>{question.votes}</span></button>
          </div>) : <p className={css.note}>Belum ada pertanyaan.</p>}
          {view.ceo && <button type="button" className={css.btn} onClick={() => go("ceo")}>Mode CEO</button>}
        </>;
      }
      case "ceo": {
        const session = agendaSession(s.session);
        if (!view.ceo || !session) return notFor("Mode CEO hanya untuk CEO dan moderator");
        const list = byVotes(s.questions[s.session] ?? []);
        const live = list.find(question => question.id === s.presenting);
        const setStatus = (id: string, change: (item: Question) => Question) => update(current => ({ questions: { ...current.questions, [current.session]: current.questions[current.session].map(item => item.id === id ? change(item) : item) } }));
        return <>
          {back("session", "Tampilan peserta")}
          <p className={css.eyebrow}>Mode CEO / moderator · {session.t}</p><h1 className={css.title}>{session.title}</h1>
          {live ? <div className={css.present}><span className={css.eyebrow}>Di layar sekarang</span><p>{live.text}</p><span>{live.votes} dukungan</span></div>
            : <p className={css.sub}>Pilih pertanyaan untuk ditampilkan di layar meeting.</p>}
          {list.map(question => <div key={question.id} className={css.q}><div><p>{question.text}</p>
            <div className={css.meta}><span>{question.anon || question.by === "Contoh" ? "Tanpa nama" : question.by}</span><span>· {question.cat}</span><span>· {question.votes} dukungan</span></div>
            <div className={css.row}>
              <button type="button" className={`${css.mini} ${s.presenting === question.id ? css.miniLive : ""}`} onClick={() => update({ presenting: s.presenting === question.id ? null : question.id })}>{s.presenting === question.id ? "Sedang di layar" : "Tampilkan di layar"}</button>
              <button type="button" className={`${css.mini} ${question.status === "dijawab" ? css.miniOn : ""}`} onClick={() => setStatus(question.id, item => ({ ...item, status: item.status === "dijawab" ? "baru" : "dijawab" }))}>{question.status === "dijawab" ? "Sudah dijawab" : "Tandai sudah dijawab"}</button>
            </div></div></div>)}
        </>;
      }
    }
  }

  if (!inBrowser) return <div className={css.phone}><p className={css.note} role="status">Memuat misi perjalanan…</p></div>;
  return <div className={css.phone}>
    <header className={css.appbar}>
      <div className={css.between}>
        <span className={css.who}>{view.role} · {view.nick}</span>
        <span className={css.points} aria-live="polite"><Star aria-hidden /> {s.points} poin</span>
      </div>
      <div className={css.route} aria-label={`Posisi perjalanan ${progress} persen`}>
        <span>Kantor</span>
        <div className={css.track}><div className={css.fill} style={{ width: `${progress}%` }} />
          <svg className={css.bus} style={{ left: `${Math.max(4, Math.min(96, progress))}%` }} viewBox="0 0 26 18" aria-hidden="true"><rect x="1" y="1" width="24" height="13" rx="3" fill="currentColor" /><circle cx="7" cy="15" r="2.4" fill="currentColor" /><circle cx="19" cy="15" r="2.4" fill="currentColor" /></svg>
        </div>
        <span>Venue</span>
      </div>
      <nav className={css.tabs} aria-label="Misi Perjalanan">
        <button type="button" aria-current={tab === "misi" ? "page" : undefined} onClick={() => go(s.launched ? "hub" : "home")}><Star aria-hidden /> Misi</button>
        <button type="button" aria-current={tab === "agenda" ? "page" : undefined} onClick={() => go("agenda")}><CalendarDays aria-hidden /> Agenda & Tanya CEO</button>
      </nav>
    </header>
    <main className={css.screen}>{screen()}</main>
    <footer className={css.foot}>
      <span>Prototipe · progres tersimpan di perangkat ini.</span>
      <a href={detailHref}>Detail sesi</a>
      <button type="button" onClick={() => { if (window.confirm("Ulangi demo dari awal? Progres di perangkat ini dihapus.")) { setS(fresh(view)); setToast("Demo diulang"); } }}>Ulangi demo</button>
    </footer>
    <div className={`${css.toast} ${toast ? css.toastShow : ""}`} role="status">{toast}</div>
  </div>;
}
