"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Clock3, MapPin, RotateCcw, ScanFace, X } from "lucide-react";
import {
  CONSENT_VERSION, nextKind, REASON_KINDS,
  type ClockInState, type DailyKind, type DailyRecord, type FaceStatus, type ReasonKind,
} from "@/lib/hr/attendance";
import type { Copy } from "@/lib/hr/copy";
import { distanceLabel, locationVerdict, MAX_ACCURACY_M } from "@/lib/hr/geo";
import { clockAt, sayDate } from "@/lib/hr/lang";
import { tabOf, type HrTab } from "@/lib/hr/tabs";
import { THEME_COOKIE, themeColors, type Theme } from "@/lib/hr/theme";
import { LEAVE_TYPES, type LeaveType, type TeamLeave } from "@/lib/hr/leave";
import { zoneDate, zoneSuffix } from "@/lib/pra-wam/zone";
import { hrPath, praWamApi } from "@/lib/routes";
import { praWamRequest } from "@/components/pra-wam/api";
import { useViewerZone } from "@/components/pra-wam/ViewerZone";
import { cancelLeave, cancelRequest, loadState, readPlace, startClockIn, startEnroll, submitClockIn, submitEnroll, withdrawFace, type Challenge, type Place } from "./clockInApi";
import { FaceCamera, type FaceCapture } from "./FaceCamera";
import { problemText, useCopy } from "./lang";
import { LeaveSheet } from "./LeaveForm";
import { RevisionSheet } from "./RevisionForm";
import { TeamScreen } from "./TeamScreen";
import { DayDetail, FaceDetail, HelpDetail, HistoryScreen, HomeScreen, LeaveDetail, placeOf, ProfileScreen, RequestDetail, RequestsScreen } from "./screens";
import { Ask, Choices, Detail, Empty, MatchMeter, Notices, Pick, Sheet, Ticket } from "./ui";
import styles from "./absen.module.css";
import app from "./app.module.css";

type Reason = { kind: ReasonKind; text: string };
/** One step of the clock-in sheet (or the revision sheet); exported for the layout preview (/dev-preview/absen). */
export type ClockInStep = Step;
type Step =
  | { name: "ringkas" }
  | { name: "persetujuan"; then: "daftar" | DailyKind }
  | { name: "lokasi"; kind: DailyKind; consent: string | null }
  | { name: "kamera"; kind: DailyKind; challenge: Challenge; place: Place; reason: Reason | null; consent: string | null }
  | { name: "daftar"; challenge: Challenge; then: DailyKind | null }
  | { name: "kirim"; text: string; since: number }
  | { name: "hasil"; title: string; record: DailyRecord | null; note: string | null; then: DailyKind | null }
  | { name: "gagal"; text: string; retry: Step }
  | { name: "revisi"; date?: string }
  | { name: "cuti"; type: LeaveType };
type DetailTarget = { kind: "hari"; date: string } | { kind: "pengajuan"; id: string } | { kind: "cuti"; id: string } | { kind: "wajah" } | { kind: "bantuan" };
/** A screen pushed inside a tab, with a back button; the bottom menu stays. */
export type ClockInDetail = DetailTarget & { tab: HrTab };
type Question = { kind: "keluar" } | { kind: "hapus-wajah" } | { kind: "batal-pengajuan"; id: string } | { kind: "batal-cuti"; id: string } | { kind: "ajukan" };
/** What Ajukan offers: the four kinds of leave, or a revision of an absen. */
type NewRequest = LeaveType | "revisi";
/**
 * What WG People keeps in each history entry: whether a sheet or a detail screen is on show
 * (`hrTop`), the detail screens open in this tab (`hrDetails`), and, on the entry left behind, where
 * the page was scrolled and which row opened what came next (`hrScroll`, `hrMark`).
 */
type Entry = { hrTop?: "detail" | "sheet"; hrDetails?: ClockInDetail[]; hrScroll?: number; hrMark?: string };

const SUMMARY: Step = { name: "ringkas" };
const SLOW_MS = 20_000;
const usable = (status: FaceStatus | undefined) => status === "aktif" || status === "menunggu" || status === "siap";
/** The receipt's line after a new absen: a word for the day ahead, or that Admin HR will look. */
const warmTitle = (record: DailyRecord, t: Copy) => record.status !== "sah" ? t.flow.warm.cek : t.flow.warm[record.kind];
const entry = (): Entry => (window.history.state as Entry | null) ?? {};
const markOf = (target: DetailTarget) => (target.kind === "hari" ? `hari-${target.date}` : target.kind === "pengajuan" ? `pengajuan-${target.id}` : target.kind === "cuti" ? `cuti-${target.id}` : target.kind);
const detailKey = (detail: ClockInDetail) => `${detail.tab}-${markOf(detail)}`;
/** The "please wait" step, with when it started (after SLOW_MS it offers Batal). */
const sending = (text: string): Step => ({ name: "kirim", text, since: Date.now() });
/** Server answers end with a full stop; a title does not. */
const asTitle = (text: string) => text.replace(/\.\s*$/, "");
function titleOf(step: Step, t: Copy): string {
  if (step.name === "persetujuan" || step.name === "daftar") return t.flow.register;
  if (step.name === "lokasi" || step.name === "kamera") return t.clockIn[step.kind];
  return "WG People";
}
/** The time now, starting from the server's (so the first paint matches) and moving every 15 seconds. */
function useNow(initial: string, frozen = false): string {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    if (frozen) return;
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 15_000);
    const first = window.setTimeout(() => setNow(new Date().toISOString()), 0);
    return () => { window.clearInterval(timer); window.clearTimeout(first); };
  }, [frozen]);
  return now;
}

/**
 * WG People (21 Nov 2026): one set of data, fetched once and kept, drawn as the four places of the
 * bottom menu (screens.tsx). A day, a request, the face data and the office points open as detail
 * screens with a back button; clocking in, enrolling and asking for a revision open as sheets over the
 * app. Each puts an entry in the history (what it shows is kept in the entry), so the phone's back
 * button walks back through them, coming back to the same scroll and the row that opened them; nothing
 * reloads. Closing a sheet stops what it was doing (a late answer never reopens it). The data is
 * refreshed quietly when another place is opened, when the app comes back to the front, when the day
 * turns, and when the device's time zone changes.
 * Clocking in: the location first (inside an office point, or a reason), then the face (two movements,
 * or one steady look in Foto cepat), then the server decides.
 */
export function ClockInFlow({ initial, openEnroll = false, name = "", fullName = "", now: serverNow = new Date().toISOString(), initialStep, initialDetail, preview = false, previewTeam = null, theme: initialTheme = "terang" }: {
  initial: ClockInState; openEnroll?: boolean; name?: string; fullName?: string; now?: string;
  initialStep?: ClockInStep; initialDetail?: ClockInDetail;
  /** The layout preview: no quiet refresh (its API refuses without a session). */
  preview?: boolean;
  /** The layout preview's made-up team for Tim. */
  previewTeam?: TeamLeave[] | null;
  /** Terang or Gelap on this device (cookie wg_tema, read by the server). */
  theme?: Theme;
}) {
  const tab = tabOf(usePathname());
  const zone = useViewerZone();
  const { t, lang } = useCopy();
  const fail = (error: unknown) => problemText(t, error);
  const now = useNow(serverNow, preview); // the layout check keeps its own made-up time
  const [state, setState] = useState(initial);
  const [step, setStep] = useState<Step>(() => initialStep ?? (openEnroll && initial.ready && !usable(initial.face?.status) ? { name: "persetujuan", then: "daftar" } : SUMMARY));
  const [sheetTitle, setSheetTitle] = useState(() => titleOf(step, t));
  const [details, setDetails] = useState<ClockInDetail[]>(initialDetail ? [initialDetail] : []);
  const [question, setQuestion] = useState<Question | null>(null);
  /** The running clock-in or enrolment; aborted when its sheet closes, so a late answer does not reopen it. */
  const [flow, setFlow] = useState(() => new AbortController());
  const [agreed, setAgreed] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [reason, setReason] = useState<Reason>({ kind: "event", text: "" });
  const [reasonPicked, setReasonPicked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; problem: boolean } | null>(null);
  const [spoken, setSpoken] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [askedDay, setAskedDay] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  /** Profil → Tampilan: at once on this page (no reload), and remembered for the next visit. */
  const changeTheme = (next: Theme) => {
    setTheme(next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    const root = document.getElementById("wg-tema");
    if (root) root.dataset.tema = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColors[next]);
  };

  const next = nextKind(state.today);
  const verdict = useMemo(() => (place ? locationVerdict(place, state.offices) : null), [place, state.offices]);
  const refresh = useCallback(async () => { try { setState(await loadState()); } catch { /* keep what is shown */ } }, []);
  const tell = useCallback((text: string, problem = false) => { const shown = t.server(text); setToast({ text: shown, problem }); setSpoken(shown); }, [t]);

  // Fresh data without a reload: when another place is opened, when the app comes back to the front,
  // when the device's zone changes (ViewerZone, "wk:zone"), and when the day turns while it is open.
  const shownTab = useRef(tab);
  useEffect(() => {
    if (shownTab.current === tab) return;
    shownTab.current = tab;
    if (preview) return;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [tab, refresh, preview]);
  useEffect(() => {
    if (preview) return;
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    const zoneChanged = () => void refresh();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("wk:zone", zoneChanged);
    return () => { document.removeEventListener("visibilitychange", visible); window.removeEventListener("wk:zone", zoneChanged); };
  }, [refresh, preview]);
  useEffect(() => {
    const day = zoneDate(now, zone);
    if (preview || day === state.today.workDate || day === askedDay) return;
    const timer = window.setTimeout(() => { setAskedDay(day); void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [now, zone, state.today.workDate, askedDay, refresh, preview]);

  // History: what a page load finds left over is cleared; ?daftar=1 opens its sheet as a real entry.
  useEffect(() => {
    const left = entry();
    if (left.hrTop || left.hrDetails) window.history.replaceState({ ...window.history.state, hrTop: undefined, hrDetails: undefined }, "");
    if (openEnroll && initial.ready && !usable(initial.face?.status)) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
      window.history.pushState({ ...window.history.state, hrTop: "sheet" }, "");
    }
    // Only on the first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The back button: the entry on show says what is open. Coming back puts the scroll and focus where they were.
  useEffect(() => {
    const back = () => {
      const shown = entry();
      setQuestion(null);
      if (shown.hrTop !== "sheet") { flow.abort(); setFlow(new AbortController()); setStep(SUMMARY); }
      setDetails(shown.hrDetails ?? []);
      window.requestAnimationFrame(() => {
        if (typeof shown.hrScroll === "number") window.scrollTo(0, shown.hrScroll);
        if (shown.hrMark) document.querySelector<HTMLElement>(`[data-mark="${shown.hrMark}"]`)?.focus({ preventScroll: true });
      });
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [flow]);
  // Tapping the tab you are on again (HrFrame) goes back to its root.
  useEffect(() => {
    const again = () => { const open = entry().hrDetails?.length ?? 0; if (open && entry().hrTop === "detail") window.history.go(-open); };
    window.addEventListener("hr:tab-again", again);
    return () => window.removeEventListener("hr:tab-again", again);
  }, []);
  useEffect(() => {
    if (!toast || toast.problem) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const sheetOpen = step.name !== "ringkas";
  const open = (to: Step, title: string) => {
    if (!sheetOpen) window.history.pushState({ ...window.history.state, hrTop: "sheet" }, "");
    setSheetTitle(title); setStep(to);
  };
  const close = () => {
    if (entry().hrTop === "sheet") { window.history.back(); return; }
    flow.abort(); setFlow(new AbortController()); setStep(SUMMARY);
  };
  const shownDetails = details.filter(detail => detail.tab === tab);
  const push = (to: DetailTarget) => {
    const stack = [...shownDetails, { ...to, tab }];
    window.history.replaceState({ ...window.history.state, hrScroll: window.scrollY, hrMark: markOf(to) }, "");
    window.history.pushState({ ...window.history.state, hrTop: "detail", hrDetails: stack, hrScroll: 0, hrMark: undefined }, "");
    setDetails(stack);
    window.scrollTo(0, 0);
  };
  const pop = () => { if (entry().hrTop === "detail") window.history.back(); else setDetails(shownDetails.slice(0, -1)); };

  const read = async () => {
    setReading(true); setPlaceError(null);
    try { setPlace(await readPlace(t)); } catch (error) { setPlaceError(fail(error)); } finally { setReading(false); }
  };
  useEffect(() => {
    if (step.name !== "lokasi" || place || reading || placeError) return;
    const timer = window.setTimeout(() => void read(), 0);
    return () => window.clearTimeout(timer);
  });

  /** The main button: consent and enrolment first when needed, else the location. */
  const begin = (kind: DailyKind) => {
    setNotice(null); setAgreed(false); setPlace(null); setPlaceError(null); setReasonPicked(false); setReason({ kind: "event", text: "" });
    if (!usable(state.face?.status)) {
      // Say why: no photo from HR (missing from GreatDay), or one that cannot be used.
      setNotice(state.face ? t.flow.unusable : t.flow.noReference);
      open({ name: "persetujuan", then: "daftar" }, t.flow.register);
    }
    else if (state.face?.status === "siap" && !state.face.consented) open({ name: "persetujuan", then: kind }, t.clockIn[kind]);
    else open({ name: "lokasi", kind, consent: null }, t.clockIn[kind]);
  };
  const enrolFromProfile = () => { setAgreed(false); setNotice(null); open({ name: "persetujuan", then: "daftar" }, t.flow.register); };

  const openCamera = async (kind: DailyKind, consent: string | null) => {
    if (!place) return;
    const { signal } = flow;
    const outside = verdict?.kind === "di_luar";
    setStep(sending(t.flow.preparing));
    try {
      const answer = await startClockIn(kind);
      if (signal.aborted) return;
      if (answer.kind === "daftar") { setNotice(t.server(answer.message)); setSheetTitle(t.flow.register); setStep({ name: "persetujuan", then: "daftar" }); return; }
      if (answer.kind === "sudah") { await refresh(); setStep({ name: "hasil", title: t.flow.already(t.clockIn[kind]), record: answer.record, note: null, then: null }); return; }
      setStep({ name: "kamera", kind, challenge: answer.challenge, place, reason: outside ? reason : null, consent });
    } catch (error) {
      if (!signal.aborted) setStep({ name: "gagal", text: fail(error), retry: { name: "lokasi", kind, consent } });
    }
  };

  const captured = async (current: Extract<Step, { name: "kamera" }>, capture: FaceCapture) => {
    const { signal } = flow;
    setStep(sending(t.flow.sendingRecord));
    try {
      const { data, message } = await submitClockIn(current.challenge, capture, current.place, current.reason, current.consent);
      await refresh();
      if (signal.aborted) { tell(message); return; }
      const flags = data.record.flags.map(flag => t.flags[flag].toLowerCase()).join(", ");
      setSpoken(t.server(message));
      setStep({ name: "hasil", title: warmTitle(data.record, t), record: data.record, note: data.record.status === "perlu_cek" ? t.flow.reviewNote(flags) : null, then: null });
    } catch (error) {
      if (signal.aborted) tell(fail(error), true);
      else setStep({ name: "gagal", text: fail(error), retry: { name: "lokasi", kind: current.kind, consent: current.consent } });
    }
  };

  const enroll = async (then: DailyKind | null) => {
    const { signal } = flow;
    setStep(sending(t.flow.openingCamera));
    try {
      const challenge = await startEnroll();
      if (!signal.aborted) setStep({ name: "daftar", challenge, then });
    } catch (error) { if (!signal.aborted) setStep({ name: "gagal", text: fail(error), retry: { name: "persetujuan", then: "daftar" } }); }
  };

  const enrolled = async (current: Extract<Step, { name: "daftar" }>, capture: FaceCapture) => {
    const { signal } = flow;
    setStep(sending(t.flow.saving));
    try {
      const { data, message } = await submitEnroll(current.challenge, capture, CONSENT_VERSION);
      await refresh();
      if (signal.aborted) { tell(message); return; }
      setSpoken(t.server(message));
      setStep({ name: "hasil", title: t.server(message), record: null, note: data.status === "menunggu" ? t.flow.enrolNote : null, then: current.then ?? next });
    } catch (error) {
      if (signal.aborted) tell(fail(error), true);
      else setStep({ name: "gagal", text: fail(error), retry: { name: "persetujuan", then: "daftar" } });
    }
  };

  /** The small question's answer: sign out, delete the face data, or withdraw a request. */
  const answer = async (asked: Question) => {
    setQuestion(null);
    if (asked.kind === "keluar") {
      setLeaving(true);
      try { await praWamRequest(praWamApi.logout, { method: "POST" }); } catch { /* the cookie may already be gone */ }
      window.location.assign(hrPath.login());
      return;
    }
    try {
      if (asked.kind === "ajukan") return;
      tell(asked.kind === "hapus-wajah" ? await withdrawFace() : asked.kind === "batal-cuti" ? await cancelLeave(asked.id) : await cancelRequest(asked.id));
      await refresh();
    } catch (error) { tell(fail(error), true); }
  };

  /** Each step settles in as its own screen. */
  const screen = (content: ReactNode) => <div key={step.name} className={styles.enter}>{content}</div>;

  function stepContent(): ReactNode {
    if (step.name === "persetujuan") return <section className={styles.stack} aria-labelledby="persetujuan-judul">
      <div className={app.summary}>
        <h3 id="persetujuan-judul" className={app.summaryTitle}>{t.flow.consentTitle}</h3>
        {notice && <p className={app.lead}>{notice}</p>}
      </div>
      <ul className={styles.points}>{t.consent.map(point => <li key={point}><Check size={16} aria-hidden /><span>{point}</span></li>)}</ul>
      <label className={styles.agree}><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} /> {t.flow.agree}</label>
      <button type="button" className={app.wide} disabled={!agreed} onClick={() => (step.then === "daftar" ? void enroll(next) : setStep({ name: "lokasi", kind: step.then, consent: CONSENT_VERSION }))}>
        {step.then === "daftar" ? t.flow.agreeRegister : t.flow.agreeContinue}
      </button>
      <p className={styles.small}>{t.flow.disagree}</p>
    </section>;

    if (step.name === "lokasi") {
      const outside = verdict?.kind === "di_luar";
      const reasonOk = !outside || (reasonPicked && (reason.kind !== "lainnya" || reason.text.trim().length >= 3));
      const tone = placeError ? "error" : !verdict ? "wait" : verdict.kind === "di_dalam" ? "in" : "out";
      return <section className={styles.stack} aria-label={t.flow.location}>
        {placeError
          ? <div key="salah" className={styles.place} data-tone="error" role="alert">
            <span className={styles.placeIcon} aria-hidden><MapPin size={22} /></span>
            <span className={styles.placeText}><strong>{t.flow.locationError}</strong><span>{placeError}</span></span>
          </div>
          : <div key="lokasi" className={styles.place} data-tone={tone} role="status">
            <span className={styles.placeIcon} aria-hidden>{tone === "wait" ? <span className={styles.spinner} /> : <MapPin size={22} />}</span>
            <span className={styles.placeText}>
              {tone === "wait" && <><strong>{t.flow.reading}</strong><span>{t.flow.readingLine}</span></>}
              {verdict?.kind === "di_dalam" && <><strong>{t.flow.inside(verdict.office.name)}</strong><span>{t.day.fromOffice(distanceLabel(verdict.distanceM, lang))}</span></>}
              {verdict?.kind === "di_luar" && <><strong>{verdict.why === "tidak_akurat" ? t.flow.inaccurate : verdict.why === "tanpa_kantor" ? t.flow.noOffice : t.flow.outside}</strong>
                <span>{verdict.why === "tidak_akurat" ? t.flow.inaccurateLine(distanceLabel(place!.accuracyM, lang), MAX_ACCURACY_M)
                  : verdict.why === "tanpa_kantor" ? t.flow.noOfficeLine
                    : t.flow.fromOffice(distanceLabel(verdict.nearest!.distanceM, lang), verdict.nearest!.office.name)}</span></>}
            </span>
          </div>}
        {outside && <>
          <Choices label={t.flow.where} name="alasan" value={reasonPicked ? reason.kind : null}
            onChange={kind => { setReasonPicked(true); setReason(value => ({ ...value, kind })); }}
            options={REASON_KINDS.map(kind => ({ value: kind, label: t.reason[kind] }))} />
          <label className={styles.field}>
            <span>{t.flow.note(reason.kind === "lainnya")}</span>
            <input type="text" maxLength={300} value={reason.text} placeholder={t.flow.notePlaceholder} onChange={event => setReason(value => ({ ...value, text: event.target.value }))} />
          </label>
          <p className={styles.small}>{t.flow.outsideNote}</p>
        </>}
        {placeError
          ? <button type="button" className={app.wide} onClick={() => { setPlaceError(null); void read(); }}><RotateCcw size={18} aria-hidden /> {t.flow.readAgain}</button>
          : <>
            <button type="button" className={app.wide} disabled={!place || reading || !reasonOk} onClick={() => void openCamera(step.kind, step.consent)}><ScanFace size={20} aria-hidden /> {t.flow.toCamera}</button>
            <button type="button" className={app.quiet} disabled={reading} onClick={() => { setPlace(null); setPlaceError(null); void read(); }}><RotateCcw size={14} aria-hidden /> {t.flow.readAgain}</button>
          </>}
      </section>;
    }

    if (step.name === "kamera") return <section className={styles.flowCamera} aria-label={t.flow.cameraLabel(t.clockIn[step.kind])}>
      <FaceCamera key={step.challenge.nonce} steps={step.challenge.steps} purpose="absen" onDone={capture => void captured(step, capture)} />
    </section>;

    if (step.name === "daftar") return <section className={styles.flowCamera} aria-label={t.flow.register}>
      <p className={styles.small}>{t.flow.once}</p>
      <FaceCamera key={step.challenge.nonce} steps={step.challenge.steps} purpose="daftar" onDone={capture => void enrolled(step, capture)} />
    </section>;

    if (step.name === "kirim") return <section className={styles.waiting}>
      <span className={styles.spinner} aria-hidden />
      <p className={styles.small}>{step.text}</p>
      {Date.parse(now) - step.since > SLOW_MS && <p className={styles.small}>{t.flow.slow}</p>}
    </section>;

    if (step.name === "gagal") return <section className={styles.stack}>
      <div className={styles.place} data-tone="error" role="alert"><span className={styles.placeText}><strong>{t.flow.failed}</strong><span>{step.text}</span></span></div>
      <button type="button" className={app.wide} onClick={() => setStep(step.retry)}><RotateCcw size={18} aria-hidden /> {t.common.tryAgain}</button>
    </section>;

    if (step.name === "hasil" && step.record) {
      const record = step.record;
      return <section className={styles.result}>
        <Ticket label={t.flow.receipt(t.clockIn[record.kind])} stub={<>
          <p className={app.stubLabel}>{t.clockIn[record.kind]} · {sayDate(lang, record.workDate, t.dateLong)}</p>
          <p className={app.clockLine}><span className={app.clock}>{clockAt(lang, record.at, zone)}</span><span className={app.zone}>{zone}</span></p>
          <p className={app.stamp} data-tone={record.status === "sah" ? undefined : record.status}>
            {record.status === "sah" ? <Check size={16} strokeWidth={3} aria-hidden /> : record.status === "ditolak" ? <X size={16} strokeWidth={3} aria-hidden /> : <Clock3 size={16} strokeWidth={2.6} aria-hidden />}{t.status[record.status]}
          </p>
        </>}>
          <h3 className={app.summaryTitle}>{asTitle(step.title)}</h3>
          <p className={app.lead}>{placeOf(record, t)}{record.distanceM != null && record.officeName ? ` · ${t.day.fromOffice(distanceLabel(record.distanceM, lang))}` : ""}</p>
          {record.faceScore != null && <MatchMeter score={record.faceScore} />}
          {step.note && <p className={styles.warn}>{step.note}</p>}
        </Ticket>
        <button type="button" className={app.wide} onClick={close}>{t.common.done}</button>
      </section>;
    }

    if (step.name === "hasil") {
      const check = step.record && step.record.status !== "sah";
      return <section className={styles.result}>
        <span className={styles.resultMark} data-tone={check ? "cek" : undefined} aria-hidden>{check ? <Clock3 size={32} strokeWidth={2.4} /> : <Check size={34} strokeWidth={2.6} />}</span>
        <h3 className={app.summaryTitle}>{asTitle(step.title)}</h3>
        {step.record && <p className={app.lead}>{clockAt(lang, step.record.at, zone)}{zoneSuffix(zone)}{step.record.officeName ? ` · ${step.record.officeName}` : ""}</p>}
        {step.record?.faceScore != null && <MatchMeter score={step.record.faceScore} />}
        {step.note && <p className={styles.warn}>{step.note}</p>}
        {step.then && <button type="button" className={app.wide} onClick={() => begin(step.then!)}>{t.flow.continue(t.clockIn[step.then])}</button>}
        <button type="button" className={step.then ? app.quiet : app.wide} onClick={close}>{t.common.done}</button>
      </section>;
    }
    return null;
  }

  function detailScreen(detail: ClockInDetail): ReactNode {
    if (detail.kind === "hari") return <DayDetail state={state} date={detail.date} zone={zone} onBack={pop}
      onRevise={date => open({ name: "revisi", date }, t.revision.title)} onRequest={id => push({ kind: "pengajuan", id })} />;
    if (detail.kind === "pengajuan") {
      const request = state.requests.find(item => item.id === detail.id);
      return request
        ? <RequestDetail request={request} zone={zone} onBack={pop} onCancel={() => setQuestion({ kind: "batal-pengajuan", id: request.id })} />
        : <Detail title={t.day.correction} onBack={pop}><Empty title={t.flow.notFound}>{t.flow.notFound31}</Empty></Detail>;
    }
    if (detail.kind === "cuti") {
      const leave = state.leaves?.find(item => item.id === detail.id);
      return leave
        ? <LeaveDetail leave={leave} zone={zone} onBack={pop} onCancel={() => setQuestion({ kind: "batal-cuti", id: leave.id })} />
        : <Detail title={t.requests.title} onBack={pop}><Empty title={t.flow.notFound}>{t.flow.notFound120}</Empty></Detail>;
    }
    if (detail.kind === "wajah") return <FaceDetail state={state} onBack={pop} onEnroll={enrolFromProfile} onWithdraw={() => setQuestion({ kind: "hapus-wajah" })} />;
    return <HelpDetail state={state} onBack={pop} />;
  }

  function root(): ReactNode {
    if (tab === "riwayat") return <HistoryScreen state={state} zone={zone} onDay={date => push({ kind: "hari", date })} />;
    if (tab === "tim") return <TeamScreen stamp={leaveStamp} today={state.today.workDate} preview={previewTeam} />;
    if (tab === "pengajuan") return <RequestsScreen state={state} onNew={() => setQuestion({ kind: "ajukan" })} onOpen={id => push({ kind: "pengajuan", id })} onOpenLeave={id => push({ kind: "cuti", id })} />;
    if (tab === "profil") return <ProfileScreen state={state} fullName={fullName || name} zone={zone}
      theme={theme} onTheme={changeTheme} onFace={() => push({ kind: "wajah" })} onHelp={() => push({ kind: "bantuan" })} onSignOut={() => setQuestion({ kind: "keluar" })} />;
    return <HomeScreen state={state} now={now} zone={zone} name={name} onClock={begin}
      onDay={date => push({ kind: "hari", date })} onRevise={date => open({ name: "revisi", date }, t.revision.title)} />;
  }

  // Tim reads the team again once the person's own requests change (a new one shows there as waiting).
  const leaveStamp = (state.leaves ?? []).map(leave => `${leave.id}:${leave.status}`).join(",");
  const choose = (what: NewRequest) => {
    setQuestion(null);
    if (what === "revisi") open({ name: "revisi" }, t.revision.title);
    else open({ name: "cuti", type: what }, t.leaveTitle[what]);
  };
  const current = shownDetails.at(-1) ?? null;
  const slow = step.name === "kirim" && Date.parse(now) - step.since > SLOW_MS;
  return <>
    {/* The tab root stays under its detail screens, so coming back finds its filter and place as they were. */}
    <div key={tab} hidden={Boolean(current)}>{root()}</div>
    {current && <div key={detailKey(current)}>{detailScreen(current)}</div>}
    {step.name === "cuti"
      ? <LeaveSheet today={state.today.workDate} initialType={step.type} leaves={state.leaves ?? []}
        onCancel={close} onDone={message => { tell(message); void refresh(); close(); }} />
      : step.name === "revisi"
      ? <RevisionSheet today={state.today.workDate} initialDate={step.date} recent={state.recent} requests={state.requests} zone={zone}
        onCancel={close} onDone={message => { tell(message); void refresh(); close(); }} />
      : sheetOpen && <Sheet title={sheetTitle} step={step.name} lead={(step.name === "kirim" && !slow) || step.name === "hasil" ? null : { kind: "cancel", onClick: close }}>{screen(stepContent())}</Sheet>}
    {question?.kind === "ajukan" && <Pick<NewRequest> title={t.requests.pick} onCancel={() => setQuestion(null)} onPick={choose}
      options={[
        ...(state.leaves ? LEAVE_TYPES.map(type => ({ value: type, label: t.leave[type], sub: t.leaveHint[type] })) : []),
        { value: "revisi", label: t.requests.revision, sub: t.requests.revisionSub },
      ]} />}
    {question && question.kind !== "ajukan" && <Ask
      title={question.kind === "keluar" ? t.flow.signOut : question.kind === "hapus-wajah" ? t.flow.deleteFace : t.flow.withdraw}
      message={question.kind === "keluar" ? t.flow.signOutLine : question.kind === "hapus-wajah" ? t.flow.deleteFaceLine : question.kind === "batal-cuti" ? t.flow.withdrawLeave : t.flow.withdrawLine}
      action={question.kind === "keluar" ? (leaving ? t.flow.signingOut : t.profile.signOut) : question.kind === "hapus-wajah" ? t.flow.delete : t.decided.withdraw} danger
      onAction={() => void answer(question)} onCancel={() => setQuestion(null)} />}
    <Notices spoken={spoken} toast={toast} onClose={() => setToast(null)} />
  </>;
}
