import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AccountRow } from "@/lib/server/pra-wam/accounts";
import { praWamAccountsApi, wamAdminPath } from "@/lib/routes";
import { PraWamAccounts } from "./PraWamAccounts";

beforeAll(() => {
  // jsdom has no modal dialogs; enough of one for the detail and the confirmation.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

const people: AccountRow[] = [
  { employeeId: "e1", name: "Dewi Lestari", department: "Finance", email: "dewi@werkudara.com", active: true, hasAccount: true, lastLoginAt: "2026-11-03T02:12:00Z", mustChangePassword: false, roles: ["panitia"], leads: [] },
  { employeeId: "e2", name: "Bagus Santoso", department: "Legal", email: "bagus@werkudara.com", active: true, hasAccount: true, lastLoginAt: null, mustChangePassword: true, roles: ["bod"], leads: [] },
  { employeeId: "e3", name: "Andi Wijaya", department: "Creative", email: "", active: true, hasAccount: false, lastLoginAt: null, mustChangePassword: true, roles: [], leads: ["Creative"] },
  { employeeId: "e4", name: "Citra Ayu", department: "Finance", email: "citra@werkudara.com", active: true, hasAccount: false, lastLoginAt: null, mustChangePassword: true, roles: [], leads: [] },
];

let fetchMock: ReturnType<typeof vi.fn>;
const answer = (data: unknown, message = "Peran disimpan.") => ({ ok: true, status: 200, json: async () => ({ ok: true, message, data }) });
beforeEach(() => {
  // The remembered view also lives in memory for the visit; start every test on Kartu.
  window.localStorage.setItem("console-view:admin-wam-akun", "kartu");
  fetchMock = vi.fn(async () => answer({ rows: people }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); window.localStorage.clear(); vi.unstubAllGlobals(); });

const renderAccounts = (props: Partial<Parameters<typeof PraWamAccounts>[0]> = {}) =>
  render(<PraWamAccounts initial={people} migrated passwordReady photos={{ e1: "https://foto.test/e1.webp" }} jobs={{ e1: "Finance Lead" }} resetRequested={["e2"]} waiting={1} {...props} />);
const cards = () => within(screen.getByRole("list", { name: "Akun" })).getAllByRole("button");

describe("Akun dan peran, tab Akun", () => {
  it("heads the page with the counts, the tabs (reset count on its tab) and Buat akun", () => {
    renderAccounts();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Akun dan peran");
    expect(screen.getByText("2 orang punya akun. 1 sudah masuk, 1 belum pernah.")).toBeTruthy();
    const tabs = within(screen.getByRole("navigation", { name: "Bagian akun dan peran" })).getAllByRole("link");
    expect(tabs.map(tab => tab.getAttribute("href"))).toEqual([wamAdminPath.accounts, wamAdminPath.roles, wamAdminPath.resetRequests]);
    expect(tabs[0].getAttribute("aria-current")).toBe("page");
    expect(tabs[2].textContent).toContain("1 permintaan reset menunggu");
    // Citra has an email and no account; Andi has no email, so only one can be made.
    expect(screen.getByRole("button", { name: "Buat 1 akun" })).toBeTruthy();
  });

  it("shows people as cards A to Z, with status, roles, photo and last sign-in", () => {
    renderAccounts();
    const [andi, bagus, citra, dewi] = cards();
    expect(andi.textContent).toContain("Andi Wijaya");
    expect(andi.textContent).toContain("Belum ada akun");
    expect(andi.textContent).toContain("HOD");
    expect(bagus.textContent).toContain("Reset diminta");
    expect(bagus.textContent).toContain("BOD");
    expect(citra.textContent).toContain("Terakhir masuk: Belum ada akun");
    expect(dewi.textContent).toContain("Aktif");
    expect(dewi.textContent).toContain("Finance Lead");
    expect(dewi.textContent).toContain("Terakhir masuk: 3 Nov, 09.12");
    expect(dewi.querySelector("img")?.getAttribute("src")).toBe("https://foto.test/e1.webp");
  });

  it("searches name, unit and email, and filters by role or never signed in", () => {
    renderAccounts();
    fireEvent.change(screen.getByRole("searchbox", { name: "Cari nama, unit, atau email" }), { target: { value: "finance" } });
    expect(cards().map(card => card.textContent?.includes("Citra") || card.textContent?.includes("Dewi"))).toEqual([true, true]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Cari nama, unit, atau email" }), { target: { value: "" } });
    const chips = screen.getByRole("group", { name: "Saring peran dan status" });
    fireEvent.click(within(chips).getByRole("button", { name: /^HOD/ }));
    expect(cards()).toHaveLength(1);
    expect(cards()[0].textContent).toContain("Andi Wijaya");
    fireEvent.click(within(chips).getByRole("button", { name: /^Belum login/ }));
    expect(cards()).toHaveLength(1);
    expect(cards()[0].textContent).toContain("Bagus Santoso");
    fireEvent.click(within(chips).getByRole("button", { name: /^Admin WAM/ }));
    expect(screen.getByText(/Tidak ada orang yang cocok/)).toBeTruthy();
  });

  it("switches to the table and remembers it", () => {
    renderAccounts();
    fireEvent.click(screen.getByRole("button", { name: "Tabel" }));
    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map(cell => cell.textContent);
    expect(headers).toEqual(["Nama", "Unit", "Peran", "Email", "Status", "Terakhir masuk", "Buka"]);
    expect(within(table).getAllByRole("row")).toHaveLength(people.length + 1);
    expect(window.localStorage.getItem("console-view:admin-wam-akun")).toBe("tabel");
    cleanup();
    renderAccounts();
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("opens a person's detail from the card, and saves a role there", async () => {
    renderAccounts();
    fireEvent.click(cards()[3]);
    const detail = screen.getByRole("dialog", { name: "Dewi Lestari" });
    expect(within(detail).getByRole("checkbox", { name: "Panitia: Dewi Lestari" })).toHaveProperty("checked", true);
    await act(async () => { fireEvent.click(within(detail).getByRole("checkbox", { name: "Admin WAM: Dewi Lestari" })); });
    expect(fetchMock).toHaveBeenCalledWith(praWamAccountsApi("e1"), expect.objectContaining({ method: "PATCH", body: JSON.stringify({ roles: ["panitia", "admin"] }) }));
    expect(within(detail).getByRole("status").textContent).toBe("Peran disimpan.");
    // BOD is locked for Panitia, and the reason is written out.
    expect(within(detail).getByRole("checkbox", { name: "BOD: Dewi Lestari" })).toHaveProperty("disabled", true);
    expect(within(detail).getByText("BOD terkunci karena orang ini Panitia atau Admin WAM.")).toBeTruthy();
    fireEvent.click(within(detail).getByRole("button", { name: "Tutup" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows a refused change inside the detail", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({ ok: false, message: "BOD tidak bisa digabung dengan Panitia." }) });
    renderAccounts();
    fireEvent.click(cards()[1]);
    const detail = screen.getByRole("dialog", { name: "Bagus Santoso" });
    expect(within(detail).getByRole("checkbox", { name: "Panitia: Bagus Santoso" })).toHaveProperty("disabled", true);
    await act(async () => { fireEvent.click(within(detail).getByRole("checkbox", { name: "BOD: Bagus Santoso" })); });
    expect(within(detail).getByRole("alert").textContent).toBe("BOD tidak bisa digabung dengan Panitia.");
  });

  it("changes the sign-in email", async () => {
    renderAccounts();
    fireEvent.click(cards()[3]);
    const detail = screen.getByRole("dialog", { name: "Dewi Lestari" });
    fireEvent.click(within(detail).getByRole("button", { name: "Ubah email Dewi Lestari" }));
    fireEvent.change(within(detail).getByRole("textbox", { name: "Email Dewi Lestari" }), { target: { value: "dewi.l@werkudara.com" } });
    await act(async () => { fireEvent.click(within(detail).getByRole("button", { name: "Simpan" })); });
    expect(fetchMock).toHaveBeenCalledWith(praWamAccountsApi("e1"), expect.objectContaining({ method: "PATCH", body: JSON.stringify({ email: "dewi.l@werkudara.com" }) }));
    expect(within(detail).queryByRole("textbox", { name: "Email Dewi Lestari" })).toBeNull();
  });

  it("asks before resetting a password", async () => {
    renderAccounts();
    fireEvent.click(cards()[3]);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Dewi Lestari" })).getByRole("button", { name: "Reset password" }));
    const confirm = screen.getByRole("dialog", { name: "Atur ulang password?" });
    await act(async () => { fireEvent.click(within(confirm).getByRole("button", { name: "Atur ulang" })); });
    expect(fetchMock).toHaveBeenCalledWith(praWamAccountsApi("e1"), expect.objectContaining({ method: "PATCH", body: JSON.stringify({ resetPassword: true }) }));
  });

  it("makes the missing accounts, or one person's account from the detail", async () => {
    renderAccounts();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Buat 1 akun" })); });
    expect(fetchMock).toHaveBeenLastCalledWith(praWamAccountsApi(), expect.objectContaining({ method: "POST" }));
    fireEvent.click(cards()[2]);
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog", { name: "Citra Ayu" })).getByRole("button", { name: "Buat akun" })); });
    expect(fetchMock).toHaveBeenLastCalledWith(praWamAccountsApi("e4"), expect.objectContaining({ method: "POST" }));
  });

  it("cannot make an account without an email, and says so", () => {
    renderAccounts();
    fireEvent.click(cards()[0]);
    const detail = screen.getByRole("dialog", { name: "Andi Wijaya" });
    expect(within(detail).getByRole("button", { name: "Buat akun" })).toHaveProperty("disabled", true);
    expect(within(detail).getByText("Isi emailnya dulu untuk membuat akun.")).toBeTruthy();
  });

  it("waits for the first password before making or resetting accounts", () => {
    renderAccounts({ passwordReady: false });
    expect(screen.getByText(/Password awal belum disiapkan/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Buat 1 akun" })).toHaveProperty("disabled", true);
  });

  it("says the migration is missing instead of an empty list", () => {
    renderAccounts({ migrated: false, initial: [] });
    expect(screen.getByText(/menunggu migrasi 202611040001/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Akun" })).toBeNull();
  });
});
