import { describe, expect, it } from "vitest";
import { praWamSecret, safePraWamNext, signPraWamSession, verifyPraWamSession } from "./session-token";

const secret = "s".repeat(40);
const person = { employeeId: "2f1c6a4e-8b7d-4c3a-9e21-5d6f7a8b9c0d", version: 2 };

describe("Pra WAM session cookie", () => {
  it("round-trips the person and version", () => {
    expect(verifyPraWamSession(secret, signPraWamSession(secret, person))).toEqual(person);
  });
  it("refuses a changed, foreign, or expired cookie", () => {
    const token = signPraWamSession(secret, person);
    expect(verifyPraWamSession(secret, token.replace(".2.", ".3."))).toBeNull();
    expect(verifyPraWamSession("t".repeat(40), token)).toBeNull();
    expect(verifyPraWamSession(secret, token, Date.now() + 31 * 24 * 3600 * 1000)).toBeNull();
    expect(verifyPraWamSession(null, token)).toBeNull();
  });
  it("needs a secret of at least 32 characters", () => {
    expect(praWamSecret({ WAM_SESSION_SECRET: "short" })).toBeNull();
    expect(praWamSecret({ WAM_SESSION_SECRET: secret })).toBe(secret);
  });
  it("only returns to Pra WAM pages after signing in", () => {
    expect(safePraWamNext("/pra-wam/appraisal")).toBe("/pra-wam/appraisal");
    expect(safePraWamNext("/pra-wam/masuk")).toBeNull();
    expect(safePraWamNext("//evil.example")).toBeNull();
    expect(safePraWamNext("/admin")).toBeNull();
  });
});
