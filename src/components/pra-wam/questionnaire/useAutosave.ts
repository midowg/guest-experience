"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnswerValue, Answers, Progress } from "@/lib/pra-wam/questionnaire";
import { praWamApi } from "@/lib/routes";
import { errorText, praWamRequest, PraWamApiError } from "../api";
import { pendingKey, writeAnswers } from "./local";

export type SaveStatus = "idle" | "saving" | "saved" | "retrying" | "offline";
export type Saved = { value: AnswerValue; progress: Progress; completedAt: string | null };

/**
 * Saves named answers one at a time, in order, as the person goes. Text waits for a pause in
 * typing (`delay`); a choice goes at once. What is not saved yet is also kept on this device, so
 * going offline or reloading loses nothing; it is sent again when the connection is back, with
 * growing pauses between tries. An answer the server refuses (4xx) is dropped and reported.
 */
export function useAutosave(formId: string, handlers: { onSaved: (key: string, saved: Saved) => void; onRejected: (key: string, message: string) => void }) {
  const queue = useRef(new Map<string, AnswerValue>());
  const timers = useRef(new Map<string, number>());
  const running = useRef(false);
  const retryTimer = useRef<number | undefined>(undefined);
  const attempts = useRef(0);
  const latest = useRef(handlers);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [problem, setProblem] = useState("");

  useEffect(() => { latest.current = handlers; });

  const persist = useCallback(() => writeAnswers(pendingKey(formId), Object.fromEntries(queue.current)), [formId]);

  const run = useCallback(async function run(): Promise<void> {
    if (running.current) return;
    running.current = true;
    window.clearTimeout(retryTimer.current);
    try {
      while (queue.current.size) {
        if (typeof navigator !== "undefined" && navigator.onLine === false) { setStatus("offline"); return; }
        const [key, value] = queue.current.entries().next().value as [string, AnswerValue];
        setStatus("saving");
        try {
          const { data } = await praWamRequest<Saved>(praWamApi.questionnaireAnswer, { method: "PUT", json: { question: key, value } });
          if (queue.current.get(key) === value) queue.current.delete(key);
          persist();
          attempts.current = 0;
          setProblem("");
          latest.current.onSaved(key, data);
        } catch (error) {
          const code = error instanceof PraWamApiError ? error.status : undefined;
          if (code && code >= 400 && code < 500 && code !== 408 && code !== 429) {
            // It cannot be saved as it is (closed, or not a valid answer): drop it and say why.
            if (queue.current.get(key) === value) queue.current.delete(key);
            persist();
            latest.current.onRejected(key, errorText(error));
            continue;
          }
          attempts.current++;
          setProblem(errorText(error));
          setStatus(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "retrying");
          retryTimer.current = window.setTimeout(() => void run(), Math.min(30_000, 2_000 * 2 ** (attempts.current - 1)));
          return;
        }
      }
      setStatus("saved");
    } finally {
      running.current = false;
    }
  }, [persist]);

  /** Queues one answer; `delay` (ms) waits for a pause in typing first. */
  const save = useCallback((key: string, value: AnswerValue, delay = 0) => {
    queue.current.set(key, value);
    persist();
    window.clearTimeout(timers.current.get(key));
    timers.current.delete(key);
    if (delay > 0) timers.current.set(key, window.setTimeout(() => { timers.current.delete(key); void run(); }, delay));
    else void run();
  }, [persist, run]);

  /** Sends what waits now (leaving a card, or the person asks to try again). */
  const flush = useCallback(() => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
    attempts.current = 0;
    void run();
  }, [run]);

  /** Answers this device kept from before (a reload while offline): send them again. */
  const resume = useCallback((pending: Answers) => {
    for (const [key, value] of Object.entries(pending)) if (!queue.current.has(key)) queue.current.set(key, value);
    if (queue.current.size) void run();
  }, [run]);

  useEffect(() => {
    const online = () => flush();
    const offline = () => { if (queue.current.size) setStatus("offline"); };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const pending = timers.current;
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      for (const timer of pending.values()) window.clearTimeout(timer);
      window.clearTimeout(retryTimer.current);
    };
  }, [flush]);

  const waiting = () => queue.current.size > 0;
  return { status, problem, save, flush, resume, waiting };
}
