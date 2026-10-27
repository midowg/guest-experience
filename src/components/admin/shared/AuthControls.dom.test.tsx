import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LoginForm, LogoutButton } from "@/components/admin/shared/AuthControls";

// After the session cookie changes the page is left with a full load (see navigate.ts).
const replace = vi.fn();
vi.mock("@/components/admin/shared/navigate", () => ({ reloadTo: (url: string) => replace(url) }));

function reply(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("admin login form", () => {
  it("asks for the password only and shows the server's refusal", async () => {
    const fetch = vi.fn(async () => reply({ ok: false, message: "Password tidak cocok. Periksa lalu coba lagi." }, 401));
    vi.stubGlobal("fetch", fetch);
    render(<LoginForm next="/admin" />);
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    const input = screen.getByLabelText("Password admin") as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.change(input, { target: { value: "salah-sekali-ini" } });
    fireEvent.click(screen.getByRole("button", { name: /Masuk/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Password tidak cocok");
    expect(fetch).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ method: "POST", body: JSON.stringify({ password: "salah-sekali-ini" }) }));
    expect(screen.getByRole("button", { name: /Masuk/ }).hasAttribute("disabled")).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it("goes to the requested admin page after a correct password", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ ok: true, data: { logged: true }, message: "Berhasil masuk." })));
    render(<LoginForm next="/admin/events/abc" />);
    fireEvent.change(screen.getByLabelText("Password admin"), { target: { value: "password-yang-benar" } });
    fireEvent.click(screen.getByRole("button", { name: /Masuk/ }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/events/abc"));
  });

  it("can reveal the typed password", () => {
    render(<LoginForm next="/admin" />);
    const input = screen.getByLabelText("Password admin") as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Tampilkan password" }));
    expect(input.type).toBe("text");
    expect(screen.getByRole("button", { name: "Sembunyikan password" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("super admin login", () => {
  it("lands on the super admin dashboard", async () => {
    replace.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => reply({ ok: true, data: { logged: true, role: "super" }, message: "Berhasil masuk sebagai super admin." })));
    render(<LoginForm next="/admin" />);
    fireEvent.change(screen.getByLabelText("Password admin"), { target: { value: "password-super-admin" } });
    fireEvent.click(screen.getByRole("button", { name: /Masuk/ }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/super"));
  });
  it("still honours a specific destination", async () => {
    replace.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => reply({ ok: true, data: { logged: true, role: "super" }, message: "OK" })));
    render(<LoginForm next="/admin/akses" />);
    fireEvent.change(screen.getByLabelText("Password admin"), { target: { value: "password-super-admin" } });
    fireEvent.click(screen.getByRole("button", { name: /Masuk/ }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/akses"));
  });
});

describe("logout", () => {
  it("leaves for the login page once the session is closed", async () => {
    replace.mockClear();
    const fetch = vi.fn(async () => reply({ ok: true, data: null, message: "Berhasil keluar." }));
    vi.stubGlobal("fetch", fetch);
    render(<LogoutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Keluar" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/login"));
    expect(fetch).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
  });
});
