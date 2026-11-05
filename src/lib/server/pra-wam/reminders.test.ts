import { beforeEach, describe, expect, it, vi } from "vitest";

/* "Ingatkan yang belum": who gets it, when it is refused, and what it says. */
const state = vi.hoisted(() => ({
  form: { id: "f1", name: "Kuesioner", status: "buka", minutes: 15, editUntil: null as string | null } as Record<string, unknown> | null,
  last: null as null | { at: string; recipients: number },
  sent: [] as { ids: string[]; note: { title: string; body: string; label: string } }[],
}));
vi.mock("server-only", () => ({}));
vi.mock("./questionnaire", () => ({ currentForm: async () => state.form, questionnaireWaiting: () => new Error("menunggu migrasi") }));
vi.mock("./announcements", () => ({
  lastAppNote: async () => state.last,
  notifyFromApp: async (ids: string[], note: { title: string; body: string; label: string }) => { state.sent.push({ ids, note }); return ids.length; },
}));
vi.mock("./questionnaire-admin", () => ({
  questionnaireProgress: async () => ({ people: [
    { employeeId: "p1", state: "belum" }, { employeeId: "p2", state: "sedang" }, { employeeId: "p3", state: "selesai" }, { employeeId: "p4", state: "belum" },
  ] }),
}));

const { remindNotDone, reminderNote } = await import("./reminders");
const now = new Date("2026-11-10T03:00:00Z");

beforeEach(() => {
  state.form = { id: "f1", name: "Kuesioner", status: "buka", minutes: 15, editUntil: null };
  state.last = null;
  state.sent = [];
});

describe("the reminder", () => {
  it("goes to everyone not done, or only one group", async () => {
    expect(await remindNotDone("semua", now)).toBe(3);
    expect(state.sent[0].ids).toEqual(["p1", "p2", "p4"]);
    expect(state.sent[0].note.label).toBe("Pengingat kuesioner");
    state.sent = [];
    expect(await remindNotDone("belum", now)).toBe(2);
    expect(await remindNotDone("sedang", now)).toBe(1);
    expect(state.sent.map(item => item.ids)).toEqual([["p1", "p4"], ["p2"]]);
  });
  it("is refused while the questionnaire is closed or past its deadline, and twice within an hour", async () => {
    state.form = { ...state.form!, status: "tutup" };
    await expect(remindNotDone("semua", now)).rejects.toThrow("selama kuesioner dibuka");
    state.form = { ...state.form!, status: "buka", editUntil: "2026-11-09T00:00:00Z" };
    await expect(remindNotDone("semua", now)).rejects.toThrow("selama kuesioner dibuka");
    state.form = { ...state.form!, editUntil: null };
    state.last = { at: "2026-11-10T02:30:00Z", recipients: 3 };
    await expect(remindNotDone("semua", now)).rejects.toThrow("baru saja dikirim");
    state.last = { at: "2026-11-10T01:59:00Z", recipients: 3 };
    expect(await remindNotDone("semua", now)).toBe(3);
  });
  it("says how long it takes, that answers are kept, and the deadline when there is one", () => {
    expect(reminderNote({ name: "Kuesioner", minutes: 15, editUntil: null }).body).toBe("Kamu belum menyelesaikan Kuesioner. Isinya sekitar 15 menit dan jawabanmu tersimpan otomatis, jadi bisa dilanjutkan kapan saja dari kartu di Beranda.");
    expect(reminderNote({ name: "Kuesioner", minutes: 15, editUntil: "2026-11-20T10:00:00Z" }).body).toContain("Bisa diisi sampai 20 November pukul 17.00 WIB.");
  });
});
