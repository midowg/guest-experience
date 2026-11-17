import { describe, expect, it } from "vitest";
import { mainWamPath } from "@/lib/routes";
import { sampleAwards, sampleSession, sampleSilentQuestion, sampleSessions } from "../sample";
import type { MwAwardApproval, MwAwardCategory, MwSession } from "../types";
import {
  absenCard, acceptedScanTime, addToQueue, checkInBodySchema, outcomeText, presentLabel, readQueue, tokenFromScan, windowOutcome,
} from "./absen";
import {
  approvalCard, approvalRefusal, isAnnounced, nextAnnouncement, rankTally, shownCategories, topTied, totalVotes, voteCard, voteRefusal, votableNominees, waitingCount,
} from "./awards";
import {
  controlPatch, NO_TOPIC, openBanner, openPill, participantMessage, pickSilent, readDraft, recapReady, shuffle, silentControlSchema, silentFeedbackSchema, topicCounts,
} from "./silent";

/* Status jendela waktu (absen, Silent Meeting, voting) and the rules the screens and APIs share. */

const at = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);
const origin = "https://wam.example";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWx";

describe("Absen QR", () => {
  const pemaparan = sampleSession("pemaparan"); // Sel, 5 Jan 08.00–12.00, pakai absen

  it("reads only a Main WAM check-in address of this site from a QR", () => {
    expect(tokenFromScan(`${origin}${mainWamPath.checkIn(TOKEN)}`, origin)).toBe(TOKEN);
    expect(tokenFromScan(mainWamPath.checkIn(TOKEN), origin)).toBe(TOKEN);
    expect(tokenFromScan(`https://lain.example${mainWamPath.checkIn(TOKEN)}`, origin)).toBeNull();
    expect(tokenFromScan(`${origin}/wam/check-in/${TOKEN}`, origin)).toBeNull();
    expect(tokenFromScan(`${origin}${mainWamPath.checkIn("pendek")}`, origin)).toBeNull();
    expect(tokenFromScan("halo", origin)).toBeNull();
  });

  it("opens 30 minutes before the start and closes 30 minutes after the end", () => {
    expect(windowOutcome(pemaparan, at("2027-01-05", "07:29"))).toMatchObject({ kind: "belum", opens: at("2027-01-05", "07:30").toISOString() });
    expect(windowOutcome(pemaparan, at("2027-01-05", "07:30"))).toBeNull();
    expect(windowOutcome(pemaparan, at("2027-01-05", "12:30"))).toBeNull();
    expect(windowOutcome(pemaparan, at("2027-01-05", "12:31"))).toMatchObject({ kind: "tutup", closes: at("2027-01-05", "12:30").toISOString() });
    // A moment without an end counts 30 minutes (shuttle 14.30 → closes 15.30).
    expect(windowOutcome(sampleSession("shuttle"), at("2027-01-04", "15:31"))?.kind).toBe("tutup");
  });

  it("keeps a queued scan's own time within limits, never the phone's future", () => {
    const now = at("2027-01-05", "08:00");
    expect(acceptedScanTime("2027-01-05T07:52:00+07:00", now).toISOString()).toBe(at("2027-01-05", "07:52").toISOString());
    expect(acceptedScanTime("2027-01-05T08:01:00+07:00", now).toISOString()).toBe(now.toISOString());
    expect(acceptedScanTime("2027-01-05T08:10:00+07:00", now)).toBe(now);
    expect(acceptedScanTime("2027-01-05T01:00:00+07:00", now)).toBe(now);
    expect(acceptedScanTime(undefined, now)).toBe(now);
    expect(acceptedScanTime("bukan", now)).toBe(now);
    expect(checkInBodySchema.safeParse({ scannedAt: "2027-01-05T07:52:00+07:00" }).success).toBe(true);
    expect(checkInBodySchema.safeParse({ scannedAt: "kemarin" }).success).toBe(false);
    expect(checkInBodySchema.safeParse({ employeeId: "x" }).success).toBe(false);
  });

  it("says what happened in one sentence (A02–A04)", () => {
    const now = at("2027-01-05", "08:05");
    const named = { id: pemaparan.id, title: "Pemaparan departemen", place: "Aula Utama" };
    expect(outcomeText({ kind: "tercatat", session: named, checkedInAt: at("2027-01-05", "07:52").toISOString() }, now)).toMatchObject({ title: "Absen tercatat", sub: "Pemaparan departemen · 07.52" });
    expect(outcomeText({ kind: "belum", session: { ...named, title: "Silent Meeting" }, opens: at("2027-01-05", "12:30").toISOString(), closes: "" }, now)).toMatchObject({ title: "Absen belum dibuka", body: "Dibuka 12.30. Scan lagi nanti." });
    expect(outcomeText({ kind: "tutup", session: named, closes: at("2027-01-04", "18:30").toISOString() }, now).body).toBe("Ditutup Kemarin · 18.30. Kalau kamu hadir, minta panitia mencatat.");
    expect(outcomeText({ kind: "bod" }, now).title).toBe("Tidak perlu absen");
  });

  it("draws the Absen card of Detail sesi by the window and the person's check-in", () => {
    expect(absenCard(pemaparan, null, at("2027-01-05", "07:00")).kind).toBe("none");
    expect(absenCard(pemaparan, null, at("2027-01-05", "10:05"))).toEqual({ kind: "buka", closes: at("2027-01-05", "12:30").toISOString() });
    expect(absenCard(pemaparan, at("2027-01-05", "07:52").toISOString(), at("2027-01-05", "10:05")).kind).toBe("hadir");
    expect(absenCard(pemaparan, null, at("2027-01-05", "12:40")).kind).toBe("terlewat");
    expect(absenCard(sampleSession("team-building"), null, at("2027-01-05", "16:10")).kind).toBe("none");
    expect(absenCard({ ...pemaparan, status: "batal" }, null, at("2027-01-05", "10:05")).kind).toBe("none");
    expect(presentLabel(at("2027-01-05", "07:52").toISOString())).toBe("Hadir 07.52");
  });

  it("keeps one queued scan per QR and drops broken entries", () => {
    const scan = { token: TOKEN, scannedAt: "2027-01-05T07:52:00+07:00", title: "Pemaparan departemen" };
    expect(addToQueue(addToQueue([], scan), { ...scan, scannedAt: "2027-01-05T07:55:00+07:00" })).toEqual([scan]);
    expect(readQueue(JSON.stringify([scan, { token: "x" }, scan, "aneh"]))).toEqual([scan]);
    expect(readQueue("{rusak")).toEqual([]);
    expect(readQueue(null)).toEqual([]);
  });
});

describe("Silent Meeting", () => {
  const session = sampleSession("silent"); // Sel, 5 Jan 13.00–14.30
  const question = sampleSilentQuestion;

  it("opens and closes with its session, and panitia's override wins", () => {
    expect(pickSilent([question], sampleSessions, at("2027-01-05", "12:59"))?.state).toBe("belum");
    expect(pickSilent([question], sampleSessions, at("2027-01-05", "13:45"))?.state).toBe("buka");
    expect(pickSilent([question], sampleSessions, at("2027-01-05", "14:30"))?.state).toBe("tutup");
    expect(pickSilent([{ ...question, override: "buka", overrideAt: "x" }], sampleSessions, at("2027-01-05", "12:00"))?.state).toBe("buka");
    expect(pickSilent([{ ...question, override: "tutup", overrideAt: "x" }], sampleSessions, at("2027-01-05", "13:45"))?.state).toBe("tutup");
    expect(pickSilent([{ ...question, override: "buka", overrideAt: "x", autoClose: false }], sampleSessions, at("2027-01-05", "18:00"))?.state).toBe("buka");
    // A draft session's question does not exist for the app.
    const drafts: MwSession[] = sampleSessions.map(item => (item.id === session.id ? { ...item, status: "draf" } : item));
    expect(pickSilent([question], drafts, at("2027-01-05", "13:45"))).toBeNull();
  });

  it("picks the open one, else the next, else the last closed; or the one of a session", () => {
    const other = { ...question, id: "00000000-0000-4000-8013-000000000002", sessionId: sampleSession("refleksi").id };
    expect(pickSilent([other, question], sampleSessions, at("2027-01-05", "13:45"))?.question.id).toBe(question.id);
    expect(pickSilent([other, question], sampleSessions, at("2027-01-05", "18:00"))?.question.id).toBe(other.id);
    expect(pickSilent([other, question], sampleSessions, at("2027-01-07", "18:00"))?.question.id).toBe(other.id);
    expect(pickSilent([other, question], sampleSessions, at("2027-01-07", "18:00"), session.id)?.question.id).toBe(question.id);
    expect(pickSilent([other, question], sampleSessions, at("2027-01-07", "18:00"), "lain")).toBeNull();
  });

  it("tells when it closes", () => {
    const view = pickSilent([question], sampleSessions, at("2027-01-05", "13:45"))!;
    expect(openBanner(view)).toBe("Dibuka · sampai 14.30");
    expect(openPill(view)).toBe("Tanpa nama · sampai 14.30");
    expect(openBanner({ closesAt: null })).toBe("Dibuka");
  });

  it("shows the recap only once closed, from 5 feedbacks and 5 people", () => {
    expect(recapReady({ state: "tutup" }, 5, 5)).toBe(true);
    expect(recapReady({ state: "tutup" }, 12, 4)).toBe(false);
    expect(recapReady({ state: "tutup" }, 4, 4)).toBe(false);
    expect(recapReady({ state: "buka" }, 47, 40)).toBe(false);
  });

  it("validates a feedback and a control", () => {
    expect(silentFeedbackSchema.safeParse({ questionId: question.id, topic: "Cara kerja", body: "  Rapat terlalu panjang.  " })).toMatchObject({ success: true, data: { body: "Rapat terlalu panjang." } });
    expect(silentFeedbackSchema.safeParse({ questionId: question.id, body: "   " }).success).toBe(false);
    expect(silentFeedbackSchema.safeParse({ questionId: question.id, body: "x".repeat(1001) }).success).toBe(false);
    expect(silentFeedbackSchema.safeParse({ questionId: question.id, body: "Halo", employeeId: "aku" }).success).toBe(false);
    expect(silentControlSchema.safeParse({ action: "buka" }).success).toBe(true);
    expect(silentControlSchema.safeParse({ action: "hapus" }).success).toBe(false);
    const now = new Date("2027-01-05T06:00:00Z");
    expect(controlPatch("buka", "dimas", now)).toEqual({ override: "buka", override_at: now.toISOString(), override_by: "dimas" });
    expect(controlPatch("otomatis", "dimas", now)).toEqual({ override: null, override_at: null, override_by: null });
    expect(participantMessage("q", "e")).toBe("mw-silent\0q\0e");
  });

  it("shuffles without losing anything and counts per topic", () => {
    const items = Array.from({ length: 30 }, (_, index) => index);
    const mixed = shuffle(items, () => 0.3);
    expect([...mixed].sort((a, b) => a - b)).toEqual(items);
    expect(mixed).not.toEqual(items);
    expect(topicCounts([{ topic: "Komunikasi" }, { topic: "Cara kerja" }, { topic: "" }, { topic: "Cara kerja" }], ["Cara kerja", "Komunikasi", "Lainnya"]))
      .toEqual([{ topic: "Cara kerja", count: 2 }, { topic: "Komunikasi", count: 1 }, { topic: "Lainnya", count: 0 }, { topic: NO_TOPIC, count: 1 }]);
    expect(readDraft(JSON.stringify({ topic: "Cara kerja", body: "Draf" }))).toEqual({ topic: "Cara kerja", body: "Draf" });
    expect(readDraft("rusak")).toEqual({ topic: "", body: "" });
  });
});

describe("Voting Awarding", () => {
  const [suportif, foto, juri] = sampleAwards; // voting Rab 6 Jan 08.00–15.00, announced 19.00
  const rani = "00000000-0000-4000-8001-000000000001";
  const sari = suportif.nominees[0];
  const owners = new Map(foto.nominees.map(nominee => [nominee.photoId!, rani]));
  const approval = (category: MwAwardCategory, nomineeId: string): MwAwardApproval => ({ categoryId: category.id, nomineeId, approvedBy: "arman", approvedAt: at("2027-01-06", "16:02").toISOString() });

  it("never shows a computed category", () => {
    const auto: MwAwardCategory = { ...juri, id: "auto", title: "Tim paling kompak", method: "otomatis" };
    expect(shownCategories([auto, ...sampleAwards]).map(category => category.title)).toEqual(["Rekan paling suportif", "Foto Momen terbaik", "Departemen paling berdampak"]);
    expect(shownCategories([{ ...suportif, published: false }])).toEqual([]);
  });

  it("draws each card by the window, the person's vote and the announcement", () => {
    expect(voteCard(suportif, false, null, at("2027-01-06", "07:59"))).toMatchObject({ kind: "belum" });
    expect(voteCard(suportif, false, null, at("2027-01-06", "10:00"))).toMatchObject({ kind: "pilih", closesAt: suportif.closesAt });
    expect(voteCard(suportif, true, null, at("2027-01-06", "10:00")).kind).toBe("terkirim");
    expect(voteCard(suportif, true, null, at("2027-01-06", "15:00"))).toEqual({ kind: "ditutup", announceAt: suportif.announceAt });
    expect(voteCard(juri, false, null, at("2027-01-06", "10:00")).kind).toBe("juri");
    // Approved is not announced before its time.
    expect(voteCard(suportif, true, approval(suportif, sari.id), at("2027-01-06", "16:10")).kind).toBe("ditutup");
    expect(voteCard(suportif, true, approval(suportif, sari.id), at("2027-01-06", "19:40"))).toEqual({ kind: "diumumkan", nomineeId: sari.id });
    expect(isAnnounced({ announceAt: null }, approval(suportif, sari.id), at("2027-01-06", "16:10"))).toBe(true);
    expect(nextAnnouncement(sampleAwards, at("2027-01-06", "10:00"))?.at).toBe(suportif.announceAt);
    expect(nextAnnouncement(sampleAwards, at("2027-01-06", "20:00"))).toBeNull();
  });

  it("refuses a vote for oneself, outside the window, or for another category's nominee", () => {
    const open = at("2027-01-06", "10:00");
    expect(voteRefusal(suportif, sari.id, rani, owners, open)).toBeNull();
    expect(voteRefusal(suportif, sari.id, sari.employeeId!, owners, open)?.message).toBe("Kamu tidak bisa memilih dirimu sendiri.");
    expect(voteRefusal(foto, foto.nominees[0].id, rani, owners, open)?.status).toBe(422);
    expect(voteRefusal(suportif, sari.id, rani, owners, at("2027-01-06", "07:00"))?.message).toBe("Voting belum dibuka.");
    expect(voteRefusal(suportif, sari.id, rani, owners, at("2027-01-06", "15:00"))?.message).toBe("Voting sudah ditutup.");
    expect(voteRefusal(suportif, foto.nominees[0].id, rani, owners, open)?.status).toBe(422);
    expect(voteRefusal(juri, juri.nominees[0].id, rani, owners, open)?.status).toBe(409);
    expect(voteRefusal(undefined, sari.id, rani, owners, open)?.status).toBe(404);
    expect(votableNominees(suportif.nominees, sari.employeeId!, owners).map(item => item.id)).not.toContain(sari.id);
    expect(votableNominees(foto.nominees, rani, owners)).toEqual([]);
  });

  it("ranks the count with ties sharing a rank", () => {
    const [a, b, c] = suportif.nominees;
    const rows = rankTally(suportif.nominees, new Map([[a.id, 31], [b.id, 24], [c.id, 31]]));
    expect(rows.slice(0, 3).map(row => [row.nominee.id, row.votes, row.rank])).toEqual([[a.id, 31, 1], [c.id, 31, 1], [b.id, 24, 3]]);
    expect(totalVotes(rows)).toBe(86);
    expect(topTied(rows)).toBe(true);
    expect(topTied(rankTally(suportif.nominees, new Map([[a.id, 2]])))).toBe(false);
    expect(topTied(rankTally(suportif.nominees, new Map()))).toBe(false);
  });

  it("lets the BOD approve only once voting has closed", () => {
    expect(approvalCard(suportif, null, at("2027-01-06", "10:00"))).toMatchObject({ kind: "voting-buka" });
    expect(approvalCard(suportif, null, at("2027-01-06", "16:00")).kind).toBe("perlu");
    expect(approvalCard(juri, null, at("2027-01-06", "10:00")).kind).toBe("perlu");
    expect(approvalCard(suportif, approval(suportif, sari.id), at("2027-01-06", "16:00")).kind).toBe("disetujui");
    expect(waitingCount(sampleAwards, new Map(), at("2027-01-06", "16:00"))).toBe(3);
    expect(waitingCount(sampleAwards, new Map([[juri.id, approval(juri, juri.nominees[0].id)]]), at("2027-01-06", "16:00"))).toBe(2);
    expect(approvalRefusal(suportif, sari.id, at("2027-01-06", "14:59"))?.status).toBe(409);
    expect(approvalRefusal(suportif, sari.id, at("2027-01-06", "15:00"))).toBeNull();
    expect(approvalRefusal(suportif, juri.nominees[0].id, at("2027-01-06", "16:00"))?.status).toBe(422);
    expect(approvalRefusal({ ...juri, method: "otomatis" }, juri.nominees[0].id, at("2027-01-06", "16:00"))?.status).toBe(404);
  });
});
