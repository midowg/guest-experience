import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { praWamPath } from "@/lib/routes";
import { AboutCard, AboutText, ManageCard } from "./BerandaCards";

afterEach(cleanup);

describe("Kelola acara on Beranda", () => {
  it("is one link to the panitia's app, with the requests waiting and no shortcuts", () => {
    render(<ManageCard manages openRequests={3} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe(praWamPath.dashboard);
    expect(links[0].textContent).toContain("Ruang kerja panitia");
    expect(screen.getByText("3 menunggu")).toBeTruthy();
  });

  it("shows no badge when nothing waits", () => {
    render(<ManageCard manages openRequests={0} />);
    expect(screen.queryByText(/menunggu/)).toBeNull();
  });

  it("tells a reader it is the BOD summary, without a request count", () => {
    render(<ManageCard manages={false} openRequests={2} />);
    expect(screen.getByRole("link").textContent).toContain("Ringkasan BOD");
    expect(screen.queryByText(/menunggu/)).toBeNull();
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
