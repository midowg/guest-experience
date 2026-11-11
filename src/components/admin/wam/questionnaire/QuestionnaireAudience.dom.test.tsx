import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { QForm } from "@/lib/pra-wam/questionnaire";
import { adminRequest } from "@/components/admin/shared/api";
import { departmentsOf, QuestionnaireAudience, toggleGroup } from "./QuestionnaireAudience";

vi.mock("@/components/admin/shared/api", async original => ({
  ...(await original<typeof import("@/components/admin/shared/api")>()),
  adminRequest: vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { audience: QForm["audience"]; audienceIds: string[] };
    return { ok: true, data: { form: { ...form, ...body } }, message: `Disimpan. Kuesioner sekarang untuk ${body.audienceIds.length} orang terpilih.` };
  }),
}));
afterEach(() => { cleanup(); vi.mocked(adminRequest).mockClear(); });

const form: QForm = { id: "f1", name: "Kuesioner", slug: "kuesioner", oldSlugs: [], status: "draf", intro: "", cardText: "", minutes: 15, editUntil: null, stayDeleteOn: null, hrAccess: [], audience: "semua", audienceIds: [] };
const people = [
  { id: "a", name: "Ayu Lestari", department: "Comms" },
  { id: "b", name: "Bima Putra", department: "Comms" },
  { id: "c", name: "Citra Dewi", department: "Finance" },
];

it("groups people by department and toggles a whole department", () => {
  expect(departmentsOf(people)).toEqual([{ name: "Comms", ids: ["a", "b"] }, { name: "Finance", ids: ["c"] }]);
  expect(toggleGroup(["c"], ["a", "b"])).toEqual(["c", "a", "b"]);
  expect(toggleGroup(["a", "b", "c"], ["a", "b"])).toEqual(["c"]);
  expect(toggleGroup(["a"], ["a", "b"])).toEqual(["a", "b"]);
});

it("chooses a department and one more person, then saves only those", async () => {
  const saved = vi.fn();
  render(<QuestionnaireAudience form={form} people={people} ready onSaved={saved} />);
  expect(screen.queryByLabelText("Daftar karyawan aktif")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Orang terpilih/ }));
  fireEvent.click(screen.getByRole("button", { name: /Comms/ }));
  expect(screen.getByText("2 dari 3 orang dipilih")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Cari nama atau departemen"), { target: { value: "citra" } });
  fireEvent.click(screen.getByLabelText(/Citra Dewi/));
  fireEvent.change(screen.getByLabelText("Cari nama atau departemen"), { target: { value: "" } });
  fireEvent.click(screen.getByLabelText(/Bima Putra/));
  expect(screen.getByText("2 dari 3 orang dipilih")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Simpan pilihan" }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  const body = JSON.parse((vi.mocked(adminRequest).mock.calls[0][1] as { body: string }).body);
  expect(body.audience).toBe("pilih");
  expect([...body.audienceIds].sort()).toEqual(["a", "c"]);
  expect(screen.getByText(/2 orang terpilih\./)).toBeTruthy();
});

it("will not save nobody while the questionnaire is open", async () => {
  render(<QuestionnaireAudience form={{ ...form, status: "buka" }} people={people} ready onSaved={() => undefined} />);
  fireEvent.click(screen.getByRole("button", { name: /Orang terpilih/ }));
  fireEvent.click(screen.getByRole("button", { name: "Simpan pilihan" }));
  expect(screen.getByRole("alert").textContent).toContain("Pilih minimal satu orang");
  expect(adminRequest).not.toHaveBeenCalled();
});

it("waits for the migration", () => {
  render(<QuestionnaireAudience form={form} people={people} ready={false} onSaved={() => undefined} />);
  expect(screen.getByText(/menunggu migrasi 202611110001/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Simpan pilihan" })).toBeNull();
});
