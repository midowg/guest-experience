import { expect, it } from "vitest";
import type { QQuestion, QSection } from "@/lib/pra-wam/questionnaire";
import { resumeIndex, stepsOf } from "./steps";

const section = (id: string, anonymous = false, sort = 1): QSection => ({ id, key: id, title: id, short: id, hello: "", intro: "", tease: "", anonymous, sort, hidden: false });
const question = (key: string, sectionId: string, sort: number, required = true): QQuestion => ({
  id: `q-${key}`, sectionId, key, prompt: key, kind: "text", required, visibility: sectionId === "sD" ? "anon" : "rekan", options: [], maxChoices: null,
  matrixRows: [], scale: [], placeholder: "", note: "", react: "", showIf: null, sort, hidden: false,
});
const content = { sections: [section("s0"), section("sD", true, 2)], questions: [question("1", "s0", 1), question("D1", "sD", 2), question("D2", "sD", 3, false)] };

it("picks up at the first required card, then at an anonymous part not sent yet, then the end", () => {
  const steps = stepsOf(content, {}, false);
  expect(steps[resumeIndex(steps, {})]).toMatchObject({ id: "q:1" });
  // Everything answered, the anonymous part still only on the phone: its last card, with the send button.
  const answered = { 1: "Dewi", D1: "Sering" };
  expect(steps[resumeIndex(steps, answered)]).toMatchObject({ id: "q:D2", lastOfSection: true });
  const sent = stepsOf(content, answered, true);
  expect(sent[resumeIndex(sent, answered)]).toMatchObject({ kind: "done" });
});
