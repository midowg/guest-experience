import { beforeEach, describe, expect, it, vi } from "vitest";

let cookie: string | undefined;
let outsideRequest = false;

vi.mock("server-only", () => ({}));
// cache() only memoises inside a request; in a test every call reads again.
vi.mock("react", async importOriginal => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/headers", () => ({
  cookies: async () => {
    if (outsideRequest) throw new Error("cookies was called outside a request scope");
    return { get: (name: string) => (name === "mw_lang" && cookie !== undefined ? { name, value: cookie } : undefined) };
  },
}));

const { readLang, serverT } = await import("./lang");

beforeEach(() => { cookie = undefined; outsideRequest = false; });

describe("readLang: the language of this device", () => {
  it("is Indonesian without the cookie", async () => {
    expect(await readLang()).toBe("id");
  });

  it("reads the mw_lang cookie", async () => {
    cookie = "en";
    expect(await readLang()).toBe("en");
    cookie = "id";
    expect(await readLang()).toBe("id");
  });

  it("falls back to Indonesian for a value it does not know", async () => {
    for (const value of ["fr", "", "EN", "en;x"]) { cookie = value; expect(await readLang()).toBe("id"); }
  });

  it("is Indonesian outside a request (no cookies to read)", async () => {
    outsideRequest = true;
    expect(await readLang()).toBe("id");
  });

  it("serverT says a text in that language", async () => {
    cookie = "en";
    expect((await serverT())("shell.skip")).toBe("Skip to content");
    cookie = undefined;
    expect((await serverT())("shell.skip")).toBe("Lewati ke isi");
  });
});
