import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PUSH_TOPICS, pushTopicInfo } from "@/lib/pra-wam/push";
import { praWamApi } from "@/lib/routes";
import { PushSwitch, PushTopics } from "./PushSwitch";

type Reply = { status?: number; body: unknown };
let replies: Record<string, (init?: RequestInit) => Reply>;
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const key = `${init?.method ?? "GET"} ${url}`;
  const reply = replies[key]?.(init) ?? { status: 404, body: { ok: false, message: "Tidak ada" } };
  return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "Content-Type": "application/json" } });
});

beforeEach(() => {
  replies = {};
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const defaults = { pengumuman: true, hod: true, forum: true, booking_penting: true, booking_baru: false, permintaan: true, kuesioner: true };
const topicSwitch = (topic: (typeof PUSH_TOPICS)[number]) => screen.getByRole("switch", { name: pushTopicInfo[topic].label });
const puts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT").map(([, init]) => JSON.parse(String(init?.body)));

const labelsOf = (name: string) => [...screen.getByRole("list", { name }).querySelectorAll("strong")].map(item => item.textContent);

it("lists every topic in order, Meeting HOD apart for a HOD; Pengumuman has no switch but Selalu", async () => {
  replies[`GET ${praWamApi.pushPrefs}`] = () => ({ body: { ok: true, data: { prefs: { ...defaults, forum: false }, topics: PUSH_TOPICS }, message: "" } });
  render(<PushTopics hod />);
  await waitFor(() => expect((topicSwitch("hod") as HTMLButtonElement).disabled).toBe(false));
  expect(labelsOf("Notifikasi yang muncul di HP")).toEqual(PUSH_TOPICS.filter(topic => topic !== "hod").map(topic => pushTopicInfo[topic].label));
  expect(labelsOf("Khusus HOD")).toEqual([pushTopicInfo.hod.label]);
  expect(screen.queryByRole("switch", { name: pushTopicInfo.pengumuman.label })).toBeNull();
  expect(screen.getByText("Selalu")).toBeTruthy();
  expect(topicSwitch("forum").getAttribute("aria-checked")).toBe("false");
  expect(topicSwitch("booking_baru").getAttribute("aria-checked")).toBe("false");
  expect(topicSwitch("hod").getAttribute("aria-checked")).toBe("true");
  expect(screen.getByText(/Semua tetap tercatat di lonceng/)).toBeTruthy();
});

it("shows peserta and panitia no Meeting HOD", async () => {
  replies[`GET ${praWamApi.pushPrefs}`] = () => ({ body: { ok: true, data: { prefs: defaults, topics: PUSH_TOPICS }, message: "" } });
  render(<PushTopics />);
  await waitFor(() => expect((topicSwitch("forum") as HTMLButtonElement).disabled).toBe(false));
  expect(screen.queryByRole("switch", { name: pushTopicInfo.hod.label })).toBeNull();
  expect(screen.queryByText("Khusus HOD")).toBeNull();
});

it("saves a flipped topic at once with PUT, the row disabled while it saves", async () => {
  replies[`GET ${praWamApi.pushPrefs}`] = () => ({ body: { ok: true, data: { prefs: defaults, topics: PUSH_TOPICS }, message: "" } });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  replies[`PUT ${praWamApi.pushPrefs}`] = () => ({ body: { ok: true, data: { prefs: { ...defaults, booking_baru: true } }, message: "Tersimpan" } });
  render(<PushTopics hod />);
  await waitFor(() => expect((topicSwitch("booking_baru") as HTMLButtonElement).disabled).toBe(false));
  // Hold the PUT so the in-flight state can be seen.
  const original = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementationOnce(async (url, init) => { await held; return original(url, init); });
  fireEvent.click(topicSwitch("booking_baru"));
  expect(topicSwitch("booking_baru").getAttribute("aria-checked")).toBe("true");
  expect((topicSwitch("booking_baru") as HTMLButtonElement).disabled).toBe(true);
  expect((topicSwitch("hod") as HTMLButtonElement).disabled).toBe(false);
  release();
  await waitFor(() => expect((topicSwitch("booking_baru") as HTMLButtonElement).disabled).toBe(false));
  expect(topicSwitch("booking_baru").getAttribute("aria-checked")).toBe("true");
  expect(puts()).toEqual([{ prefs: { booking_baru: true } }]);
});

it("puts the switch back and shows the error when saving fails", async () => {
  replies[`GET ${praWamApi.pushPrefs}`] = () => ({ body: { ok: true, data: { prefs: defaults, topics: PUSH_TOPICS }, message: "" } });
  replies[`PUT ${praWamApi.pushPrefs}`] = () => ({ status: 500, body: { ok: false, message: "Gagal menyimpan pilihan." } });
  render(<PushTopics />);
  await waitFor(() => expect((topicSwitch("kuesioner") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(topicSwitch("kuesioner"));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Gagal menyimpan pilihan.");
  expect(topicSwitch("kuesioner").getAttribute("aria-checked")).toBe("true");
  expect(puts()).toEqual([{ prefs: { kuesioner: false } }]);
});

it("before the database update (503) shows the defaults read-only with a note", async () => {
  replies[`GET ${praWamApi.pushPrefs}`] = () => ({ status: 503, body: { ok: false, message: "Belum siap" } });
  render(<PushTopics hod />);
  expect(await screen.findByText("Pilihan per topik aktif setelah pembaruan database.")).toBeTruthy();
  for (const topic of PUSH_TOPICS.filter(topic => !pushTopicInfo[topic].locked)) {
    expect((topicSwitch(topic) as HTMLButtonElement).disabled).toBe(true);
    expect(topicSwitch(topic).getAttribute("aria-checked")).toBe(String(defaults[topic]));
  }
  expect(screen.queryByRole("alert")).toBeNull();
});

it("shows the topics under the main switch only once this phone is on", async () => {
  const subscription = { endpoint: "https://push.example/abc", toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "p".repeat(20), auth: "a".repeat(10) } }) };
  vi.stubGlobal("PushManager", function PushManager() {});
  vi.stubGlobal("Notification", Object.assign(function Notification() {}, { permission: "granted" }));
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: async () => ({ pushManager: { getSubscription: async () => subscription } }) } });
  replies[`GET ${praWamApi.push}`] = () => ({ body: { ok: true, data: { publicKey: "BPublicKey" }, message: "" } });
  replies[`POST ${praWamApi.push}`] = () => ({ body: { ok: true, data: {}, message: "" } });
  replies[`GET ${praWamApi.pushPrefs}`] = () => ({ body: { ok: true, data: { prefs: defaults, topics: PUSH_TOPICS }, message: "" } });
  try {
    render(<PushSwitch hod />);
    await waitFor(() => expect(screen.getByRole("switch", { name: "Notifikasi di HP" }).getAttribute("aria-checked")).toBe("true"));
    expect(await screen.findByRole("list", { name: "Notifikasi yang muncul di HP" })).toBeTruthy();
    await waitFor(() => expect((topicSwitch("hod") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(topicSwitch("hod"));
    await waitFor(() => expect(puts()).toEqual([{ prefs: { hod: false } }]));
  } finally {
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  }
});
