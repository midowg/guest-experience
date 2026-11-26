import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { drinkBySlug } from "@/lib/coffee/menu";
import type { CoffeeMe } from "@/lib/coffee/types";
import type { ClaimChoice } from "./api";
import { DrinkSheet } from "./DrinkSheet";

/* The drink's options (26 Nov 2026): only what the drink comes in, takaran es only for Es. The key of a claim lives in useCoffee (CoffeeApp.dom.test.tsx). */
const me = (more: Partial<CoffeeMe> = {}): CoffeeMe => ({ id: "p-rina", name: "Rina (contoh)", group: "karyawan", quota: 4, used: 1, left: 3, month: "2026-11", ...more });

function open(slug: string, who = me(), onSubmit: (body: ClaimChoice) => Promise<string> = async () => "") {
  const onClose = vi.fn(), submit = vi.fn(onSubmit);
  render(<DrinkSheet drink={drinkBySlug(slug)!} me={who} onClose={onClose} onSubmit={submit} />);
  return { onClose, submit, sheet: within(screen.getByRole("dialog")) };
}
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");
afterEach(cleanup);

it("offers Panas and Es, six sugar levels, and takaran es only once Es is picked", async () => {
  const { sheet, submit } = open("cafe-latte");
  expect(screen.getByRole("dialog", { name: "Café Latte" })).toBeTruthy();
  expect(sheet.getByRole("group", { name: "Suhu" })).toBeTruthy();
  expect(within(sheet.getByRole("group", { name: "Gula" })).getAllByRole("button").map(button => button.textContent)).toEqual(["Tanpa", "Sedikit", "Setengah", "Kurang", "Normal", "Ekstra"]);
  expect(pressed("Panas")).toBe("true");
  expect(pressed("Normal")).toBe("true");
  expect(sheet.queryByRole("group", { name: "Takaran es" })).toBeNull();
  expect(sheet.getByText("Ini klaim ke-2 dari 4 bulan November.")).toBeTruthy();
  expect(sheet.getByText("Dikirim ke pengelola WG Coffee: HR dan admin yang punya akses.")).toBeTruthy();

  fireEvent.click(sheet.getByRole("button", { name: "Es" }));
  const ice = within(sheet.getByRole("group", { name: "Takaran es" }));
  expect(ice.getAllByRole("button").map(button => button.textContent)).toEqual(["Sedikit", "Normal", "Ekstra"]);
  fireEvent.click(ice.getByRole("button", { name: "Ekstra" }));
  fireEvent.click(within(sheet.getByRole("group", { name: "Gula" })).getByRole("button", { name: "Sedikit" }));
  fireEvent.click(sheet.getByRole("button", { name: "Ajukan klaim" }));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  expect(submit.mock.calls[0][0]).toEqual({ slug: "cafe-latte", temperature: "es", sugar: "Sedikit", ice: "Ekstra" });
});

it("never sends a takaran es for a hot drink, also after Es was tried", async () => {
  const { sheet, submit } = open("kopi-susu");
  fireEvent.click(sheet.getByRole("button", { name: "Es" }));
  fireEvent.click(within(sheet.getByRole("group", { name: "Takaran es" })).getByRole("button", { name: "Sedikit" }));
  fireEvent.click(sheet.getByRole("button", { name: "Panas" }));
  expect(sheet.queryByRole("group", { name: "Takaran es" })).toBeNull();
  fireEvent.click(sheet.getByRole("button", { name: "Ajukan klaim" }));
  await waitFor(() => expect(submit).toHaveBeenCalled());
  expect(submit.mock.calls[0][0]).toMatchObject({ temperature: "panas", ice: "Normal" });
});

it("shows only what the drink comes in: Espresso is hot, Cucumber Ice is iced", () => {
  const hot = open("espresso");
  expect(hot.sheet.queryByRole("group", { name: "Suhu" })).toBeNull();
  expect(hot.sheet.queryByRole("group", { name: "Takaran es" })).toBeNull();
  cleanup();
  const iced = open("cucumber-ice");
  expect(iced.sheet.queryByRole("group", { name: "Suhu" })).toBeNull();
  expect(iced.sheet.getByRole("group", { name: "Takaran es" })).toBeTruthy();
});

it("sends one claim for a double tap, and keeps the sheet open while it is sent", async () => {
  let answer: (problem: string) => void = () => undefined;
  const { sheet, submit, onClose } = open("americano", me(), () => new Promise<string>(resolve => { answer = resolve; }));
  const button = sheet.getByRole("button", { name: "Ajukan klaim" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(submit).toHaveBeenCalledTimes(1);
  expect(sheet.getByRole("button", { name: "Mengirim…" }).getAttribute("aria-disabled")).toBe("true");
  // Escape, the X and a press outside do not close a sheet whose claim is on its way.
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
  expect(onClose).not.toHaveBeenCalled();
  expect((sheet.getByRole("button", { name: "Tutup" }) as HTMLButtonElement).disabled).toBe(true);
  answer("");
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
});

it("says why a claim was refused, lets go of the sheet, and sends the same choice when tried again", async () => {
  const answers = ["Tidak dapat terhubung. Periksa jaringan lalu coba lagi.", ""];
  const { sheet, submit, onClose } = open("americano", me(), async () => answers.shift() ?? "");
  fireEvent.click(sheet.getByRole("button", { name: "Ajukan klaim" }));
  expect((await sheet.findByRole("alert")).textContent).toBe("Tidak dapat terhubung. Periksa jaringan lalu coba lagi.");
  // The refusal gave the sheet back: the X works again (a request that hung does not lock the person in).
  expect((sheet.getByRole("button", { name: "Tutup" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(sheet.getByRole("button", { name: "Ajukan klaim" }));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  expect(submit.mock.calls[1][0]).toEqual(submit.mock.calls[0][0]);
  expect(sheet.queryByRole("alert")).toBeNull();
  // Nothing is being sent any more: Escape closes.
  cleanup();
  const again = open("americano");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(again.onClose).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
});

it("turns the button off with the reason when the quota is used up", () => {
  const { sheet, submit } = open("americano", me({ used: 4, left: 0 }));
  const button = sheet.getByRole("button", { name: "Jatah habis" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(sheet.getByText("Jatah bulan ini habis. Kembali Selasa, 1 Desember.")).toBeTruthy();
  expect(sheet.queryByText(/Dikirim ke pengelola/)).toBeNull();
  fireEvent.click(button);
  expect(submit).not.toHaveBeenCalled();
});
