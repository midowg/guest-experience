import { describe, expect, it } from "vitest";
import { mainWamPath } from "@/lib/routes";
import { sampleAwards, sampleSession, sampleSilentQuestion, sampleSessions } from "../sample";
import type { MwAwardApproval, MwAwardCategory, MwSession } from "../types";
import {
  absenCard, acceptedScanTime, addToQueue, checkInBodySchema, outcomeText, presentLabel, readQueue, tokenFromScan, windowOutcome,
} from "./absen";
import { adminRange, adminWhen, silentQuestionSchema } from "./admin";
import {
  approvalCard, approvalRefusal, closedCounts, closedTally, isAnnounced, nextAnnouncement, rankTally, shownCategories, topTied, totalVotes, voteCard, voteRefusal, votableNominees, waitingCount,
} from "./awards";
import {
  controlRefusal, openBanner, openerMessage, openPill, pickSilent, readDraft, silentControlSchema, silentFeedbackSchema, silentOpenSchema,
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
    expect(acceptedScanTime("2027-01-05T07:52:00+07:00", now, pemaparan).toISOString()).toBe(at("2027-01-05", "07:52").toISOString());
    expect(acceptedScanTime("2027-01-05T08:01:00+07:00", now, pemaparan).toISOString()).toBe(now.toISOString());
    expect(acceptedScanTime("2027-01-05T08:10:00+07:00", now, pemaparan)).toBe(now);
    expect(acceptedScanTime("2027-01-05T01:00:00+07:00", now, pemaparan)).toBe(now);
    expect(acceptedScanTime(undefined, now, pemaparan)).toBe(now);
    expect(acceptedScanTime("bukan", now, pemaparan)).toBe(now);
    expect(checkInBodySchema.safeParse({ scannedAt: "2027-01-05T07:52:00+07:00" }).success).toBe(true);
    expect(checkInBodySchema.safeParse({ scannedAt: "kemarin" }).success).toBe(false);
    expect(checkInBodySchema.safeParse({ employeeId: "x" }).success).toBe(false);
  });

  it("keeps a queued scan's time only inside the window and at most 30 minutes old (audit M5)", () => {
    // Pemaparan 08.00–12.00: absen 07.30–12.30.
    const window = (scanned: string, sent: string) => {
      const now = at("2027-01-05", sent);
      const accepted = acceptedScanTime(`2027-01-05T${scanned}:00+07:00`, now, pemaparan);
      return { accepted: accepted.toISOString() === at("2027-01-05", scanned).toISOString(), outcome: windowOutcome(pemaparan, accepted)?.kind ?? "tercatat" };
    };
    // Exactly 30 minutes old: kept. 30 minutes and a second: the server's time instead.
    expect(window("12:20", "12:50")).toEqual({ accepted: true, outcome: "tercatat" });
    expect(acceptedScanTime("2027-01-05T12:19:59+07:00", at("2027-01-05", "12:50"), pemaparan)).toEqual(at("2027-01-05", "12:50"));
    expect(window("12:19", "12:50")).toEqual({ accepted: false, outcome: "tutup" });
    // The audit's case: hours after the window closed, a time in the middle of the session.
    expect(window("10:00", "17:30")).toEqual({ accepted: false, outcome: "tutup" });
    // Inside 30 minutes but outside the window (before it opened): the server's time counts.
    expect(window("07:29", "07:40")).toEqual({ accepted: false, outcome: "tercatat" });
    expect(window("07:30", "07:40")).toEqual({ accepted: true, outcome: "tercatat" });
    // The window's last minute (12.30) is inside; one minute after it is not.
    expect(window("12:30", "12:45")).toEqual({ accepted: true, outcome: "tercatat" });
    expect(window("12:31", "12:45")).toEqual({ accepted: false, outcome: "tutup" });
    // Too old while the window is still open: recorded at the server's time, not the claimed one.
    expect(acceptedScanTime("2027-01-05T08:00:00+07:00", at("2027-01-05", "09:00"), pemaparan)).toEqual(at("2027-01-05", "09:00"));
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

  it("opens and closes with its session; panitia opens it early or closes it early, and closed is final", () => {
    expect(pickSilent([question], sampleSessions, at("2027-01-05", "12:59"))?.state).toBe("belum");
    expect(pickSilent([question], sampleSessions, at("2027-01-05", "13:45"))?.state).toBe("buka");
    expect(pickSilent([question], sampleSessions, at("2027-01-05", "14:30"))?.state).toBe("tutup");
    expect(pickSilent([{ ...question, openedAt: "2027-01-05T05:00:00Z" }], sampleSessions, at("2027-01-05", "12:00"))?.state).toBe("buka");
    expect(pickSilent([{ ...question, closedAt: "2027-01-05T06:40:00Z" }], sampleSessions, at("2027-01-05", "13:45"))?.state).toBe("tutup");
    // Opened early still closes at its end.
    expect(pickSilent([{ ...question, openedAt: "2027-01-05T05:00:00Z" }], sampleSessions, at("2027-01-05", "18:00"))?.state).toBe("tutup");
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

  it("tells when it closes, also when panitia opened it early (R1)", () => {
    const view = pickSilent([question], sampleSessions, at("2027-01-05", "13:45"))!;
    expect(openBanner(view)).toBe("Dibuka · sampai 14.30");
    expect(openPill(view)).toBe("Tanpa nama · sampai 14.30");
    expect(openBanner(pickSilent([{ ...question, openedAt: "2027-01-05T05:00:00Z" }], sampleSessions, at("2027-01-05", "12:00"))!)).toBe("Dibuka · sampai 14.30");
    expect(openBanner({ closesAt: null })).toBe("Dibuka");
  });

  it("lets panitia open it only before it opens and close it only while open: a closed one never opens again (audit H2)", () => {
    expect(controlRefusal("belum", "buka")).toBeNull();
    expect(controlRefusal("buka", "tutup")).toBeNull();
    expect(controlRefusal("tutup", "buka")).toEqual({ status: 409, message: "Silent Meeting yang sudah ditutup tidak bisa dibuka lagi." });
    expect(controlRefusal("buka", "buka")?.status).toBe(409);
    expect(controlRefusal("tutup", "tutup")?.status).toBe(409);
    expect(controlRefusal("belum", "tutup")?.status).toBe(409);
  });

  it("validates a feedback and a control", () => {
    expect(silentFeedbackSchema.safeParse({ questionId: question.id, topic: "Cara kerja", body: "  Rapat terlalu panjang.  " })).toMatchObject({ success: true, data: { body: "Rapat terlalu panjang." } });
    expect(silentFeedbackSchema.safeParse({ questionId: question.id, body: "   " }).success).toBe(false);
    expect(silentFeedbackSchema.safeParse({ questionId: question.id, body: "x".repeat(1001) }).success).toBe(false);
    expect(silentFeedbackSchema.safeParse({ questionId: question.id, body: "Halo", employeeId: "aku" }).success).toBe(false);
    expect(silentControlSchema.safeParse({ action: "buka" }).success).toBe(true);
    expect(silentControlSchema.safeParse({ action: "tutup" }).success).toBe(true);
    // "otomatis" (back to the hours after a close) is gone: it could open a closed one again.
    expect(silentControlSchema.safeParse({ action: "otomatis" }).success).toBe(false);
    expect(silentControlSchema.safeParse({ action: "hapus" }).success).toBe(false);
    expect(silentOpenSchema.safeParse({ questionId: question.id }).success).toBe(true);
    expect(silentOpenSchema.safeParse({ questionId: question.id, body: "x" }).success).toBe(false);
    expect(openerMessage("q", "e")).toBe("mw-silent-open\0q\0e");
  });

  it("keeps a local draft and ignores a broken one", () => {
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

  it("shows the count per nominee, to the BOD and Admin WAM, only once voting closed (audit M1)", () => {
    const counts = new Map([[sari.id, 31]]);
    expect(closedTally(suportif, counts, at("2027-01-06", "10:00"))).toBeNull();
    expect(closedTally(suportif, counts, at("2027-01-06", "07:00"))).toBeNull();
    expect(closedTally(juri, counts, at("2027-01-06", "16:00"))).toBeNull();
    expect(closedTally(suportif, counts, at("2027-01-06", "15:00"))).toMatchObject({ total: 31, rows: [{ nomineeId: sari.id, votes: 31, rank: 1 }, expect.anything(), expect.anything(), expect.anything(), expect.anything()] });
    const all = new Map([[suportif.id, counts], [foto.id, new Map([[foto.nominees[0].id, 4]])]]);
    expect(closedCounts(sampleAwards, all, at("2027-01-06", "10:00"))).toEqual({});
    expect(Object.keys(closedCounts(sampleAwards, all, at("2027-01-06", "16:00")))).toEqual([suportif.id, foto.id]);
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

describe("Admin WAM modul", () => {
  it("writes times as people read them (T-A03)", () => {
    expect(adminWhen("2027-01-06T01:00:00Z")).toBe("Rab, 6 Jan · 08.00");
    expect(adminRange("2027-01-06T01:00:00Z", "2027-01-06T08:00:00Z")).toBe("Rab, 6 Jan · 08.00–15.00");
    expect(adminRange("2027-01-06T01:00:00Z", "2027-01-07T08:00:00Z")).toBe("Rab, 6 Jan · 08.00 – Kam, 7 Jan · 15.00");
    expect(adminWhen(null)).toBe("–");
  });

  it("no longer takes Tutup otomatis: every Silent Meeting closes at its session's end", () => {
    expect(silentQuestionSchema.safeParse({ sessionId: "00000000-0000-4000-8000-000000000001", question: "Apa yang perlu diubah?" }).success).toBe(true);
    expect(silentQuestionSchema.safeParse({ sessionId: "00000000-0000-4000-8000-000000000001", question: "Apa yang perlu diubah?", autoClose: false }).success).toBe(false);
  });
});
