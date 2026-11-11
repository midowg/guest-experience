import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { wamAdminPath } from "@/lib/routes";
import { QuestionnaireTabs, questionnaireTabs } from "./QuestionnaireTabs";

// The frame's server-only imports are not needed for its subtitle.
vi.mock("@/components/admin/wam/WamAdminFrame", () => ({ WamAdminFrame: () => null }));
vi.mock("@/lib/server/pra-wam/questionnaire-admin", () => ({ adminQuestionnaire: vi.fn() }));
const { questionnaireSubtitle } = await import("./QuestionnaireFrame");

afterEach(cleanup);

it("shows the questionnaire's tabs in order, with Rekap holding everything and nothing locked", () => {
  render(<QuestionnaireTabs current="rekap" />);
  const nav = screen.getByRole("navigation", { name: "Bagian kuesioner" });
  const links = within(nav).getAllByRole("link");
  expect(links.map(link => link.textContent)).toEqual(["Isi", "Rekap", "Pengaturan", "Kartu", "Kamar"]);
  expect(links.map(link => link.getAttribute("href"))).toEqual(questionnaireTabs.map(tab => tab.href));
  expect(within(nav).getByRole("link", { name: "Rekap" }).getAttribute("aria-current")).toBe("page");
  expect(links.filter(link => link.getAttribute("aria-current"))).toHaveLength(1);
  expect(questionnaireTabs[0].href).toBe(wamAdminPath.questionnaire.content);
});

it("says the status, the deadline and the question count under the title", () => {
  expect(questionnaireSubtitle({ status: "buka", editUntil: "2026-11-20T10:00:00Z" }, 42)).toMatch(/^Dibuka · bisa diubah sampai 20 Nov 2026,? 17\.00 WIB · 42 pertanyaan$/);
  expect(questionnaireSubtitle({ status: "draf", editUntil: null }, 0)).toBe("Draf · tanpa tenggat · 0 pertanyaan");
});
