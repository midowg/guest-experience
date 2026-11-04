import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { praWamPath } from "@/lib/routes";
import { AboutCard, AboutText, ManageCard } from "./BerandaCards";

afterEach(cleanup);

describe("Kelola acara on Beranda", () => {
  it("gives managers their counts and three shortcuts", () => {
    render(<ManageCard manages openRequests={3} draftsWithoutTime={2} sessionsToday={1} />);
    expect(screen.getByRole("link", { name: /Kelola acara/ }).getAttribute("href")).toBe(praWamPath.dashboard);
    const shortcuts = screen.getByRole("navigation", { name: "Pintasan kelola acara" });
    expect([...shortcuts.querySelectorAll("a")].map(link => link.getAttribute("href"))).toEqual([praWamPath.sessions, praWamPath.requests, praWamPath.announcements]);
    expect(screen.getByRole("link", { name: "Permintaan, 3 menunggu" })).toBeTruthy();
    expect(screen.getByText("Permintaan menunggu").nextSibling?.textContent).toBe("3");
  });

  it("gives a reader only Ringkasan and no request count", () => {
    render(<ManageCard manages={false} openRequests={0} draftsWithoutTime={0} sessionsToday={2} />);
    const shortcuts = screen.getByRole("navigation", { name: "Pintasan kelola acara" });
    expect([...shortcuts.querySelectorAll("a")].map(link => link.textContent)).toEqual(["Ringkasan"]);
    expect(screen.queryByText("Permintaan menunggu")).toBeNull();
  });
});

describe("Apa itu WAM", () => {
  const about = { title: "Apa itu WAM?", summary: "Pertemuan tahunan.", body: "<b>Satu</b>\n\nDua\nbaris", points: ["Kapan: 4–7 Jan 2027", "Tanpa label"] };

  it("opens the full text from the card, and the preview is not a link", () => {
    render(<AboutCard about={about} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe(praWamPath.about);
    cleanup();
    render(<AboutCard about={about} preview />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders paragraphs and points as text, never as HTML", () => {
    const { container } = render(<AboutText about={about} />);
    expect(container.querySelector("b")).toBeNull();
    expect([...container.querySelectorAll("p")].map(p => p.textContent)).toEqual(["Pertemuan tahunan.", "<b>Satu</b>", "Dua\nbaris"]);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Apa itu WAM?");
    expect(screen.getByText("Kapan").tagName).toBe("STRONG");
    expect(screen.getByText("Tanpa label")).toBeTruthy();
  });
});
