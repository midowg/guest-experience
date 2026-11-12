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
    { chatId: "-1001", title: "Werkudara CoE · Center of Excellence", scope: "departemen", department: "Center of Excellence", isForum: true, momTopicId: 12, botStatus: "admin", installedAt: "2026-11-12T04:00:00Z" },
    { chatId: "-1002", title: "Lama", scope: "departemen", department: "Divisi Lama", isForum: false, momTopicId: null, botStatus: "dikeluarkan", installedAt: "2026-11-12T04:00:00Z" },
  ],
  departments: [
    { name: "Center of Excellence", short: "CoE", groupTitle: "Werkudara CoE · Center of Excellence" },
    { name: "Sales & Marketing", short: "SM", groupTitle: "Werkudara SM · Sales & Marketing" },
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
  const old = screen.getByText("Divisi Lama", { selector: "strong" }).closest("li")!;
  expect(within(old).getByText("Bot dikeluarkan")).toBeTruthy();
  expect(within(old).getByText("Tidak ada di Data karyawan")).toBeTruthy();
  expect(within(old).queryByRole("button", { name: /Pasang/ })).toBeNull();
});

it("makes a one-time link for a department and shows both ways to install it", async () => {
  request.mockResolvedValue({ message: "Tautan pemasangan dibuat.", data: { scope: "departemen", department: "Sales & Marketing", link: "https://t.me/wam_werkudara_bot?startgroup=CODE", command: "/start@wam_werkudara_bot CODE", expiresAt: "2026-11-12T05:00:00Z" } });
  render(<PraWamTelegram initial={status} />);
  const sm = screen.getByText("Sales & Marketing", { selector: "strong" }).closest("li")!;
  fireEvent.click(within(sm).getByRole("button", { name: "Pasang grup" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ action: "install", scope: "departemen", department: "Sales & Marketing" });
  const panel = await within(sm).findByRole("group", { name: "Pasang grup Sales & Marketing" });
  expect(within(panel).getByRole("link", { name: /Buka di Telegram/ }).getAttribute("href")).toBe("https://t.me/wam_werkudara_bot?startgroup=CODE");
  expect(within(panel).getByText("/start@wam_werkudara_bot CODE")).toBeTruthy();
  expect(within(panel).getByText(/Berlaku sampai 12\.00 WIB/)).toBeTruthy();
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

it("says what is missing before the bot or the migration is ready, and keeps the buttons off", () => {
  render(<PraWamTelegram initial={{ ...status, configured: false, bot: null, webhook: null, migrated: false, groups: [] }} />);
  expect(screen.getByText(/Bot belum disiapkan di server/)).toBeTruthy();
  expect(screen.getByText(/menunggu migrasi 202611120002_pw_telegram.sql/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "Pasang webhook" }) as HTMLButtonElement).disabled).toBe(true);
  for (const button of screen.getAllByRole("button", { name: "Pasang grup" })) expect((button as HTMLButtonElement).disabled).toBe(true);
});
