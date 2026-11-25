"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Ban, Check, CloudOff, ListOrdered, Pause, Play, SkipForward } from "lucide-react";
import { canBoardNow, canCancel, canPause, clockText, controlStatus, nextStep, soalState, type ControlAction } from "@/lib/main-wam/kuis/flow";
import { OPTION_LETTERS, isPaused, levelLabels } from "@/lib/main-wam/kuis/rules";
import type { ControlSnapshot } from "@/lib/main-wam/kuis/types";
import { mainWamApi } from "@/lib/routes";
import { ScreenContent } from "@/components/main-wam/shell";
import { Banner, Button, Card, ConfirmDialog, ProgressBar, cx, useToast } from "@/components/main-wam/ui";
import { KuisRequestError, kuisRequest, useNow, usePoll, useServerClock } from "./live";
import { OptionShape } from "./OptionShape";
import css from "./control.module.css";

/*
 * The MC's control (rancangan §7, prototype revisi 2): one big Lanjut that always names the next step
 * (Space, Enter or →), Jeda (P) that freezes the time for everyone (not counted as answer time), and
 * after the answer opens the flow waits for the MC. Batalkan soal asks first. Papan skor sekarang.
 * The key is shown only once the answer is open, as on every screen. Panitia's screens stay Indonesian.
 */

export function ControlScreen({ quizId, initial, preview }: { quizId: string; initial: ControlSnapshot; preview?: { now: number } }) {
  const toast = useToast();
  const clock = useServerClock(initial.serverNow, preview?.now);
  const url = useCallback(() => mainWamApi.quizControl(quizId), [quizId]);
  const { snap, setSnap, failures, refresh } = usePoll({ initial, url, clock, whole: true, disabled: !!preview });
  const now = useNow(clock.now, 200, !preview);
  const [acting, setActing] = useState<ControlAction | null>(null);
  const [confirm, setConfirm] = useState(false);
  const run = snap.run;
  const paused = !!run && isPaused(run.pauses);
  const step = nextStep(run, snap.players, now);
  const status = controlStatus(run, snap.players, snap.answered, now);

  const act = useCallback(async (action: ControlAction) => {
    if (!run || acting || preview) return;
    setActing(action);
    try {
      const { data, sentAt, receivedAt } = await kuisRequest<ControlSnapshot>(mainWamApi.quizControl(quizId), { method: "POST", json: { runId: run.id, rev: run.rev, action } });
      clock.record({ sentAt, receivedAt, serverNow: data.serverNow });
      setSnap(data);
    } catch (problem) {
      toast.show({ text: problem instanceof KuisRequestError && problem.message ? problem.message : "Belum tersambung. Coba lagi.", tone: "error" });
      void refresh();
    } finally { setActing(null); }
  }, [run, acting, preview, quizId, clock, setSnap, toast, refresh]);

  const lanjut = useCallback(() => { if (step.action) void act(step.action); }, [step.action, act]);
  const jeda = useCallback(() => { if (run && (paused || canPause(run))) void act(paused ? "lanjutkan" : "jeda"); }, [run, paused, act]);

  // Keys: Space, Enter, → = Lanjut; P = Jeda / lanjutkan (not while the confirmation is open, not over another control).
  const keys = useRef({ lanjut, jeda, confirm });
  useEffect(() => { keys.current = { lanjut, jeda, confirm }; }, [lanjut, jeda, confirm]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || keys.current.confirm) return;
      const target = event.target as HTMLElement | null;
      const onControl = !!target?.closest?.("button, a, input, textarea, select, [role=switch], [role=tab]");
      if (event.key === "ArrowRight" || ((event.key === " " || event.key === "Enter") && (!onControl || target?.dataset.lanjut !== undefined))) {
        event.preventDefault(); keys.current.lanjut();
      } else if (event.key.toLowerCase() === "p" && !target?.closest?.("input, textarea")) {
        event.preventDefault(); keys.current.jeda();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  const question = snap.question;
  const state = run?.phase === "soal" ? soalState(run, now) : null;
  const pauseSince = paused ? run!.pauses.find(pause => pause.to === null)!.from : null;
  return <ScreenContent>
    {failures > 1 && <Banner tone="offline" icon={<CloudOff />}>Koneksi terputus. Mencoba lagi…</Banner>}
    <Card className={css.status}>
      <div className={css.statusRow} aria-live="polite">
        <span className={cx(css.dot, css[status.tone])} aria-hidden="true" />
        <div className={css.statusText}>
          <span className={css.main}>{status.main}</span>
          <span className={css.sub}>{status.sub}</span>
        </div>
      </div>
      <span className={css.title}>{snap.quiz.title}{run ? ` · permainan ${run.number}` : ""} · {snap.players} pemain</span>
    </Card>
    <div className={css.buttons}>
      <Button block data-lanjut="" icon={<SkipForward />} disabled={!step.action || !!acting} loading={!!acting && acting === step.action} onClick={lanjut} aria-keyshortcuts="Space Enter ArrowRight" className={css.next}>{step.label}</Button>
      <Button variant="secondary" icon={paused ? <Play /> : <Pause />} disabled={!run || (!paused && !canPause(run)) || !!acting} onClick={jeda} aria-pressed={paused} aria-keyshortcuts="P" className={cx(css.jeda, paused && css.jedaOn)}>
        {paused ? `Lanjutkan · ${clockText(now - (pauseSince ?? now))}` : "Jeda"}
      </Button>
    </div>
    <p className={css.keys}>Spasi, Enter, atau → untuk Lanjut · P untuk Jeda</p>
    <div className={css.secondary}>
      <Button variant="danger-outline" size="m" icon={<Ban />} disabled={!canCancel(run) || !!acting} onClick={() => setConfirm(true)}>Batalkan soal</Button>
      <Button variant="secondary" size="m" icon={<ListOrdered />} disabled={!canBoardNow(run, now) || !!acting || paused} onClick={() => void act("papan-skor")}>Papan skor sekarang</Button>
    </div>
    {run && question && <Card className={css.question}>
      <span className={css.qhead}>Soal {question.index + 1} dari {run.count} · {levelLabels[question.level]}{snap.percentCorrect !== null ? ` · ${snap.percentCorrect}% benar` : ""}</span>
      <p className={css.qbody}>{question.body}</p>
      <ol className={css.options}>
        {question.options.map((text, i) => <li key={i} className={cx(css.option, question.correct === i && css.ok)}>
          <span className={css.letter}><OptionShape index={i} className={css.shape} />{OPTION_LETTERS[i]}</span>
          <span className={css.optionText}>{text}</span>
          {question.correct === i && <span className={css.okTag}><Check aria-hidden />Jawaban benar</span>}
        </li>)}
      </ol>
      {state && state.stage === "jalan" && <ProgressBar value={snap.answered ?? 0} max={Math.max(1, snap.players)} label="Sudah menjawab" valueText={`${snap.answered ?? 0} dari ${snap.players}`} thin />}
      {question.correct === null && <span className={css.hint}>Kunci jawaban tampil saat jawaban dibuka, sama seperti di semua layar.</span>}
    </Card>}
    <ConfirmDialog open={confirm} tone="danger" icon={<Ban />} title={`Batalkan soal ${run ? run.index + 1 : ""}?`}
      body="Soal ini tidak dinilai, dan nilai semua pemain kembali seperti sebelum soal ini." confirmLabel="Batalkan soal" busy={acting === "batalkan"} busyLabel="Membatalkan…"
      onCancel={() => setConfirm(false)} onConfirm={() => { void act("batalkan").then(() => setConfirm(false)); }} />
  </ScreenContent>;
}
