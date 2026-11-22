"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { ArrowUp, Ban, Check, CloudOff, Flame, Gamepad2, Hourglass, Info, Lock, Pause, Sparkles, Trophy, Tv, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { number } from "@/lib/main-wam/i18n";
import { PODIUM_LAND_AT, boardRequiredBefore, podiumPlaceOpen, podiumState, soalState } from "@/lib/main-wam/kuis/flow";
import { OPTION_LETTERS, correctPoints, isPaused, levelMs } from "@/lib/main-wam/kuis/rules";
import type { Alias, PhoneQuestionView, PlaySnapshot, RunView } from "@/lib/main-wam/kuis/types";
import { mainWamApi, mainWamPath } from "@/lib/routes";
import { useLang, useT } from "@/components/main-wam/i18n";
import { ScreenContent, ShellChrome } from "@/components/main-wam/shell";
import { hasTrail } from "@/components/main-wam/shell/trail";
import { Banner, Button, EmptyState, EyebrowLabel, PulseDot, SrOnly, cx, useToast } from "@/components/main-wam/ui";
import { Confetti } from "./confetti";
import { LevelCard, levelClass, levelKey } from "./LevelCard";
import { TokohAvatar } from "./TokohAvatar";
import { KuisRequestError, kuisRequest, plain, signed, useNow, usePoll, useReducedMotion, useServerClock, vibrate } from "./live";
import css from "./play.module.css";

/*
 * Kuis live on a player's phone (rancangan §4, §4a; prototype revisi 2). Ikut, the lobby with one's tokoh,
 * the level card, a question with the time bar and the value falling from 500 to 300, the tap that locks it
 * ("Terkunci · 437", no right or wrong yet), time up, the spread, then one's result, all on the server's
 * clock so the room reacts at once; the scoreboard with one's place and neighbours; the podium (gold when
 * one wins). Phones are silent: they buzz and move ("kurangi gerak" respected).
 */

/** The four answer shapes (prototipe qA..qD: triangle, diamond, circle, square). Decoration next to the letter, so colour is never the only cue. */
function OptionShape({ index }: { index: number }) {
  const d = ["M12 3 22 20H2Z", "M12 2 22 12 12 22 2 12Z", "", "M4 4h16v16H4Z"][index];
  return <svg className={css.shape} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {index === 2 ? <circle cx="12" cy="12" r="10" fill="currentColor" /> : <path d={d} fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />}
  </svg>;
}

type Lock = { runId: string; index: number; choice: number; value: number };
/** For previews: a fixed moment, no asking. */
export type PlayPreview = { now: number; lock?: { choice: number; value: number } };

const keepLobby = (current: PlaySnapshot, same: PlaySnapshot): PlaySnapshot => ({ ...current, serverNow: same.serverNow, lobby: same.lobby ?? current.lobby });

export function PlayScreen({ quizId, initial, preview }: { quizId: string; initial: PlaySnapshot; preview?: PlayPreview }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const reduced = useReducedMotion();
  const clock = useServerClock(initial.serverNow, preview?.now);
  const url = useCallback((version?: string) => mainWamApi.quiz(quizId, version), [quizId]);
  const { snap, setSnap, failures, gone } = usePoll({ initial, url, clock, keep: keepLobby, disabled: !!preview });
  const now = useNow(clock.now, 100, !preview);
  const [lock, setLock] = useState<Lock | null>(null);
  const [joining, setJoining] = useState(false);
  const fx = useRef<Confetti | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const fmt = useCallback((value: number) => number(lang, value), [lang]);

  const run = snap.run;
  const me = snap.me;
  const paused = !!run && isPaused(run.pauses);
  const answer = run && lock && lock.runId === run.id && lock.index === run.index ? lock
    : preview?.lock ? { ...preview.lock, runId: run?.id ?? "", index: run?.index ?? -1 }
      : me?.answer ? { ...me.answer, runId: run?.id ?? "", index: run?.index ?? -1 } : null;

  useEffect(() => {
    if (!canvas.current || preview) return;
    fx.current = new Confetti(canvas.current, window.innerWidth, window.innerHeight);
    return () => fx.current?.stop();
  }, [preview]);

  async function join() {
    if (!run || joining) return;
    setJoining(true);
    vibrate(20);
    try {
      const { data } = await kuisRequest<PlaySnapshot>(url(), { method: "POST", json: { runId: run.id } });
      setSnap(data);
    } catch (problem) {
      toast.show({ text: problem instanceof KuisRequestError && problem.message ? problem.message : t("kuis.offline"), tone: "error" });
    } finally { setJoining(false); }
  }

  async function tap(choice: number) {
    if (!run || run.phase !== "soal" || answer || paused || preview) return;
    const tapAt = clock.now();
    const state = soalState(run, tapAt);
    if (state.stage !== "jalan") return;
    const mine: Lock = { runId: run.id, index: run.index, choice, value: correctPoints(state.elapsedMs, state.durMs) };
    setLock(mine);
    vibrate(18);
    const send = () => kuisRequest<{ choice: number; value: number }>(mainWamApi.quizAnswer(quizId), { method: "POST", json: { runId: run.id, index: run.index, choice, tapAt } });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const { data } = await send();
        setLock({ ...mine, choice: data.choice, value: data.value });
        return;
      } catch (problem) {
        // A refusal (time up, paused, not joined): the lock goes. A lost connection: try again (the tap time stays).
        if (problem instanceof KuisRequestError && problem.status) {
          setLock(null);
          toast.show({ text: problem.message || t("kuis.offline"), tone: "error" });
          return;
        }
        await new Promise(done => window.setTimeout(done, 300 + attempt * 400));
      }
    }
    setLock(null);
    toast.show({ text: t("kuis.offline"), tone: "error" });
  }

  const body = (() => {
    if (gone) return <Closed over={false} />;
    if (!run || run.phase === "siap") return <Closed over={false} />;
    if (!me) {
      if (run.phase === "podium" || run.phase === "selesai") return <Closed over />;
      return <Join joining={joining} onJoin={join} />;
    }
    switch (run.phase) {
      case "lobi": return <Lobby alias={me.alias} players={snap.lobby?.players ?? me.players} />;
      case "bersiap": return <Ready run={run} flipped={now - run.phaseAt >= 650} />;
      case "soal": return <Question snap={snap} run={run} now={now} answer={answer} paused={paused} fx={fx} reduced={reduced} fmt={fmt} onTap={tap} />;
      case "batal": return <div className={css.center}><Ban size={48} aria-hidden /><h2 className={css.h2}>{t("kuis.canceled", { n: run.index + 1 })}</h2><p className={css.sub}>{t("kuis.canceledBody", { total: plain(me.total, fmt) })}</p></div>;
      case "skor": return <MyBoardView snap={snap} run={run} fmt={fmt} />;
      case "podium": case "selesai": return <End snap={snap} run={run} now={now} fx={fx} reduced={reduced} fmt={fmt} />;
    }
  })();

  // The head (prototipe .qtop): a gold label for where the game is, ✕ on the right. A question draws its own.
  const board = run?.phase === "skor" && snap.board ? t("kuis.board.kicker", { n: run.index + 1, count: run.count }) : null;
  const head = gone || !run || run.phase === "siap" ? null
    : !me ? <QuizHead>{run.phase === "podium" || run.phase === "selesai" ? null : <EyebrowLabel tone="gold">{snap.quiz.title}</EyebrowLabel>}</QuizHead>
      : run.phase === "lobi" ? <QuizHead><EyebrowLabel tone="gold"><PulseDot />{t("kuis.lobby.kicker")}</EyebrowLabel></QuizHead>
        : run.phase === "skor" ? <QuizHead>{board && <EyebrowLabel tone="gold">{board}</EyebrowLabel>}</QuizHead>
          : run.phase === "podium" || run.phase === "selesai" ? <QuizHead><EyebrowLabel tone="gold">{t("kuis.final.kicker")}</EyebrowLabel></QuizHead>
            : run.phase === "bersiap" || run.phase === "batal" ? <QuizHead />
              : null;
  return <ScreenContent>
    <ShellChrome hideTopBar />
    {failures > 1 && !gone && <Banner tone="offline" icon={<CloudOff />}>{t("kuis.offline")}</Banner>}
    <div className={cx(css.play, headed(run, me) && css.headed)}>
      {head}
      {body}
      {paused && <div className={css.paused} role="status"><div className={css.pauseCard}><Pause size={36} aria-hidden /><b>{t("kuis.paused")}</b><span>{t("kuis.pausedSub")}</span></div></div>}
    </div>
    <canvas ref={canvas} className={css.fx} aria-hidden="true" />
  </ScreenContent>;
}

/** Whether a head sits above the body (the question has its own, inside). */
const headed = (run: RunView | null, me: PlaySnapshot["me"]) => !!run && run.phase !== "siap" && !(me && run.phase === "soal");

/** ✕ (prototipe .ib 38 × 38 tile): leaves the game back to where the person came from, else to Beranda. */
function ExitButton() {
  const t = useT();
  const router = useRouter();
  const leave = () => { if (hasTrail()) router.back(); else router.push(mainWamPath.home); };
  return <button type="button" className={css.exit} onClick={leave} aria-label={t("shell.closeTask")}><X aria-hidden /></button>;
}

function QuizHead({ children }: { children?: ReactNode }) {
  return <div className={css.qtop}><span className={css.qtopText}>{children}</span><ExitButton /></div>;
}

function Closed({ over }: { over: boolean }) {
  const t = useT();
  return <EmptyState icon={over ? <Sparkles /> : <Hourglass />} title={t(over ? "kuis.over.title" : "kuis.closed.title")}>{t(over ? "kuis.over.body" : "kuis.closed.body")}</EmptyState>;
}

function Rules() {
  const t = useT();
  return <div className={css.rules}><span className={css.rule}>{t("kuis.rules.correct")}</span><span className={css.rule}>{t("kuis.rules.wrong")}</span><span className={css.rule}>{t("kuis.rules.none")}</span></div>;
}

function Join({ joining, onJoin }: { joining: boolean; onJoin: () => void }) {
  const t = useT();
  return <div className={css.center}>
    <Gamepad2 size={56} aria-hidden />
    <h2 className={css.h2}>{t("kuis.join.title")}</h2>
    <p className={css.sub}>{t("kuis.join.body")}</p>
    <Rules />
    <Button block loading={joining} loadingLabel={t("kuis.join.joining")} onClick={onJoin}>{t("kuis.join.button")}</Button>
  </div>;
}

const aliasName = (alias: Alias, t: ReturnType<typeof useT>) => (alias.mystery ? t("kuis.mystery", { n: String(alias.mystery).padStart(2, "0") }) : alias.name);

function Lobby({ alias, players }: { alias: Alias; players: number }) {
  const t = useT();
  return <div className={css.center}>
    <EyebrowLabel>{t("kuis.lobby.asKicker")}</EyebrowLabel>
    <TokohAvatar alias={alias} size={186} card breathe />
    <h2 className={css.name}><SrOnly>{t("kuis.lobby.as", { name: aliasName(alias, t) })}</SrOnly><span aria-hidden>{aliasName(alias, t)}</span></h2>
    <span className={css.meta} role="status"><Users aria-hidden />{t("kuis.lobby.count", { n: players })}</span>
    <p className={css.metaNote}><Info aria-hidden /><span>{alias.mystery ? t("kuis.lobby.mystery") : `${alias.persona}. ${t("kuis.lobby.hidden")}`}</span></p>
    <span className={css.wait}>{t("kuis.lobby.wait")}</span>
  </div>;
}

function Ready({ run, flipped }: { run: RunView; flipped: boolean }) {
  const t = useT();
  useEffect(() => { if (flipped) vibrate(25); }, [flipped]);
  return <div className={css.center}>
    <LevelCard levels={run.levels} index={run.index} flipped={flipped} />
    <h2 className={css.h2}>{t("kuis.question", { n: run.index + 1, count: run.count })}</h2>
    <p className={css.sub}>{t("kuis.ready")}</p>
    <Rules />
  </div>;
}

/** The number counting from `from` to `to` once `active` (the points of a right answer, a new place). */
function useCountUp(to: number, active: boolean, duration = 750, reduced = false, from = 0): number {
  const [value, setValue] = useState(from);
  const counting = active && !reduced;
  useEffect(() => {
    if (!counting) return;
    const start = performance.now();
    let frame = 0;
    const step = (time: number) => {
      const p = Math.min(1, (time - start) / duration);
      setValue(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [to, from, counting, duration]);
  return counting ? value : to;
}

type Fx = RefObject<Confetti | null>;

function Question({ snap, run, now, answer, paused, fx, reduced, fmt, onTap }: {
  snap: PlaySnapshot; run: RunView; now: number; answer: { choice: number; value: number } | null; paused: boolean; fx: Fx; reduced: boolean; fmt: (n: number) => string; onTap: (choice: number) => void;
}) {
  const t = useT();
  const state = soalState(run, now);
  const question: PhoneQuestionView | null = snap.question;
  const me = snap.me!;
  const level = run.levels[run.index];
  const seconds = Math.ceil(state.leftMs / 1000);
  const hot = state.stage === "jalan" && state.leftMs <= 5_000;
  const spread = snap.spread;
  const showBars = (state.stage === "sebaran" || state.stage === "buka") && !!spread;
  const lit = state.stage === "buka" && question?.correct !== null && question?.correct !== undefined;
  const result = lit ? me.result : null;
  const options = useRef<HTMLDivElement | null>(null);
  const [mood, setMood] = useState<"ok" | "bad" | null>(null);
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null);
  const points = useCountUp(result?.correct ? result.points : 0, !!result?.correct, 750, reduced);
  // The total takes this question in only when its answer lights (during the spread it would tell too early).
  const total = state.stage === "buka" || !me.result ? me.total : me.total - me.result.points;

  // The last five seconds: a soft buzz each second; time up: one more.
  const lastSecond = useRef<number | null>(null);
  useEffect(() => {
    if (state.stage !== "jalan" || paused) { lastSecond.current = null; return; }
    if (lastSecond.current !== null && seconds !== lastSecond.current && seconds >= 1 && seconds <= 5) vibrate(15);
    lastSecond.current = seconds;
  }, [seconds, state.stage, paused]);
  const stage = state.stage;
  const seenTimeUp = useRef<string | null>(null);
  useEffect(() => {
    const key = `${run.id}:${run.index}`;
    if (stage === "habis" && seenTimeUp.current !== key) { seenTimeUp.current = key; vibrate(40); }
  }, [stage, run.id, run.index]);

  // The answer opens: a burst and confetti from the chosen button when right; a short shake when not (≤ 1.5 s).
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!result || !answer) return;
    const key = `${run.id}:${run.index}`;
    if (shown.current === key) return;
    shown.current = key;
    if (result.correct) {
      vibrate([30, 40, 70]);
      const button = options.current?.children[answer.choice] as HTMLElement | undefined;
      if (button && !reduced) {
        const box = button.getBoundingClientRect();
        setBurst({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
        fx.current?.burst(box.left + box.width / 2, box.top + box.height / 2, 90, { speed: 760, spread: Math.PI * 1.1, size: 9 });
        window.setTimeout(() => setBurst(null), 1_000);
      }
      setMood("ok");
    } else {
      vibrate(110);
      setMood("bad");
      window.setTimeout(() => setMood(null), 1_400);
    }
  }, [result, answer, run.id, run.index, fx, reduced]);

  const remaining = snap.remaining;
  const encourage = remaining > 0 ? t((["kuis.left", "kuis.leftChase", "kuis.leftChance"] as const)[run.index % 3], { n: remaining }) : t("kuis.last");
  const canTap = state.stage === "jalan" && !answer && !paused;

  let stageView: ReactNode;
  if (state.stage === "hitung") {
    stageView = <div className={css.stageIn} key="hitung"><span className={css.label}>{t("kuis.countdown")}</span><span className={css.hero} aria-live="polite">{Math.max(1, Math.ceil(state.countdownMs / 1000))}</span></div>;
  } else if (state.stage === "jalan" && !answer) {
    stageView = <div className={css.stageIn} key="nilai"><span className={css.label}>{t("kuis.value")}</span><span className={css.hero}>{fmt(correctPoints(state.elapsedMs, state.durMs))}</span><span className={css.small}>{t("kuis.valueSub", { s: seconds })}</span></div>;
  } else if (state.stage === "jalan" && answer) {
    stageView = <div className={css.stageIn} key="kunci"><TokohAvatar alias={me.alias} size={56} breathe /><span className={css.lockChip} role="status"><Lock size={18} aria-hidden />{t("kuis.locked")} · {fmt(answer.value)}</span><span className={css.small}>{t("kuis.lockedSub")}</span></div>;
  } else if (state.stage === "habis" || (state.stage === "sebaran" && !spread)) {
    stageView = <div className={css.stageIn} key="habis"><span className={css.timeUp}>{t("kuis.timeUp")}</span><span className={css.small}>{t("kuis.timeUpSub")}</span></div>;
  } else if (!result && !(lit && !answer)) {
    stageView = <div className={css.stageIn} key="sebaran"><span className={css.h2}>{t("kuis.spread")}</span><span className={css.small}>{answer ? t("kuis.spreadMine", { letter: OPTION_LETTERS[answer.choice], value: fmt(answer.value) }) : t("kuis.spreadNone")}</span></div>;
  } else if (!answer) {
    stageView = <div className={css.stageIn} key="kosong"><span className={cx(css.resHead, css.resNone)}>{t("kuis.none")}</span><span className={css.meta}><span>{t("kuis.total", { total: plain(total, fmt) })}</span><span>·</span><span>{encourage}</span></span></div>;
  } else if (result?.correct) {
    const up = me.rankBefore !== null && me.rank !== null && me.rank < me.rankBefore ? me.rankBefore - me.rank : 0;
    stageView = <div className={css.stageIn} key="benar">
      <span className={cx(css.resHead, css.resOk)}><Check size={24} aria-hidden />{t("kuis.right")}</span>
      <span className={cx(css.points, css.pointsOk)}>{signed(points, fmt)}</span>
      <span className={css.meta}><span>{t("kuis.total", { total: plain(total, fmt) })}</span><span>·</span>{up ? <span className={css.up}>{t("kuis.rankUp", { n: up })}</span> : me.rank ? <span>{t("kuis.rank", { n: me.rank })}</span> : null}</span>
      {me.streak >= 2 && <span className={css.streak}><Flame size={16} aria-hidden />{t("kuis.streak", { n: me.streak })}</span>}
    </div>;
  } else {
    stageView = <div className={css.stageIn} key="salah"><span className={css.resHead}>{t("kuis.wrong")}</span><span className={cx(css.points, css.pointsBad)}>{signed(result?.points ?? -100, fmt)}</span><span className={css.meta}><span>{encourage}</span></span></div>;
  }

  const open = state.stage !== "hitung";
  return <div className={cx(css.question, hot && css.hot, mood === "bad" && !reduced && css.shake, mood === "bad" && css.wrong)}>
    <div className={css.top}>
      <span className={cx(css.lvChip, levelClass(level))}><Trophy aria-hidden />{t(levelKey(level))}</span>
      <span className={css.qn}>{t("kuis.question", { n: run.index + 1, count: run.count })}</span>
      <span className={css.total}><TokohAvatar alias={me.alias} size={28} />{plain(total, fmt)}</span>
      <ExitButton />
    </div>
    <div className={css.timer} role="progressbar" aria-label={t("kuis.timerLabel")} aria-valuemin={0} aria-valuemax={state.durMs / 1000} aria-valuenow={Math.round(state.leftMs / 1000)}>
      <i style={{ transform: `scaleX(${state.stage === "hitung" ? 1 : state.leftMs / state.durMs})` }} />
    </div>
    <div className={css.stage}>{stageView}</div>
    {open && question && <>
      <p className={css.qhint}><Tv aria-hidden />{t("kuis.readScreen")}</p>
      <div className={css.options} ref={options}>
        {question.options.map((text, i) => {
          const picked = answer?.choice === i;
          const ok = lit && question.correct === i;
          const no = lit && question.correct !== i;
          const fill = showBars && spread && spread.answered ? spread.counts[i] / spread.answered : 0;
          return <button key={i} type="button" className={cx(css.option, css[`opt${i}`], picked && css.picked, !lit && answer && !picked && css.dim, ok && css.ok, no && css.no)}
            disabled={!canTap} aria-pressed={picked} onClick={() => onTap(i)} style={{ "--kz-fill": fill } as CSSProperties}>
            <span className={css.bar} aria-hidden="true" />
            <span className={css.letter} aria-hidden={ok ? undefined : "true"}>{ok ? <Check size={24} aria-label={t("kuis.right")} /> : <><OptionShape index={i} /><span className={css.letterChar}>{OPTION_LETTERS[i]}</span></>}</span>
            <span className={css.optionText}>{text}{picked && showBars && <span className={css.tag}>{t("kuis.yourPick")}</span>}</span>
            {showBars && <span className={css.pct}>{spread!.percents[i]}%</span>}
          </button>;
        })}
      </div>
    </>}
    {burst && <span className={css.burst} style={{ left: burst.x, top: burst.y }} aria-hidden="true" />}
  </div>;
}

function MyBoardView({ snap, run, fmt }: { snap: PlaySnapshot; run: RunView; fmt: (n: number) => string }) {
  const t = useT();
  const board = snap.board;
  const me = snap.me!;
  const moved = !!board && board.prevRank !== null && board.prevRank !== board.rank;
  const shownRank = useCountUp(board?.rank ?? 0, moved, 900, false, board?.prevRank ?? 0);
  if (!board) return <div className={css.center} />;
  const next = run.index + 1;
  return <div className={css.board}>
    <div className={css.rankBig}><small>#</small>{shownRank}</div>
    <span className={css.sub}>{t("kuis.board.of", { n: board.players })}</span>
    {board.prevRank !== null && board.prevRank !== board.rank && <span className={cx(css.move, board.prevRank > board.rank && css.up)}>
      {board.prevRank > board.rank ? t("kuis.board.up", { n: board.prevRank - board.rank }) : t("kuis.board.from", { n: board.prevRank })}
    </span>}
    <span className={css.h2}>{t("kuis.board.points", { total: plain(board.total, fmt) })}</span>
    <span className={css.gap}>
      {board.rank === 1 ? <><Sparkles size={18} aria-hidden />{t("kuis.board.lead", { n: fmt(board.lead ?? 0) })}</>
        : board.gap && board.gap.points > 0 ? <><ArrowUp size={18} aria-hidden />{t("kuis.board.gap", { n: fmt(board.gap.points), rank: board.gap.rank })}</>
          : <><ArrowUp size={18} aria-hidden />{t("kuis.board.tie", { rank: board.gap?.rank ?? board.rank - 1 })}</>}
    </span>
    <div className={css.neighbors}>
      {board.neighbors.map(row => <div key={row.rank} className={cx(css.nRow, row.me && css.nMe)}>
        <span className={css.nRank}>#{row.rank}</span>
        <TokohAvatar alias={row.alias} size={32} />
        <span className={css.nName}>{row.me ? t("kuis.board.you", { name: aliasName(me.alias, t) }) : aliasName(row.alias, t)}</span>
        <span className={css.nScore}>{plain(row.total, fmt)}</span>
      </div>)}
    </div>
    {next < run.count && boardRequiredBefore(run.levels, next) && <div className={css.teaser}>{t("kuis.board.final", { s: levelMs(4) / 1000 })}</div>}
  </div>;
}

function End({ snap, run, now, fx, reduced, fmt }: { snap: PlaySnapshot; run: RunView; now: number; fx: Fx; reduced: boolean; fmt: (n: number) => string }) {
  const t = useT();
  const me = snap.me!;
  const final = snap.final;
  const state = podiumState(run, run.winners, now);
  // My place on the podium lands with the coin on the big screen: the phone turns gold at that moment.
  const landed = !!final?.winner && (run.phase === "selesai" || (podiumPlaceOpen(run, run.winners, final.rank) && (state.opening !== final.rank || now - run.phaseAt >= PODIUM_LAND_AT || state.stage === "diam" || state.stage === "mendarat")));
  const celebrated = useRef(false);
  useEffect(() => {
    if (!landed || celebrated.current || run.phase !== "podium") return;
    celebrated.current = true;
    vibrate([80, 60, 80, 60, 200]);
    if (!reduced) fx.current?.burst(window.innerWidth / 2, window.innerHeight * 0.35, 120, { speed: 820, spread: Math.PI * 1.2, size: 10 });
  }, [landed, run.phase, fx, reduced]);
  if (!final) return <div className={css.center}><TokohAvatar alias={me.alias} size={96} breathe /><h2 className={css.h2}>{t("kuis.podium.title")}</h2></div>;
  if (landed) {
    return <div className={cx(css.center, css.gold)}>
      <span className={css.kicker}>{t("kuis.gold.kicker")}</span>
      <TokohAvatar alias={me.alias} size={132} />
      <span className={css.goldTitle}>{t("kuis.gold.title", { n: final.rank })}</span>
      <span className={css.h2}>{t("kuis.gold.stage")}</span>
      <span className={css.sub}>{t("kuis.gold.meta", { total: plain(final.total, fmt), name: aliasName(me.alias, t) })}</span>
    </div>;
  }
  if (run.phase === "podium") {
    return <div className={css.center}>
      <TokohAvatar alias={me.alias} size={96} breathe />
      <h2 className={css.h2}>{t("kuis.podium.title")}</h2>
      <p className={css.sub}>{t("kuis.podium.body")}</p>
      <span className={css.pill}>{t("kuis.podium.score", { total: plain(final.total, fmt) })}</span>
    </div>;
  }
  return <div className={css.center}>
    <TokohAvatar alias={me.alias} size={96} />
    <div className={css.rankBig}><small>#</small>{final.rank}</div>
    <span className={css.sub}>{t("kuis.final.of", { n: final.players })}</span>
    <span className={css.h2}>{t("kuis.final.meta", { total: plain(final.total, fmt), correct: final.correct })}</span>
    <p className={css.sub}>{t("kuis.final.thanks")}</p>
  </div>;
}
