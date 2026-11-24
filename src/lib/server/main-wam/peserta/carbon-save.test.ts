import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const write = vi.fn(async (_id: string, answer: object) => ({ ...answer, answeredAt: "x" }));
vi.mock("./carbon-answer", () => ({ readCarbonAnswer: vi.fn(), writeCarbonAnswer: (id: string, answer: object) => write(id, answer) }));
vi.mock("../panitia/common", () => ({ limitPerPerson: vi.fn(async () => undefined) }));
vi.mock("../panitia/carbon", () => ({ gatherCarbon: vi.fn(), seatsPerTrip: vi.fn() }));
vi.mock("../viewer", () => ({ viewerRoom: vi.fn() }));
vi.mock("../demo", () => ({ demoOn: vi.fn(), demoPlaceFor: vi.fn() }));
vi.mock("../lang", () => ({ readLang: vi.fn(async () => "id") }));

import { saveMyCarbon } from "./carbon";

/* Saving one's own part of Jejak karbon: Pra WAM's schema, closed a week after the event, one row per person (their own id only). */

const context = (endDate: string) => ({ viewer: { id: "me-1" }, settings: { event: { endDate } } }) as unknown as Parameters<typeof saveMyCarbon>[0];
const NOW = new Date("2027-01-05T10:00:00+07:00");
beforeEach(() => write.mockClear());

describe("saveMyCarbon", () => {
  it("keeps a valid answer under the signed-in person's own id", async () => {
    await saveMyCarbon(context("2027-01-07"), { own: null, bottles: 2, laptopHours: 3, phoneCharges: 1 }, NOW);
    expect(write).toHaveBeenCalledWith("me-1", { own: null, bottles: 2, laptopHours: 3, phoneCharges: 1 });
  });

  it("refuses what Pra WAM's schema refuses, with its words, and writes nothing", async () => {
    await expect(saveMyCarbon(context("2027-01-07"), { own: null, bottles: 99, laptopHours: 0, phoneCharges: 0 }, NOW)).rejects.toMatchObject({ status: 400, message: "Paling banyak 50 botol." });
    await expect(saveMyCarbon(context("2027-01-07"), { own: { from: "", mode: "mobil", km: 0, roundTrip: true }, bottles: 0, laptopHours: 0, phoneCharges: 0 }, NOW)).rejects.toMatchObject({ status: 400 });
    expect(write).not.toHaveBeenCalled();
  });

  it("refuses once answers are closed (a week after the event)", async () => {
    await expect(saveMyCarbon(context("2027-01-07"), { own: null, bottles: 0, laptopHours: 0, phoneCharges: 0 }, new Date("2027-01-20T10:00:00+07:00"))).rejects.toMatchObject({ status: 409, message: "Pengisian sudah ditutup." });
    expect(write).not.toHaveBeenCalled();
  });
});
