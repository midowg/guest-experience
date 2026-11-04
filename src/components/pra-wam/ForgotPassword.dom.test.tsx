import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { praWamPath } from "@/lib/routes";
import { ForgotPasswordForm } from "./ForgotPassword";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));

let bodies: unknown[] = [];
const answer = (body: object, status = 200) => vi.fn(async (_url: string, init: RequestInit) => {
  bodies.push(JSON.parse(init.body as string));
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
});
beforeEach(() => { bodies = []; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("sends the email and note, then says the request went to the admin and what comes next", async () => {
  vi.stubGlobal("fetch", answer({ ok: true, data: { sent: true }, message: "Permintaan terkirim ke admin WAM." }));
  render(<ForgotPasswordForm />);
  const button = screen.getByRole("button", { name: "Minta reset ke admin" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Email kantor"), { target: { value: "nama@werkudara.com" } });
  fireEvent.change(screen.getByLabelText("Catatan untuk admin (opsional)"), { target: { value: "Lupa setelah ganti HP" } });
  expect(screen.getByText("21/300 karakter")).toBeTruthy();
  fireEvent.click(button);

  const heading = await screen.findByRole("heading", { name: "Permintaan terkirim ke admin WAM" });
  expect(document.activeElement).toBe(heading);
  expect(bodies).toEqual([{ email: "nama@werkudara.com", note: "Lupa setelah ganti HP" }]);
  expect(screen.getByText("Buat password baru saat diminta.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Kembali ke halaman masuk" }).getAttribute("href")).toBe(praWamPath.login());
  expect(screen.queryByLabelText("Email kantor")).toBeNull();
});

it("before the migration tells the person to contact the admin directly", async () => {
  vi.stubGlobal("fetch", answer({ ok: true, data: { sent: false }, message: "Hubungi admin WAM langsung untuk mengatur ulang password-mu." }));
  render(<ForgotPasswordForm />);
  fireEvent.change(screen.getByLabelText("Email kantor"), { target: { value: "nama@werkudara.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Minta reset ke admin" }));
  expect(await screen.findByRole("heading", { name: "Hubungi admin WAM" })).toBeTruthy();
  expect(screen.queryByText("Buat password baru saat diminta.")).toBeNull();
});

it("shows a wrong email next to the field and keeps the form", async () => {
  vi.stubGlobal("fetch", answer({ ok: false, message: "Periksa kembali isian formulir.", fieldErrors: { email: ["Isi email kantor yang valid."] } }, 422));
  render(<ForgotPasswordForm />);
  fireEvent.change(screen.getByLabelText("Email kantor"), { target: { value: "nama" } });
  fireEvent.click(screen.getByRole("button", { name: "Minta reset ke admin" }));
  expect(await screen.findByText("Isi email kantor yang valid.")).toBeTruthy();
  expect(screen.getByLabelText("Email kantor").getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByRole("alert").textContent).toContain("Periksa kembali isian formulir.");
});
