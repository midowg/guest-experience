import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { sampleGalleryMine, sampleTagged } from "@/lib/main-wam/momen/sample";
import type { TaggedAnswer } from "@/lib/main-wam/momen/tagged";
import { mainWamApi } from "@/lib/routes";
import { ToastProvider } from "@/components/main-wam/ui";

/*
 * M05 Galeri (the icon in Momen's bar): two tabs. Fotoku (my photos with their status; a tap opens "Fotomu" with Simpan foto and
 * Hapus foto) and Ditandai (photos of others that tag me; a tap opens the viewer with who took it, "Bersama …", Simpan foto and
 * Lepas tag). Friendly empty states, "Muat lagi" past 30, nothing breaks before the migration of the tags.
 */

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), refresh: vi.fn() }), usePathname: () => "/wam2026/momen/galeri" }));
vi.mock("./upload/QueueRunner", () => ({ MomenQueueRunner: () => null, useMomenQueue: () => ({ items: [] }) }));
let answer: unknown = { items: [], next: null, total: null, migrated: true };
let failure: Error | null = null;
const request = vi.fn(async (...args: unknown[]) => { void args; if (failure) throw failure; return { data: answer, message: "" }; });
vi.mock("@/components/pra-wam/api", () => ({ praWamRequest: (...args: unknown[]) => request(...args), errorText: (error: Error) => error.message || "Gagal." }));

const { Gallery } = await import("./Gallery");

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  window.matchMedia = window.matchMedia ?? ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as never;
});
beforeEach(() => { request.mockClear(); answer = { items: [], next: null, total: null, migrated: true }; failure = null; window.history.replaceState(null, "", "/wam2026/momen/galeri"); });
afterEach(() => cleanup());

const own = { items: sampleGalleryMine, next: null, total: sampleGalleryMine.length, migrated: true };
const tagged: TaggedAnswer = { items: sampleTagged, next: null, total: sampleTagged.length, migrated: true };
const none = { items: [], next: null, total: 0, migrated: true };
const sessions = [{ id: sampleGalleryMine[0].sessionId!, title: "Pemaparan departemen" }];
const props = { tab: "fotoku" as const, own, tagged, sessions, mozaik: true, migrated: true, nowIso: "2027-01-05T03:00:00Z" };
const ui = (over: Partial<Parameters<typeof Gallery>[0]> = {}) => render(<ToastProvider><Gallery {...props} {...over} /></ToastProvider>);
const grid = (name: string) => within(screen.getByRole("list", { name }));

describe("the two tabs", () => {
  it("are Fotoku and Ditandai in one radio group, Fotoku first, and switching shows the other list (and keeps it in the address)", () => {
    ui();
    const tabs = screen.getByRole("radiogroup", { name: "Isi Galeri" });
    expect(within(tabs).getAllByRole("radio").map(radio => radio.textContent)).toEqual(["Fotoku", "Ditandai"]);
    expect((within(tabs).getByRole("radio", { name: "Fotoku" }) as HTMLInputElement).getAttribute("aria-checked")).toBe("true");
    expect(grid("Fotomu").getAllByRole("button")).toHaveLength(sampleGalleryMine.length);
    expect(screen.queryByRole("list", { name: "Foto yang menandaimu" })).toBeNull();
    fireEvent.click(within(tabs).getByRole("radio", { name: "Ditandai" }));
    expect(grid("Foto yang menandaimu").getAllByRole("button")).toHaveLength(sampleTagged.length);
    expect(screen.queryByRole("list", { name: "Fotomu" })).toBeNull();
    expect(window.location.pathname + window.location.search).toBe("/wam2026/momen/galeri?tab=ditandai");
    fireEvent.click(within(tabs).getByRole("radio", { name: "Fotoku" }));
    expect(window.location.search).toBe("");
  });

  it("opens on Ditandai from ?tab=ditandai", () => {
    ui({ tab: "ditandai" });
    expect(grid("Foto yang menandaimu").getAllByRole("button")).toHaveLength(sampleTagged.length);
  });
});

describe("Fotoku", () => {
  it("marks a photo in review or hidden, and counts the photos", () => {
    ui({ own: { ...own, items: own.items.map((photo, index) => (index === 0 ? { ...photo, status: "ditinjau" as const } : index === 1 ? { ...photo, status: "disembunyikan" as const } : photo)) } });
    const buttons = grid("Fotomu").getAllByRole("button");
    expect(buttons[0].textContent).toBe("Ditinjau");
    expect(buttons[1].textContent).toBe("Disembunyikan");
    expect(buttons[1].getAttribute("aria-label")).toBe("Fotomu, sedang disembunyikan");
    expect(buttons[2].textContent).toBe("");
    expect(screen.getByText("6 foto")).toBeTruthy();
  });

  it("a tap opens Fotomu with Simpan foto and Hapus foto; deleting asks first, then the photo leaves the grid", async () => {
    ui();
    fireEvent.click(grid("Fotomu").getAllByRole("button")[0]);
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("Fotomu")).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Simpan foto" })).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Hapus foto" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Hapus foto" }));
    await waitFor(() => expect(grid("Fotomu").getAllByRole("button")).toHaveLength(sampleGalleryMine.length - 1));
    expect(request).toHaveBeenCalledWith(mainWamApi.photo(sampleGalleryMine[0].id), { method: "DELETE" });
  });

  it("is a friendly empty state with Ambil foto, in the grid's place", () => {
    ui({ own: none });
    expect(screen.getByRole("heading", { name: "Kamu belum punya foto" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ambil foto" }).getAttribute("href")).toBe("/wam2026/momen/kamera");
    expect(screen.queryByRole("list", { name: "Fotomu" })).toBeNull();
  });

  it("asks for more with the cursor and adds them under the first page ('Muat lagi' only when there is more)", async () => {
    answer = { items: [{ ...sampleGalleryMine[0], id: "00000000-0000-4000-8b00-000000000999" }], next: null, total: null, migrated: true };
    ui({ own: { ...own, next: "s~2027-01-05T09:00:00+07:00~00000000-0000-4000-8b00-000000000300" } });
    fireEvent.click(screen.getByRole("button", { name: "Muat lagi" }));
    await waitFor(() => expect(grid("Fotomu").getAllByRole("button")).toHaveLength(sampleGalleryMine.length + 1));
    expect(request).toHaveBeenCalledWith(mainWamApi.photos({ lihat: "saya", sebelum: "s~2027-01-05T09:00:00+07:00~00000000-0000-4000-8b00-000000000300" }));
    expect(screen.queryByRole("button", { name: "Muat lagi" })).toBeNull();
  });

  it("says so when more could not be loaded and lets you try again", async () => {
    failure = new Error("offline");
    ui({ own: { ...own, next: "s~2027-01-05T09:00:00+07:00~00000000-0000-4000-8b00-000000000300" } });
    fireEvent.click(screen.getByRole("button", { name: "Muat lagi" }));
    expect((await screen.findByText("Foto belum termuat.")).getAttribute("role")).toBe("alert");
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeTruthy();
  });
});

describe("Ditandai", () => {
  it("a tap opens the viewer with who took it, Bersama (you and the others on it), Simpan foto and Lepas tag", () => {
    ui({ tab: "ditandai" });
    fireEvent.click(grid("Foto yang menandaimu").getAllByRole("button")[0]);
    const sheet = screen.getByRole("dialog");
    const first = sampleTagged[0];
    expect(within(sheet).getByText(first.owner.name)).toBeTruthy();
    expect(within(sheet).getByText(`Bersama kamu, ${first.withNames.join(", ")}`)).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Simpan foto" })).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Lepas tag" })).toBeTruthy();
    // It is not one's own photo: no Hapus foto here.
    expect(within(sheet).queryByRole("button", { name: "Hapus foto" })).toBeNull();
  });

  it("Lepas tag asks first, then DELETEs the mission tag route and the photo leaves the list", async () => {
    ui({ tab: "ditandai" });
    fireEvent.click(grid("Foto yang menandaimu").getAllByRole("button")[1]);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Lepas tag" }));
    const confirm = screen.getByRole("alertdialog");
    expect(within(confirm).getByText("Lepas tag dari foto ini?")).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole("button", { name: "Lepas tag" }));
    await waitFor(() => expect(grid("Foto yang menandaimu").getAllByRole("button")).toHaveLength(sampleTagged.length - 1));
    expect(request).toHaveBeenCalledWith(mainWamApi.missionUntag(sampleTagged[1].id), { method: "DELETE" });
  });

  it("keeps the photo and says why when the tag could not be lifted", async () => {
    failure = new Error("Tag tidak ditemukan.");
    ui({ tab: "ditandai" });
    fireEvent.click(grid("Foto yang menandaimu").getAllByRole("button")[0]);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Lepas tag" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Lepas tag" }));
    expect(await screen.findByText("Tag tidak ditemukan.")).toBeTruthy();
    expect(request).toHaveBeenCalledWith(mainWamApi.missionUntag(sampleTagged[0].id), { method: "DELETE" });
    expect(grid("Foto yang menandaimu").getAllByRole("button")).toHaveLength(sampleTagged.length);
  });

  it("is a friendly empty state when nobody tagged me", () => {
    ui({ tab: "ditandai", tagged: { ...none, total: 0 } });
    expect(screen.getByRole("heading", { name: "Belum ada foto yang menandaimu" })).toBeTruthy();
    expect(screen.getByText("Saat rekan menandaimu di foto misi, fotonya muncul di sini.")).toBeTruthy();
  });

  it("before the tags' migration the tab says the system is being updated; Fotoku keeps working", () => {
    ui({ tab: "ditandai", tagged: { items: [], next: null, total: 0, migrated: false } });
    expect(screen.getByText("Foto yang menandaimu bisa dilihat setelah sistem diperbarui.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Fotoku" }));
    expect(grid("Fotomu").getAllByRole("button")).toHaveLength(sampleGalleryMine.length);
  });

  it("loads the next page by the Ditandai cursor", async () => {
    answer = { items: [{ ...sampleTagged[0], id: "00000000-0000-4000-8b00-000000000998" }], next: null, total: null, migrated: true };
    ui({ tab: "ditandai", tagged: { ...tagged, next: "t~2027-01-05T09:00:00+07:00~00000000-0000-4000-8b00-000000000400", total: 31 } });
    fireEvent.click(screen.getByRole("button", { name: "Muat lagi" }));
    await waitFor(() => expect(grid("Foto yang menandaimu").getAllByRole("button")).toHaveLength(sampleTagged.length + 1));
    expect(request).toHaveBeenCalledWith(mainWamApi.taggedPhotos("t~2027-01-05T09:00:00+07:00~00000000-0000-4000-8b00-000000000400"));
  });
});

describe("the whole Galeri", () => {
  it("before the photos' migration says the Galeri opens after the update", () => {
    ui({ migrated: false });
    expect(screen.getByText("Galeri bisa dibuka setelah sistem diperbarui.")).toBeTruthy();
  });
});
