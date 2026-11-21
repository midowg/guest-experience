import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/* WG People's own sign-in (21 Nov 2026) with the server replaced: a made-up email. */
const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const request = vi.hoisted(() => vi.fn());
vi.mock("@/components/pra-wam/api", async original => ({ ...(await original<typeof import("@/components/pra-wam/api")>()), praWamRequest: request }));

const { HrForgot, HrLogin } = await import("./HrAuth");

beforeEach(() => { request.mockReset(); router.refresh.mockReset(); router.replace.mockReset(); });
afterEach(cleanup);

it("signs in with the WAM account and goes on to WG People", async () => {
  request.mockResolvedValue({ data: { askNewPassword: false } });
  render(<HrLogin next={null} />);
  expect(screen.getByRole("heading", { level: 1, name: "Masuk" })).toBeTruthy();
  expect(screen.getByText("Hari kerja dimulai di sini.")).toBeTruthy();
  const submit = screen.getByRole("button", { name: "Masuk" }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Email kantor"), { target: { value: "contoh@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "rahasia-contoh" } });
  fireEvent.click(screen.getByRole("button", { name: "Lihat password" }));
  expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("text");
  expect(submit.disabled).toBe(false);
  fireEvent.click(submit);
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/people"));
  expect(request.mock.calls[0][1]).toMatchObject({ method: "POST", json: { email: "contoh@example.com", password: "rahasia-contoh" } });
});

it("says why signing in failed, next to the form", async () => {
  request.mockRejectedValue(new Error("Email atau password salah."));
  render(<HrLogin next="/people/riwayat" />);
  fireEvent.change(screen.getByLabelText("Email kantor"), { target: { value: "contoh@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "salah" } });
  fireEvent.click(screen.getByRole("button", { name: "Masuk" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/salah|gagal|coba/i);
  expect(router.replace).not.toHaveBeenCalled();
});

it("sends a forgotten-password request and says what happens next", async () => {
  request.mockResolvedValue({ data: null });
  render(<HrForgot />);
  fireEvent.change(screen.getByLabelText("Email kantor"), { target: { value: "contoh@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Kirim permintaan" }));
  expect(await screen.findByRole("status")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Kembali ke Masuk/ }).getAttribute("href")).toBe("/people/masuk");
});
