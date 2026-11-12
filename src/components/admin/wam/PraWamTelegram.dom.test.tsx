import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { TelegramStatus } from "@/lib/pra-wam/telegram";

const request = vi.fn();
vi.mock("@/components/admin/shared/api", async importOriginal => ({ ...(await importOriginal<object>()), adminRequest: (...args: unknown[]) => request(...args) }));
const { PraWamTelegram, telegramRows } = await import("./PraWamTelegram");

afterEach(() => { cleanup(); request.mockReset(); });

const status: TelegramStatus = {
  configured: true, bot: { username: "wam_werkudara_bot", name: "WAM Werkudara" }, botError: null,
  webhook: { set: true, ours: true, pending: 0, lastError: null, lastErrorAt: null }, migrated: true,
  groups: [
    { chatId: "-1001", title: "Werkudara CoE · Center of Excellence", scope: "departemen", department: "Center of Excellence", unit: null, isForum: true, momTopicId: 12, botStatus: "admin", installedAt: "2026-11-12T04:00:00Z" },
    { chatId: "-1002", title: "Lama", scope: "departemen", department: "Divisi Lama", unit: null, isForum: false, momTopicId: null, botStatus: "dikeluarkan", installedAt: "2026-11-12T04:00:00Z" },
  ],
  departments: [
    { name: "Center of Excellence", short: "CoE", unit: null, groupTitle: "WG CoE · Center of Excellence" },
    { name: "Sales & Marketing", short: "SM", unit: null, groupTitle: "Werkudara SM · Sales & Marketing" },
  ],
};

it("lists the HOD group first, then each department with its group, and a group whose department is gone", () => {
  expect(telegramRows(status).map(row => [row.label, row.group?.chatId ?? null, !!row.unknown])).toEqual([
    ["Grup HOD", null, false], ["Center of Excellence", "-1001", false], ["Sales & Marketing", null, false], ["Divisi Lama", "-1002", true],
  ]);
});

it("shows the bot and webhook, and a department's group with its bot status and topic", () => {
  render(<PraWamTelegram initial={status} />);
  expect(screen.getByRole("heading", { level: 1, name: "Telegram" })).toBeTruthy();
  expect(screen.getByText(/Webhook: aktif/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Pasang ulang webhook" })).toBeTruthy();
  const coe = screen.getByText("Center of Excellence", { selector: "strong" }).closest("li")!;
  expect(within(coe).getByText("Bot admin")).toBeTruthy();
  expect(within(coe).getByText("Topik 📝 MoM")).toBeTruthy();
  expect(within(coe).queryByRole("button", { name: "Buat topik" })).toBeNull();
  const old = screen.getByText("Divisi Lama", { selector: "strong" }).closest("li")!;
  expect(within(old).getByText("Bot dikeluarkan")).toBeTruthy();
  expect(within(old).getByText("Tidak ada di Data karyawan")).toBeTruthy();
  // A group without the topic can ask for it, even when WAM does not know yet that it turned topics on.
  expect(within(old).getByRole("button", { name: "Buat topik" })).toBeTruthy();
  expect(within(old).queryByRole("button", { name: /Pasang/ })).toBeNull();
});

it("makes a one-time link for a department and shows both ways to install it", async () => {
  request.mockResolvedValue({ message: "Tautan pemasangan dibuat.", data: { scope: "departemen", department: "Sales & Marketing", link: "https://t.me/wam_werkudara_bot?startgroup=CODE", command: "/start@wam_werkudara_bot CODE", expiresAt: "2026-11-12T05:00:00Z" } });
  render(<PraWamTelegram initial={status} />);
  const sm = screen.getByText("Sales & Marketing", { selector: "strong" }).closest("li")!;
  fireEvent.click(within(sm).getByRole("button", { name: "Pasang grup" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ action: "install", scope: "departemen", department: "Sales & Marketing", unit: null });
  const panel = await within(sm).findByRole("group", { name: "Pasang grup Sales & Marketing" });
  expect(within(panel).getByRole("link", { name: /Buka di Telegram/ }).getAttribute("href")).toBe("https://t.me/wam_werkudara_bot?startgroup=CODE");
  expect(within(panel).getByText("/start@wam_werkudara_bot CODE")).toBeTruthy();
  expect(within(panel).getByText(/Berlaku sampai 12\.00 WIB/)).toBeTruthy();
});

it("asks for one name: a group called otherwise in Telegram is renamed by the bot", async () => {
  request.mockResolvedValue({ message: "Nama grup diganti jadi WG CoE · Center of Excellence.", data: status });
  render(<PraWamTelegram initial={status} />);
  const coe = screen.getByText("Center of Excellence", { selector: "strong" }).closest("li")!;
  expect(within(coe).getByText(/Nama di Telegram belum seragam/)).toBeTruthy();
  fireEvent.click(within(coe).getByRole("button", { name: "Samakan nama" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ action: "rename", chatId: "-1001" });
});

it("sends a sample MoM and shows the answer", async () => {
  request.mockResolvedValue({ message: "Contoh MoM terkirim ke Werkudara CoE · Center of Excellence (topik 📝 MoM).", data: status });
  render(<PraWamTelegram initial={status} />);
  const coe = screen.getByText("Center of Excellence", { selector: "strong" }).closest("li")!;
  fireEvent.click(within(coe).getByRole("button", { name: "Kirim contoh MoM" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ action: "sample", chatId: "-1001" });
  expect(await screen.findByText(/Contoh MoM terkirim/)).toBeTruthy();
});

it("ties the CoS's own chat with a link to open in Telegram, and shows it once tied", async () => {
  request.mockResolvedValue({ message: "Tautan pemasangan dibuat.", data: { scope: "cos", department: null, unit: null, link: "https://t.me/wam_werkudara_bot?start=CODE", command: "/start CODE", expiresAt: "2026-11-12T05:00:00Z" } });
  const { unmount } = render(<PraWamTelegram initial={status} />);
  expect(screen.getByRole("heading", { name: "MoM untuk BOD (lewat CoS)" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Sambungkan CoS" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ action: "install", scope: "cos" });
  const panel = await screen.findByRole("group", { name: "Sambungkan chat CoS" });
  expect(within(panel).getByRole("link", { name: /Buka di Telegram/ }).getAttribute("href")).toBe("https://t.me/wam_werkudara_bot?start=CODE");
  unmount();

  const cos = { chatId: "42", title: "CoS · Rina Putri", scope: "cos" as const, department: null, unit: null, isForum: false, momTopicId: null, botStatus: "admin" as const, installedAt: "2026-11-12T04:00:00Z" };
  render(<PraWamTelegram initial={{ ...status, groups: [...status.groups, cos] }} />);
  expect(screen.getByText("CoS · Rina Putri")).toBeTruthy();
  expect(screen.getByText("Tersambung")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Ganti CoS" })).toBeTruthy();
  // Not a department row, and not counted with the groups.
  expect(screen.getByRole("heading", { name: "Grup (2 terpasang)" })).toBeTruthy();
});

it("says what is missing before the bot or the migration is ready, and keeps the buttons off", () => {
  render(<PraWamTelegram initial={{ ...status, configured: false, bot: null, webhook: null, migrated: false, groups: [] }} />);
  expect(screen.getByText(/Bot belum disiapkan di server/)).toBeTruthy();
  expect(screen.getByText(/menunggu migrasi 202611120002_pw_telegram.sql/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "Pasang webhook" }) as HTMLButtonElement).disabled).toBe(true);
  for (const button of screen.getAllByRole("button", { name: "Pasang grup" })) expect((button as HTMLButtonElement).disabled).toBe(true);
});

it("gives each team of a department its own row and install, and a team's group its row", async () => {
  request.mockResolvedValue({ message: "Tautan pemasangan dibuat.", data: { scope: "departemen", department: "Sales & Marketing", unit: "Commercial", link: "https://t.me/x?startgroup=C", command: "/start@x C", expiresAt: "2026-11-12T05:00:00Z" } });
  const teams: TelegramStatus = {
    ...status,
    groups: [{ chatId: "-1009", title: "Werkudara SM · Business Solutions", scope: "departemen", department: "Sales & Marketing", unit: "Business Solutions", isForum: true, momTopicId: 3, botStatus: "admin", installedAt: "2026-11-12T04:00:00Z" }],
    departments: [
      { name: "Sales & Marketing", short: "SM", unit: "Business Solutions", groupTitle: "Werkudara SM · Business Solutions" },
      { name: "Sales & Marketing", short: "SM", unit: "Commercial", groupTitle: "Werkudara SM · Commercial" },
    ],
  };
  expect(telegramRows(teams).map(row => [row.label, row.group?.chatId ?? null])).toEqual([
    ["Grup HOD", null], ["Sales & Marketing · Business Solutions", "-1009"], ["Sales & Marketing · Commercial", null],
  ]);
  render(<PraWamTelegram initial={teams} />);
  const commercial = screen.getByText("Sales & Marketing · Commercial", { selector: "strong" }).closest("li")!;
  expect(within(commercial).getByText(/nama disarankan: Werkudara SM · Commercial/)).toBeTruthy();
  fireEvent.click(within(commercial).getByRole("button", { name: "Pasang grup" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ action: "install", scope: "departemen", department: "Sales & Marketing", unit: "Commercial" });
});
