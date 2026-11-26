import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PraWamApiError } from "@/components/pra-wam/api";
import { coffeePath, praWamApi } from "@/lib/routes";
import { CoffeeApiError } from "../api";
import { samplePush } from "../pushSample";

/* The tablet's own sign-in (26 Nov 2026) with the server replaced: a made-up email, no real account. */
const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const request = vi.hoisted(() => vi.fn());
vi.mock("@/components/pra-wam/api", async original => ({ ...(await original<typeof import("@/components/pra-wam/api")>()), praWamRequest: request }));

const { GaDenied, GaLogin } = await import("./GaAuth");
const { CoffeeForgot } = await import("../CoffeeAuth");

beforeEach(() => { request.mockReset(); router.refresh.mockReset(); router.replace.mockReset(); });
afterEach(cleanup);

const fill = (email = "contoh@example.com", password = "rahasia-contoh") => {
  fireEvent.change(screen.getByLabelText("Email kantor"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
};
const submit = () => screen.getByRole("button", { name: "Masuk" }) as HTMLButtonElement;

it("is the tablet's page on the employee account: the same sign-in request, then straight to Mode GA", async () => {
  request.mockResolvedValue({ data: { askNewPassword: false } });
  render(<GaLogin next={null} />);
  expect(screen.getByRole("heading", { level: 1, name: "Masuk · Mode GA" })).toBeTruthy();
  expect(screen.getByText("Tablet GA").parentElement?.textContent).toBe("WG CoffeeTablet GA");
  expect(submit().disabled).toBe(true);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Lihat password" }));
  expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("text");
  fireEvent.click(submit());
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith(coffeePath.ga));
  // The very request /coffee/masuk sends: no API of the tablet's own.
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toBe(praWamApi.login);
  expect(request.mock.calls[0][1]).toMatchObject({ method: "POST", json: { email: "contoh@example.com", password: "rahasia-contoh" } });
});

it("opens the order the address named, when the page let it through", async () => {
  request.mockResolvedValue({ data: { askNewPassword: false } });
  const order = coffeePath.gaOrder("0b9d6f0e-1c1c-4c39-9d0b-3d1b3a0d7b11");
  render(<GaLogin next={order} />);
  fill();
  fireEvent.click(submit());
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith(order));
});

it("sends a first password on to Buat password baru, which leads back to Mode GA and never to the employee app", async () => {
  request.mockResolvedValue({ data: { askNewPassword: true } });
  render(<GaLogin next={null} />);
  fill();
  fireEvent.click(submit());
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith(coffeePath.newPassword(coffeePath.ga)));
  expect(router.replace).toHaveBeenCalledTimes(1);
});

it("says why signing in failed next to the form, and Lupa password comes back to the tablet's sign-in", async () => {
  request.mockRejectedValue(new PraWamApiError("Email atau password salah.", 401));
  render(<GaLogin next={null} />);
  fill("contoh@example.com", "salah");
  fireEvent.click(submit());
  expect((await screen.findByRole("alert")).textContent).toBe("Email atau password salah.");
  expect(router.replace).not.toHaveBeenCalled();
  expect(submit().disabled).toBe(false);
  expect(screen.getByRole("link", { name: "Lupa password?" }).getAttribute("href")).toBe(coffeePath.gaForgot);
  expect(screen.getByRole("link", { name: "Aplikasi karyawan" }).getAttribute("href")).toBe(coffeePath.home);
  cleanup();
  // Lupa password as the tablet's sign-in opens it: both ways back are the tablet's sign-in.
  request.mockReset(); request.mockResolvedValue({});
  render(<CoffeeForgot back={coffeePath.gaLogin()} />);
  expect(screen.getByRole("link", { name: "Kembali" }).getAttribute("href")).toBe(coffeePath.gaLogin());
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "contoh@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Kirim permintaan" }));
  expect((await screen.findByRole("link", { name: "Kembali ke Masuk" })).getAttribute("href")).toBe(coffeePath.gaLogin());
  cleanup();
  // Without it, the employee app's sign-in as before.
  render(<CoffeeForgot />);
  expect(screen.getByRole("link", { name: "Kembali" }).getAttribute("href")).toBe(coffeePath.login());
});

it("tells an account without Mode GA so, with a way out and a way to the employee app", async () => {
  const port = samplePush("on");
  const signOut = vi.fn(async () => undefined);
  render(<GaDenied name="Rina (contoh)" signOut={signOut} push={port} />);
  expect(screen.getByRole("heading", { level: 1, name: "Belum ada akses Mode GA" })).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe("Akun ini belum punya akses Mode GA. Minta pengelola WG Coffee.");
  expect(screen.getByText("Kamu masuk sebagai Rina (contoh).")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Buka aplikasi karyawan" }).getAttribute("href")).toBe(coffeePath.home);
  fireEvent.click(screen.getByRole("button", { name: "Keluar dan masuk dengan akun lain" }));
  await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  // This device's notifications are let go of first, on the server and in the browser.
  expect(port.calls.some(call => call.startsWith("remove:"))).toBe(true);
  expect(port.calls).toContain("unsubscribe");
  // The name does not stay while the sign-in page is on its way.
  await waitFor(() => expect(screen.queryByText(/Rina/)).toBeNull());
  expect(screen.getByRole("link", { name: "Masuk dengan akun lain" }).getAttribute("href")).toBe(coffeePath.gaLogin());
});

it("stays, and says so, when the server could not be told about Keluar", async () => {
  const signOut = vi.fn(async () => { throw new CoffeeApiError("Belum bisa keluar. Periksa jaringan lalu coba lagi."); });
  render(<GaDenied name="Rina (contoh)" signOut={signOut} push={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Keluar dan masuk dengan akun lain" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Belum bisa keluar. Periksa jaringan lalu coba lagi.");
  expect(screen.getByText("Kamu masuk sebagai Rina (contoh).")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Keluar dan masuk dengan akun lain" }));
  await waitFor(() => expect(signOut).toHaveBeenCalledTimes(2));
});
