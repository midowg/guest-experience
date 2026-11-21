import { mainWamCan } from "@/lib/main-wam/access";
import { DEMO_QUIZ_ID } from "@/lib/main-wam/kuis/demo";
import { absenCard } from "@/lib/main-wam/modul/absen";
import { approvalCard, isAnnounced, shownCategories } from "@/lib/main-wam/modul/awards";
import { votingState } from "@/lib/main-wam/module-state";
import { checkInState } from "@/lib/main-wam/rundown";
import type { MwSession } from "@/lib/main-wam/types";
import { mainWamPath, praWamPath } from "@/lib/routes";
import type { MainWamContext } from "@/lib/server/main-wam/gate";
import { serverT } from "@/lib/server/main-wam/lang";
import { absenBlock } from "@/lib/server/main-wam/ceklis/data";
import { myCheckIn, presentCount } from "@/lib/server/main-wam/modul/absen";
import { awardsShown } from "@/lib/server/main-wam/modul/awards";
import { panitiaContact } from "@/lib/server/main-wam/modul/contact";
import { quizOfSession } from "@/lib/server/main-wam/kuis/agenda";
import { silentNow } from "@/lib/server/main-wam/modul/silent";
import { surveyFor } from "@/lib/server/main-wam/survey";
import { AbsenView, ModuleActionView, type AbsenSlot, type ModuleSlot } from "./SessionViews";

/*
 * P04: what a module adds, each only while its module is on (SLOTS, fondasi; owner agen D; names
 * and props fixed). Where they are drawn (agen A):
 * - SessionAbsen: Detail sesi under the dresscode, and Beranda's Sekarang card only while the
 *   session's absen is open and the person has not checked in. Open → the one primary "Absen"
 *   button, nothing more (the same in both places). Detail sesi also: "Hadir 07.52", "Tidak
 *   tercatat hadir · Hubungi panitia" after the window, and for the BOD "Hadir 96 dari 120".
 * - SessionModuleAction: Detail sesi only, under SessionAbsen: Silent Meeting "Kirim masukan" /
 *   "Sudah ditutup", Awarding "Pilih nominasi", Survei "Isi survei"; for panitia the session's QR.
 * Nothing for a cancelled session, a module that is off, or a session without it. A read that
 * fails leaves the slot empty, never the page.
 */

export async function absenSlot({ session, context, now }: { session: MwSession; context: MainWamContext; now: Date }): Promise<AbsenSlot> {
  const { viewer, settings } = context;
  if (!settings.modules.absen || session.status !== "terbit" || !session.usesAttendance) return { kind: "none" };
  if (!mainWamCan(viewer, "absen")) {
    if (!mainWamCan(viewer, "ringkasan") || checkInState(session, now) === "belum") return { kind: "none" };
    const count = await presentCount(session.id);
    return count ? { kind: "bod", ...count } : { kind: "none" };
  }
  const card = absenCard(session, await myCheckIn(session.id, viewer.id), now);
  if (card.kind === "terlewat") return { kind: "terlewat", contact: await panitiaContact(settings, session).catch(() => null) };
  // Module Ceklis: while an agenda's checklist that asks "lengkap sebelum absen" is unfinished, the button is a lock that leads to it.
  if (card.kind === "buka" && settings.modules.ceklis) {
    // Only the screen's hint: when the checklist cannot be read the button stays, and the scan itself refuses (503).
    const block = await absenBlock(session, viewer.id).catch(() => null);
    if (block) return { kind: "ceklis", block };
  }
  return card;
}

export async function SessionAbsen({ session, context, now, home }: { session: MwSession; context: MainWamContext; now: Date; home?: boolean }) {
  const slot = await absenSlot({ session, context, now }).catch((): AbsenSlot => ({ kind: "none" }));
  return <AbsenView slot={slot} home={home} />;
}

export async function moduleSlot({ session, context, now }: { session: MwSession; context: MainWamContext; now: Date }): Promise<ModuleSlot> {
  const { viewer, settings } = context;
  const actions: ModuleSlot = { action: null, qr: null };
  if (session.status !== "terbit") return actions;
  // Panitia print or show the session's QR (Absen QR on, session "pakai absen").
  if (settings.modules.absen && session.usesAttendance && mainWamCan(viewer, "kelola")) actions.qr = { sessionId: session.id };
  if (session.module === "silent" && settings.modules.silent) {
    const { view } = await silentNow(now, session.id);
    if (view?.state === "buka" && mainWamCan(viewer, "silent-kirim")) actions.action = { kind: "silent-buka", href: mainWamPath.silentMeeting(session.id), closesAt: view.closesAt };
    else if (view?.state === "tutup") {
      actions.action = mainWamCan(viewer, "silent-rekap")
        ? { kind: "link", label: "Lihat rekap", href: mainWamPath.silentRecap, icon: "lock" }
        : { kind: "silent-tutup", href: mainWamPath.silentMeeting(session.id) };
    }
  }
  if (session.module === "voting" && settings.modules.voting) {
    const { categories, approvals } = await awardsShown();
    const own = categories.filter(category => category.sessionId === session.id);
    const list = own.length ? own : shownCategories(categories).filter(category => !category.sessionId);
    if (mainWamCan(viewer, "voting") && list.some(category => votingState(category, now) === "buka")) {
      actions.action = { kind: "link", label: "Pilih nominasi", href: mainWamPath.awards, icon: "trophy", primary: true };
    } else if (mainWamCan(viewer, "awarding-setujui") && list.some(category => approvalCard(category, approvals.get(category.id), now).kind === "perlu")) {
      actions.action = { kind: "link", label: "Persetujuan awarding", href: mainWamPath.awardApproval, icon: "trophy", primary: true };
    } else if (list.some(category => isAnnounced(category, approvals.get(category.id), now))) {
      actions.action = { kind: "link", label: "Lihat pemenang", href: mainWamPath.awards, icon: "trophy" };
    }
  }
  // Survei (R7): the shared rule of Beranda (module on, a form, open now, not filled in yet).
  const survey = session.module === "survei" ? await surveyFor(context, [session], now, session.id).catch(() => null) : null;
  if (survey) actions.action = { kind: "link", label: "Isi survei", href: praWamPath.questionnaire(survey.formSlug), icon: "survei", primary: true };
  // Kuis live: the quiz tied to this agenda item (Admin WAM → Kuis live → Agenda), once its lobby is open and until the game is over.
  if (!actions.action && settings.modules.kuis) {
    const quiz = await quizOfSession(session.id).catch(() => null);
    if (quiz && quiz.phase && quiz.phase !== "siap" && quiz.phase !== "selesai") {
      actions.action = { kind: "link", label: (await serverT())("kuis.join.title"), href: mainWamPath.quiz(quiz.quizId), icon: "kuis", primary: true };
    }
  }
  // Mode demo: the agenda's "Kuis live" opens the sample quiz that plays itself.
  if (!actions.action && settings.moduleConfig?.demo && settings.modules.kuis && /kuis/i.test(session.title)) {
    actions.action = { kind: "link", label: (await serverT())("kuis.join.title"), href: mainWamPath.quiz(DEMO_QUIZ_ID), icon: "kuis", primary: true };
  }
  return actions;
}

export async function SessionModuleAction({ session, context, now }: { session: MwSession; context: MainWamContext; now: Date }) {
  const slot = await moduleSlot({ session, context, now }).catch((): ModuleSlot => ({ action: null, qr: null }));
  return <ModuleActionView slot={slot} />;
}
