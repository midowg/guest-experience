import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PraWamApiError } from "@/components/pra-wam/api";
import { coffeePath, praWamApi } from "@/lib/routes";

/* Werkudara Coffee's own sign-in (26 Nov 2026) with the server replaced: a made-up email. */
const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const request = vi.hoisted(() => vi.fn());
vi.mock("@/components/pra-wam/api", async original => ({ ...(await original<typeof import("@/components/pra-wam/api")>()), praWamRequest: request }));

const { CoffeeForgot, CoffeeLogin, CoffeeNewPassword, CoffeeWaiting } = await import("./CoffeeAuth");

beforeEach(() => { request.mockReset(); router.refresh.mockReset(); router.replace.mockReset(); window.localStorage.clear(); });
afterEach(cleanup);

const fill = (email = "contoh@example.com", password = "rahasia-contoh") => {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
};

it("welcomes first, then signs in with the employee account and opens the app", async () => {
  request.mockResolvedValue({ data: { askNewPassword: false } });
  render(<CoffeeLogin next={null} />);
  expect(screen.getByRole("heading", { level: 1, name: "Werkudara Coffee" })).toBeTruthy();
  expect(screen.getByText("Masuk dengan akun karyawan Journey")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Masuk" }));
  expect(screen.getByRole("heading", { level: 1, name: "Masuk" })).toBeTruthy();
  const submit = screen.getByRole("button", { name: "Masuk" }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Lihat password" }));
  expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("text");
  expect(submit.disabled).toBe(false);
  fireEvent.click(submit);
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith(coffeePath.home));
  expect(request.mock.calls[0][0]).toBe(praWamApi.login);
  expect(request.mock.calls[0][1]).toMatchObject({ method: "POST", json: { email: "contoh@example.com", password: "rahasia-contoh" } });
  expect(request).toHaveBeenCalledTimes(1);
});

it("goes back to where the person was headed, and skips the welcome on a device that signed in before", async () => {
  request.mockResolvedValue({ data: { askNewPassword: false } });
  const first = render(<CoffeeLogin next={coffeePath.orders} />);
  expect(screen.getByRole("heading", { level: 1, name: "Masuk" })).toBeTruthy();
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Masuk" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith(coffeePath.orders));
  first.unmount();
  render(<CoffeeLogin next={null} />);
  expect(screen.getByRole("heading", { level: 1, name: "Masuk" })).toBeTruthy();
  // Kembali still shows the welcome.
  fireEvent.click(screen.getByRole("button", { name: "Kembali" }));
  expect(screen.getByRole("heading", { level: 1, name: "Werkudara Coffee" })).toBeTruthy();
});

it("sends someone on the first password to make a new one, on Coffee's own page", async () => {
  request.mockResolvedValue({ data: { askNewPassword: true } });
  render(<CoffeeLogin next={coffeePath.orders} />);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Masuk" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith(coffeePath.newPassword(coffeePath.orders)));
});

it("says why signing in failed, next to the form, and lets the person try again", async () => {
  request.mockRejectedValue(new PraWamApiError("Email atau password salah.", 401));
  render(<CoffeeLogin next={coffeePath.home} />);
  fill("contoh@example.com", "salah");
  fireEvent.click(screen.getByRole("button", { name: "Masuk" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Email atau password salah.");
  expect(router.replace).not.toHaveBeenCalled();
  expect((screen.getByRole("button", { name: "Masuk" }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByRole("link", { name: "Lupa password?" }).getAttribute("href")).toBe(coffeePath.forgot);
});

it("sends a forgotten-password request and says what happens next", async () => {
  request.mockResolvedValue({ data: null });
  render(<CoffeeForgot />);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "contoh@example.com" } });
  fireEvent.change(screen.getByLabelText(/Catatan untuk admin/), { target: { value: "HP baru" } });
  fireEvent.click(screen.getByRole("button", { name: "Kirim permintaan" }));
  expect((await screen.findByRole("status")).textContent).toMatch(/password awal/);
  expect(request.mock.calls[0][1]).toMatchObject({ json: { email: "contoh@example.com", note: "HP baru" } });
  expect(screen.getByRole("link", { name: /Kembali ke Masuk/ }).getAttribute("href")).toBe(coffeePath.login());
});

it("asks for a new password with the rules ticked as they are met, or lets the person skip", () => {
  render(<CoffeeNewPassword next={coffeePath.home} />);
  const save = screen.getByRole("button", { name: "Simpan password" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  expect(screen.getByRole("list", { name: "Syarat password" }).querySelectorAll("li[data-ok]")).toHaveLength(0);
  expect(screen.getByRole("link", { name: "Nanti saja" }).getAttribute("href")).toBe(coffeePath.home);
  for (const label of ["Password awal", "Password baru", "Ulangi password baru"]) expect(screen.getByLabelText(label)).toBeTruthy();
});

it("says plainly that the app is not open yet before the migration ran", () => {
  render(<CoffeeWaiting detail="Werkudara Coffee menunggu migrasi 202612010001_coffee.sql." />);
  expect(screen.getByRole("heading", { level: 1, name: "Werkudara Coffee belum dibuka" })).toBeTruthy();
  expect(screen.getByText(/Rincian untuk admin: Werkudara Coffee menunggu migrasi 202612010001_coffee\.sql\./)).toBeTruthy();
});
