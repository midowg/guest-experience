import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { praWamPath } from "@/lib/routes";
import { AboutCard, AboutText, ManageCard, QuestionnaireCard } from "./BerandaCards";

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
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("offers the full guide for download when one is uploaded, through the members-only document link", () => {
    render(<AboutText about={{ ...about, guide: { id: "11111111-1111-4111-8111-111111111111", filename: "panduan.pdf", size: 97_400 } }} />);
    const link = screen.getByRole("link", { name: /Unduh panduan lengkap/ });
    expect(link.getAttribute("href")).toBe("/api/wam/documents/11111111-1111-4111-8111-111111111111");
    expect(link.textContent).toContain("PDF · 95 KB");
  });
});

describe("the questionnaire on Beranda", () => {
  const card = { name: "Kuesioner", cardText: "Ceritakan dirimu.", minutes: 15, sectionsDone: 2, sectionsTotal: 6, done: false, closed: false, href: praWamPath.questionnaire("kuesioner") };

  it("opens the questionnaire with its time and progress, and has nothing to dismiss it", () => {
    render(<QuestionnaireCard {...card} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/wam/kuesioner");
    expect(links[0].textContent).toContain("Sekitar 15 menit · 2 dari 6 bagian");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("thanks the person once done, and still opens the page", () => {
    render(<QuestionnaireCard {...card} sectionsDone={6} done />);
    expect(screen.getByRole("link").textContent).toContain("Selesai · terima kasih");
    expect(screen.getByRole("link").getAttribute("href")).toBe("/wam/kuesioner");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("once done, shows the tokoh card's figure and name, never the old character", () => {
    const { container } = render(<QuestionnaireCard {...card} sectionsDone={6} done character={{ name: "Edmund Hillary", tier: "Rare", color: "#449DFF", image: "/figur/edmund-hillary.webp", tokoh: true }} />);
    expect(screen.getByRole("link").textContent).toContain("Kamu dapat Edmund Hillary");
    expect(screen.getByRole("link").textContent).toContain("Rare · lihat kartu tokohmu");
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/figur/edmund-hillary.webp");
  });
});
