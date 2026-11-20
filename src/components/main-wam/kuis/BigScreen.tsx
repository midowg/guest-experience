"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from "react";
import { ArrowDown, ArrowUp, Ban, Check, Pause, Sparkles, Target, Volume2, Zap } from "lucide-react";
import { PODIUM, PODIUM_LAND_AT, PODIUM_SPIN_AT, boardRequiredBefore, podiumPlaceOpen, podiumState, soalState } from "@/lib/main-wam/kuis/flow";
import { OPTION_LETTERS, captionText, gameElapsed, isPaused, levelLabels, levelMs, secondsText } from "@/lib/main-wam/kuis/rules";
import type { BoardRow, PodiumEntry, QuizLevel, RunView, ScreenSnapshot } from "@/lib/main-wam/kuis/types";
import { cx } from "@/components/main-wam/ui";
import { Confetti } from "./confetti";
import { KuisSound } from "./sound";
import { TokohAvatar } from "./TokohAvatar";
import { useNow, usePoll, useReducedMotion, useServerClock } from "./live";
import css from "./stage.module.css";

/*
 * Kuis live's big screen (rancangan §4, §4a, §6, §7): the lobby where tokoh hop in, the level card, the
 * question with its time bar and how many answered (never the spread while it runs), "Waktu habis!" with a
 * drum, the bars of the spread without the right answer, then the right answer lit with a caption, the
 * scoreboard where rows swap places, and the podium where each winner's tokoh shows first and then turns
 * like a coin, slowing, onto the name. Everything on the server's clock, so the room and every phone play
 * the same moment. Sound here only (Web Audio); "kurangi gerak": no spin, no hops, a fade.
 */

const STAGE_W = 1920;
const STAGE_H = 1080;
const SLOT = 118;
const SPIN_DEG = 6 * 360 + 180;
const fmt = (value: number) => new Intl.NumberFormat("id-ID").format(Math.abs(Math.round(value)));
const plain = (value: number) => (value < 0 ? `−${fmt(value)}` : fmt(value));
const signed = (value: number) => (value > 0 ? `+${fmt(value)}` : value < 0 ? `−${fmt(value)}` : "0");
const levelClass = (level: QuizLevel) => css[`lv${level}`];

const subscribeSize = (change: () => void) => { window.addEventListener("resize", change); return () => window.removeEventListener("resize", change); };
const fitScale = () => Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);

export function BigScreen({ initial, feedUrl, preview }: { initial: ScreenSnapshot; feedUrl: string; preview?: { now: number } }) {
  const clock = useServerClock(initial.serverNow, preview?.now);
  const url = useCallback(() => feedUrl, [feedUrl]);
  const { snap, gone } = usePoll({ initial, url, clock, whole: true, disabled: !!preview });
  const now = useNow(clock.now, 100, !preview);
  const scale = useSyncExternalStore(subscribeSize, fitScale, () => 1);
  const reduced = useReducedMotion();
  const sound = useRef<KuisSound | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const fx = useRef<Confetti | null>(null);
  const run = snap.run;
  const paused = !!run && isPaused(run.pauses);

  useEffect(() => {
    sound.current = new KuisSound();
    if (canvas.current) fx.current = new Confetti(canvas.current, STAGE_W, STAGE_H, 1);
    const unlock = () => { sound.current?.unlock(); window.setTimeout(() => setSoundOn(!!sound.current?.unlocked), 150); };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); sound.current?.stop(); fx.current?.stop(); };
  }, []);

  // Sounds and confetti at the moments of the game, once each.
  const fired = useRef(new Set<string>());
  const once = (key: string, act: () => void) => { if (fired.current.has(key)) return; fired.current.add(key); act(); };
  const soal = run?.phase === "soal" ? soalState(run, now) : null;
  const podium = run && (run.phase === "podium" || run.phase === "selesai") ? podiumState(run, run.winners, now) : null;
  const moment = !run ? "none" : `${run.id}|${run.phase}|${run.index}|${soal?.stage ?? ""}|${run.podiumRevealed}|${podium?.stage ?? ""}|${run.phase === "bersiap" && now - run.phaseAt >= 650 ? "flip" : ""}`;
  useEffect(() => {
    const s = sound.current;
    if (!run || !s || preview) return;
    const key = moment;
    const level = (run.levels[run.index] ?? 1) - 1;
    switch (run.phase) {
      case "lobi": once(`${run.id}:lobby`, () => s.lobby()); break;
      case "bersiap":
        s.stop();
        if (key.endsWith("flip") && (run.index === 0 || run.levels[run.index - 1] !== run.levels[run.index])) once(`${key}`, () => s.level(level));
        break;
      case "soal":
        if (soal?.stage === "hitung") s.stop();
        if (soal?.stage === "jalan") once(`${run.id}:${run.index}:bed`, () => s.bed(level));
        if (soal?.stage === "habis") once(`${run.id}:${run.index}:habis`, () => { s.stop(); s.timeUp(); });
        if (soal?.stage === "sebaran") once(`${run.id}:${run.index}:sebaran`, () => { s.stop(); s.whoosh(); });
        if (soal?.stage === "buka" && snap.spread) once(`${run.id}:${run.index}:buka`, () => {
          const all = snap.captions.some(caption => caption.kind === "semua");
          s.reveal(all);
          if (all && !reduced) fx.current?.rain(240);
        });
        break;
      case "batal": s.stop(); s.cutRoll(); break;
      case "skor": once(`${run.id}:${run.index}:skor`, () => { s.stop(); s.board(); }); break;
      case "podium": s.stop(); if (podium?.stage === "tokoh") once(`${run.id}:${run.podiumRevealed}:drum`, () => s.rollFor(2)); break;
      case "selesai": s.stop(); break;
    }
    // `once` and the sound are stable; the moment says what changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment, snap.spread]);

  // The last five seconds tick (and pulse); Jeda holds every sound.
  const seconds = soal ? Math.ceil(soal.leftMs / 1000) : null;
  useEffect(() => {
    if (!run || !soal || soal.stage !== "jalan" || paused || preview || seconds === null) return;
    if (seconds >= 1 && seconds <= 5) once(`${run.id}:${run.index}:tick:${seconds}`, () => sound.current?.tick(seconds === 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, paused]);
  useEffect(() => { sound.current?.hold(paused); }, [paused]);

  // New tokoh in the lobby: a pop each (at most one every 70 ms).
  const joined = snap.joined?.length ?? 0;
  const lastPop = useRef(0);
  useEffect(() => {
    if (!joined || preview || performance.now() - lastPop.current < 70) return;
    lastPop.current = performance.now();
    sound.current?.pop();
  }, [joined, preview]);

  const view = gone ? <Gone /> : !run || run.phase === "siap" ? <Idle snap={snap} />
    : run.phase === "lobi" ? <Lobby snap={snap} />
      : run.phase === "bersiap" ? <Ready snap={snap} run={run} flipped={now - run.phaseAt >= 650} />
        : run.phase === "soal" ? <Question snap={snap} run={run} now={now} />
          : run.phase === "batal" ? <Canceled snap={snap} run={run} />
            : run.phase === "skor" ? <Board snap={snap} run={run} clock={clock.now} key={`${run.id}:${run.index}`} />
              : <Podium snap={snap} run={run} clock={clock.now} now={now} sound={sound} fx={fx} reduced={reduced} preview={!!preview} />;

  return <div className={css.viewport}>
    <div className={cx(css.canvas, paused && css.isPaused)} style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
      {view}
      <canvas ref={canvas} className={css.fx} aria-hidden="true" />
      {paused && <div className={css.paused} role="status"><div className={css.pauseCard}><Pause size={104} aria-hidden /><div><b>Dijeda</b><span>Waktu berhenti sebentar. MC akan melanjutkan.</span></div></div></div>}
      {!soundOn && !preview && <span className={css.soundChip}><Volume2 size={28} aria-hidden />Klik atau tekan tombol apa saja untuk menyalakan suara</span>}
    </div>
  </div>;
}

function Head({ right }: { right: ReactNode }) {
  return <div className={css.head}>
    <div className={css.brand}><span className={css.mark}><Sparkles size={28} aria-hidden /></span>Kuis live WAM</div>
    <div className={css.chips}>{right}</div>
  </div>;
}

function QuestionChips({ snap, run }: { snap: ScreenSnapshot; run: RunView }) {
  const level = run.levels[run.index];
  return <>
    <span className={cx(css.chip, css.chipLv, levelClass(level))}>{levelLabels[level]}</span>
    <span className={css.chip}>Soal {run.index + 1} dari {run.count}</span>
    <span className={css.chip}>{snap.players} pemain</span>
  </>;
}

function Gone() {
  return <div className={css.view}><Head right={null} /><div className={css.center}><p className={css.centerP}>Layar kuis ini tidak aktif lagi.</p></div></div>;
}

function Idle({ snap }: { snap: ScreenSnapshot }) {
  const count = snap.run?.count;
  return <div className={css.view}>
    <Head right={<span className={css.chip}>Segera dimulai</span>} />
    <div className={css.heroWrap}>
      <div className={css.kicker}>Kuis live WAM</div>
      <h1 className={css.hero}>{snap.quiz.title}</h1>
      <p className={css.lead}>{count ? `${count} soal dari Mudah sampai Sangat sulit. ` : ""}Jawab lewat aplikasi WAM di HP-mu, tampil sebagai tokohmu.</p>
      <div className={css.rules}>
        <div className={cx(css.rule, css.ruleOk)}><b>300–500</b><span>benar, makin cepat makin besar</span></div>
        <div className={cx(css.rule, css.ruleBad)}><b>−100</b><span>salah</span></div>
        <div className={css.rule}><b>0</b><span>tidak menjawab</span></div>
      </div>
    </div>
  </div>;
}

function Lobby({ snap }: { snap: ScreenSnapshot }) {
  const joined = snap.joined ?? [];
  const slots = Math.min(140, Math.max(56, Math.ceil(joined.length / 14) * 14));
  const shown = joined.slice(-slots);
  return <div className={css.view}>
    <Head right={<span className={css.chip}><i className={css.liveDot} />Lobi terbuka</span>} />
    <div className={css.lobby}>
      <div>
        <div className={css.kicker}>Ayo bergabung</div>
        <h1 className={css.lobbyTitle}>{snap.quiz.title}</h1>
        <ol className={css.steps}><li>Buka aplikasi WAM di HP</li><li>Di Beranda, cari kartu Kuis dimulai</li><li>Ketuk&nbsp;<b>Ikut</b></li></ol>
        <div className={css.count}><span className={css.countNum}>{joined.length}</span><span className={css.countLbl}>tokoh sudah bergabung</span></div>
        <div className={css.ticker}>{joined.slice(-4).reverse().map((alias, i) => <div className={css.tick} key={`${joined.length - i}`}><TokohAvatar alias={alias} size={44} /><span>{alias.name} bergabung</span></div>)}</div>
      </div>
      <div className={css.grid}>
        {Array.from({ length: slots }, (_, i) => <div className={css.slot} key={i}>{shown[i] && <span className={css.hop}><TokohAvatar alias={shown[i]} size={64} /></span>}</div>)}
      </div>
    </div>
  </div>;
}

function LevelFace({ level, index, count }: { level: QuizLevel; index: number; count: number }) {
  return <><div className={css.lvKicker}>Soal {index + 1} dari {count}</div><div className={css.lvName}>{levelLabels[level]}</div><div className={css.lvMeta}>{levelMs(level) / 1000} detik per soal · benar 300–500</div></>;
}

function Ready({ snap, run, flipped }: { snap: ScreenSnapshot; run: RunView; flipped: boolean }) {
  const level = run.levels[run.index];
  const previous = run.index > 0 ? run.levels[run.index - 1] : null;
  const turns = run.index === 0 || previous !== level;
  return <div className={css.view}>
    <Head right={<QuestionChips snap={snap} run={run} />} />
    <div className={css.ready}>
      <div className={cx(css.flip, (!turns || flipped) && css.flipped)}>
        <div className={css.flipInner}>
          <div className={cx(css.face, css.front, previous && turns ? levelClass(previous) : !turns ? levelClass(level) : undefined)}>
            {turns && !previous ? <><div className={css.lvKicker}>{run.count} soal</div><div className={css.lvName}>Siap?</div><div className={css.lvMeta}>Mudah, Sedang, Sulit, lalu Sangat sulit</div></>
              : <LevelFace level={turns && previous ? previous : level} index={run.index} count={run.count} />}
          </div>
          <div className={cx(css.face, css.back, levelClass(level))}><LevelFace level={level} index={run.index} count={run.count} /></div>
        </div>
      </div>
      <div className={css.readyQ}>Soal {run.index + 1} dari {run.count}</div>
      <div className={css.readySub}>Bersiap. Makin cepat menjawab, makin besar nilainya.</div>
    </div>
  </div>;
}

function Question({ snap, run, now }: { snap: ScreenSnapshot; run: RunView; now: number }) {
  const state = soalState(run, now);
  const question = snap.question;
  const hot = state.stage === "jalan" && state.leftMs <= 5_000;
  const spread = snap.spread;
  const bars = (state.stage === "sebaran" || state.stage === "buka") && !!spread;
  const lit = state.stage === "buka" && question?.correct !== null && question?.correct !== undefined;
  const answered = snap.answered ?? 0;
  if (state.stage === "hitung" || !question) {
    return <div className={css.view}>
      <Head right={<QuestionChips snap={snap} run={run} />} />
      <div className={css.center}>
        <div className={css.kicker}>Soal {run.index + 1} dibuka dalam</div>
        <div className={css.countdown} key={Math.ceil(state.countdownMs / 1000)}>{Math.max(1, Math.ceil(state.countdownMs / 1000))}</div>
      </div>
    </div>;
  }
  const strong = snap.captions[0];
  const second = snap.captions[1];
  const correctShare = spread && question.correct !== null ? spread.percents[question.correct] : 0;
  return <div className={cx(css.view)}>
    <Head right={<QuestionChips snap={snap} run={run} />} />
    <div className={css.qrow}>
      <h2 className={css.qtext}>{question.body}</h2>
      <div className={cx(css.sec, hot && css.secHot)}>{Math.ceil(state.leftMs / 1000)}</div>
    </div>
    <div className={cx(css.timer, hot && css.timerHot)}><i style={{ transform: `scaleX(${state.leftMs / state.durMs})` }} /></div>
    <div className={css.opts} style={{ opacity: state.stage === "habis" ? 0.55 : 1 }}>
      {question.options.map((text, i) => <div key={i} className={cx(css.opt, css[`opt${i}`], lit && question.correct === i && css.ok, lit && question.correct !== i && css.no)}
        style={{ "--kz-fill": bars && spread!.answered ? spread!.counts[i] / spread!.answered : 0 } as CSSProperties}>
        <div className={css.bar} />
        <span className={css.letter}>{OPTION_LETTERS[i]}</span>
        <span className={css.otext}>{text}</span>
        {lit && question.correct === i && <span className={css.okmark}><Check size={44} strokeWidth={3} aria-label="Jawaban benar" /></span>}
        {bars && <span className={css.pct}><b>{spread!.percents[i]}%</b><small>{spread!.counts[i]} orang</small></span>}
      </div>)}
    </div>
    <div className={css.foot}>
      {(state.stage === "jalan" || state.stage === "habis") && <div className={css.live}>
        <div className={css.ans}><b>{answered}</b> dari {snap.players} sudah menjawab</div>
        <div className={css.ansbar}><i style={{ transform: `scaleX(${snap.players ? answered / snap.players : 0})` }} /></div>
      </div>}
      {state.stage === "sebaran" && spread && <div className={css.spreadLine}><b>{spread.answered}</b> menjawab · {spread.none}&nbsp;tidak menjawab</div>}
      {lit && spread && <div className={css.capt}>
        <div>
          <div className={cx(css.captH, strong && strong.kind !== "kosong" && css.captHot)}>{strong ? captionText(strong) : `${correctShare}% menjawab benar`}</div>
          <div className={css.captS}>{second ? captionText(second) : strong && strong.kind !== "sedikit" && strong.kind !== "kosong" ? `${correctShare}% menjawab benar` : `Jawaban benar: ${OPTION_LETTERS[question.correct!]}, ${question.options[question.correct!]}`}</div>
        </div>
        <div className={css.captR}>
          {snap.fastest && <div className={css.fast}><TokohAvatar alias={snap.fastest.alias} size={60} /><Zap size={30} className={css.bolt} aria-hidden /><span>Tercepat: <b>{snap.fastest.alias.name}</b> · {secondsText(snap.fastest.ms)} detik</span></div>}
          <div className={css.captN}>{spread.answered} menjawab · {spread.none} tidak menjawab</div>
        </div>
      </div>}
    </div>
    {state.stage === "habis" && <div className={css.overlayCard}>Waktu habis!</div>}
  </div>;
}

function Canceled({ snap, run }: { snap: ScreenSnapshot; run: RunView }) {
  return <div className={css.view}>
    <Head right={<QuestionChips snap={snap} run={run} />} />
    <div className={css.center}>
      <div className={css.centerIcon}><Ban size={64} aria-hidden /></div>
      <h2 className={css.centerH}>Soal {run.index + 1} dibatalkan</h2>
      <p className={css.centerP}>Soal ini tidak dinilai. Nilai semua pemain tetap seperti sebelum soal ini.</p>
    </div>
  </div>;
}

/** A number counting from `from` to `to` (ms of `duration`) once `start` (a real time) has come. */
function CountTo({ from, to, start, duration, clock }: { from: number; to: number; start: number; duration: number; clock: () => number }) {
  const [value, setValue] = useState(from);
  useEffect(() => {
    let frame = 0;
    const step = () => {
      const p = Math.max(0, Math.min(1, (clock() - start) / duration));
      setValue(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [from, to, start, duration, clock]);
  return <>{plain(value)}</>;
}

function Board({ snap, run, clock }: { snap: ScreenSnapshot; run: RunView; clock: () => number }) {
  const rows: BoardRow[] = snap.board ?? [];
  const hadBoard = rows.some(row => row.fromRank !== null);
  const delay = hadBoard ? 900 : 300;
  const [go, setGo] = useState(false);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const wait = Math.max(0, run.phaseAt + delay - clock());
    let frame = 0;
    const first = window.setTimeout(() => { frame = requestAnimationFrame(() => setGo(true)); }, wait);
    const later = window.setTimeout(() => setSettled(true), wait + 1_000);
    return () => { window.clearTimeout(first); window.clearTimeout(later); cancelAnimationFrame(frame); };
  }, [run.phaseAt, delay, clock]);
  const last = run.index === run.count - 1;
  const sub = run.index >= run.count - 1 || run.levels[run.index + 1] !== run.levels[run.index]
    ? `Setelah babak ${levelLabels[run.levels[run.index]]} · ${run.index + 1} dari ${run.count} soal` : `Setelah soal ${run.index + 1} dari ${run.count}`;
  return <div className={css.view}>
    <Head right={<span className={css.chip}>{snap.players} pemain</span>} />
    <div className={css.board}>
      <h2 className={css.boardTitle}>Papan skor</h2>
      <div className={css.boardSub}>{sub} · 5 besar</div>
      <div className={css.rows}>
        {[0, 1, 2, 3, 4].map(i => <div key={i} className={cx(css.rk, i === 0 && css.rk1)} style={{ top: i * SLOT }}>{i + 1}</div>)}
        {rows.map((row, i) => {
          const from = row.fromRank !== null ? Math.min(row.fromRank - 1, 5) : 5;
          const to = Math.min(row.rank - 1, 5);
          const at = go ? to : from;
          const moved = row.fromRank !== null ? row.fromRank - row.rank : 0;
          const delta = row.total - row.fromTotal;
          return <div key={row.key} className={css.row} style={{ transform: `translateY(${at * SLOT + (hadBoard || go ? 0 : 40)}px)`, opacity: at < 5 ? 1 : 0, transitionDelay: hadBoard ? "0ms" : `${i * 120}ms` }}>
            <TokohAvatar alias={row.alias} size={72} />
            <div className={css.rowName}><div className={css.rowN}>{row.alias.name}</div><div className={css.rowP}>{row.alias.persona || "Belum punya kartu"}</div></div>
            {settled && hadBoard && moved > 0 && (row.fromRank! > 5 ? <span className={cx(css.move, css.mvNew)}><ArrowUp size={22} aria-hidden />Masuk 5 besar</span> : <span className={cx(css.move, css.mvUp)}><ArrowUp size={22} aria-hidden />Naik {moved}</span>)}
            {settled && hadBoard && moved < 0 && <span className={cx(css.move, css.mvDown)}><ArrowDown size={22} aria-hidden />Turun {-moved}</span>}
            <span className={cx(css.delta, delta < 0 && css.deltaNeg)}>{settled && delta ? signed(delta) : ""}</span>
            <span className={css.score}>{go ? <CountTo from={row.fromTotal} to={row.total} start={run.phaseAt + delay} duration={1_000} clock={clock} /> : plain(row.fromTotal)}</span>
          </div>;
        })}
      </div>
      {!last && boardRequiredBefore(run.levels, run.index + 1) && <div className={css.teaser}><Target size={36} aria-hidden /><span>Berikutnya babak akhir: <b>Sangat sulit</b>, {levelMs(4) / 1000} detik per soal. Nilainya sama, urutan masih bisa berubah.</span></div>}
    </div>
  </div>;
}

/** The coin: 6.5 turns on its upright axis, slowing (ease-out), stopping on the name side, then a damped wobble. */
function coinPose(t: number) {
  if (t < PODIUM.spin) {
    const p = Math.max(0, t) / PODIUM.spin;
    return { ry: SPIN_DEG * (1 - Math.pow(1 - p, 3)), rx: 0, lift: Math.sin(Math.PI * Math.min(1, p * 1.2)) * 36 };
  }
  const w = (t - PODIUM.spin) / 1000;
  const damp = Math.exp(-4.2 * w);
  return { ry: SPIN_DEG + 10 * damp * Math.sin(w * Math.PI * 2 * 2.6), rx: 7 * damp * Math.sin(w * Math.PI * 2 * 3.3), lift: 0 };
}

function Podium({ snap, run, clock, now, sound, fx, reduced, preview }: {
  snap: ScreenSnapshot; run: RunView; clock: () => number; now: number; sound: RefObject<KuisSound | null>; fx: RefObject<Confetti | null>; reduced: boolean; preview: boolean;
}) {
  const entries: PodiumEntry[] = snap.podium ?? [];
  const winners = run.winners;
  const state = podiumState(run, winners, now);
  const all = run.phase === "selesai" || (run.podiumRevealed >= winners && state.done);
  const coins = useRef(new Map<number, HTMLDivElement>());
  const cards = useRef(new Map<number, HTMLDivElement>());
  const opening = run.phase === "podium" ? state.opening : null;

  // The coin of the place being opened: driven every frame by the game clock (it stops during Jeda).
  useEffect(() => {
    if (!opening || reduced) return;
    const coin = coins.current.get(opening);
    if (!coin) return;
    let frame = 0;
    let half = 0;
    let landed = false;
    const step = () => {
      const t = gameElapsed(run.phaseAt, run.pauses, clock()) - PODIUM_SPIN_AT;
      if (t <= 0) { coin.style.transform = "none"; frame = requestAnimationFrame(step); return; }
      const pose = coinPose(t);
      coin.style.transform = `translateY(${-pose.lift}px) rotateX(${pose.rx}deg) rotateY(${pose.ry}deg)`;
      const turn = Math.floor((pose.ry + 90) / 180);
      if (t < PODIUM.spin && turn > half) { half = turn; if (!preview) sound.current?.coinTick(t / PODIUM.spin); }
      if (!landed && t >= PODIUM.spin) {
        landed = true;
        if (!preview) { sound.current?.ding(); sound.current?.winner(opening); }
        const card = cards.current.get(opening);
        if (card && !preview) {
          const box = card.getBoundingClientRect();
          const stage = card.closest(`.${css.canvas}`)!.getBoundingClientRect();
          const k = stage.width / STAGE_W;
          fx.current?.burst((box.left - stage.left + box.width / 2) / k, (box.top - stage.top + box.height * 0.4) / k, opening === 1 ? 220 : 140, { speed: 1300, size: 16, spread: Math.PI * 0.8, gravity: 1500, life: 3 });
          if (opening === 1) fx.current?.rain(260);
        }
      }
      if (t < PODIUM.spin + PODIUM.settle) frame = requestAnimationFrame(step);
      else coin.style.transform = `rotateY(${SPIN_DEG}deg)`;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [opening, run.phaseAt, run.pauses, clock, reduced, sound, fx, preview]);

  const column = (rank: number) => {
    const entry = entries.find(item => item.rank === rank);
    if (!entry) return null;
    const open = podiumPlaceOpen(run, winners, rank);
    const current = opening === rank;
    const shown = open && (!current || state.g >= PODIUM.lead);
    const settled = open && (!current || state.g >= PODIUM_LAND_AT);
    const name = entry.name ?? "";
    return <div key={rank} className={cx(css.col, css[`r${rank}`])}>
      <div className={cx(css.card, shown && css.cardShown)} ref={node => { if (node) cards.current.set(rank, node); }}>
        <div className={css.coin} ref={node => { if (node) coins.current.set(rank, node); }}
          style={reduced ? undefined : !current && open ? { transform: `rotateY(${SPIN_DEG}deg)` } : undefined}>
          <div className={cx(css.podFace, css.podFront)} style={reduced && settled ? { opacity: 0 } : undefined}>
            <TokohAvatar alias={entry.alias} size={156} />
            <div className={css.podTokoh}>{entry.alias.name}</div>
            <div className={css.podPersona}>{entry.alias.persona || "Belum punya kartu"}</div>
            <div className={css.podScore}>{current ? <CountTo from={0} to={entry.total} start={run.phaseAt + PODIUM.lead} duration={1_800} clock={clock} /> : plain(entry.total)}<small>poin</small></div>
          </div>
          <div className={cx(css.podFace, css.podBack, reduced && css.back2)} style={reduced ? { opacity: settled ? 1 : 0 } : undefined}>
            <span className={css.medal}>Juara {rank}</span>
            <span className={css.initial} aria-hidden="true">{name.slice(0, 1)}</span>
            <div className={css.podName}>{name}</div>
            <div className={css.podMeta}>{entry.alias.name} · {plain(entry.total)} poin</div>
          </div>
        </div>
      </div>
      <div className={css.block}>{rank}</div>
    </div>;
  };

  return <div className={css.view}>
    <Head right={<span className={css.chip}>{snap.players} pemain</span>} />
    <h2 className={css.podTitle}>{all ? "Selamat untuk para juara" : `Juara ${snap.quiz.title}`}</h2>
    <div className={css.podSub}>{all ? "Juara dipanggil ke panggung untuk hadiah. Pemain lain tetap anonim." : "Tokohnya tampil dulu. Siapa di baliknya?"}</div>
    <div className={css.podium}>{[2, 1, 3].map(column)}</div>
  </div>;
}

