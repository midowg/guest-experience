import { describe, expect, it } from "vitest";
import { agendaSchema } from "./admin";
import { DEMO_LOOP_MS, DEMO_QUESTIONS, DEMO_QUIZ_ID, demoPlay, demoRun } from "./demo";
import { answerOpen } from "./flow";
import { flowOf } from "./snapshot";
import { soalTimes } from "./flow";

const T = Date.parse("2027-01-05T10:00:00Z");
const loopStart = T - (T % DEMO_LOOP_MS);

describe("Mode demo's sample quiz", () => {
  it("has three questions and plays lobby, three questions, the scoreboard and the podium in a loop", () => {
    expect(DEMO_QUESTIONS).toHaveLength(3);
    const seen: string[] = [];
    for (let t = loopStart; t < loopStart + DEMO_LOOP_MS; t += 500) {
      const run = demoRun(t);
      const tag = `${run.phase}${run.phase === "soal" ? run.index : ""}`;
      if (seen[seen.length - 1] !== tag) seen.push(tag);
    }
    expect(seen).toEqual(["lobi", "soal0", "soal1", "soal2", "skor", "podium"]);
    expect(demoRun(loopStart + DEMO_LOOP_MS).phase).toBe("lobi");
  });

  it("opens each answer by the question's time and keeps the key out of the phone before that", () => {
    const run = demoRun(loopStart + 8_000 + 1_000);
    expect(run.phase).toBe("soal");
    const times = soalTimes(DEMO_QUESTIONS[0].level);
    const before = demoPlay(run.phaseAt + times.reveal - 1);
    expect(before.question?.correct).toBeNull();
    expect(before.spread).toBeNull();
    const after = demoPlay(run.phaseAt + times.reveal + 10);
    expect(answerOpen(flowOf(demoRun(run.phaseAt + times.reveal + 10)), run.phaseAt + times.reveal + 10)).toBe(true);
    expect(after.question?.correct).toBe(DEMO_QUESTIONS[0].correct);
    expect(after.spread).not.toBeNull();
  });

  it("never sends the text of the question to the phone", () => {
    for (let t = loopStart; t < loopStart + DEMO_LOOP_MS; t += 1_000) {
      const text = JSON.stringify(demoPlay(t));
      for (const question of DEMO_QUESTIONS) expect(text).not.toContain(question.body);
    }
  });

  it("answers only the clock when the phone already has this version", () => {
    const now = loopStart + 3_000;
    const first = demoPlay(now);
    expect(first.quiz.id).toBe(DEMO_QUIZ_ID);
    const again = demoPlay(now + 1_000, first.v);
    expect(again.same).toBe(true);
    expect(again.run).toBeNull();
  });
});

describe("the agenda link", () => {
  it("takes a session id or null, nothing else", () => {
    expect(agendaSchema.safeParse({ sessionId: null }).success).toBe(true);
    expect(agendaSchema.safeParse({ sessionId: "00000000-0000-4000-8000-000000000001" }).success).toBe(true);
    expect(agendaSchema.safeParse({ sessionId: "abc" }).success).toBe(false);
    expect(agendaSchema.safeParse({ sessionId: null, extra: 1 }).success).toBe(false);
  });
});
