"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, Clock, CloudOff, Info, ListChecks, Phone, QrCode, TimerOff } from "lucide-react";
import { useLang, useT } from "@/components/main-wam/i18n";
import { ScreenContent } from "@/components/main-wam/shell";
import { ActionBar, Button, SkeletonGroup, Spinner } from "@/components/main-wam/ui";
import { clockWhen, outcomeText, type CheckInOutcome, type OutcomeText } from "@/lib/main-wam/modul/absen";
import type { PanitiaContact } from "@/lib/main-wam/modul/contact";
import { mainWamPath } from "@/lib/routes";
import { ContactSheet } from "../ContactSheet";
import { errorText } from "../request";
import { Result } from "../Result";
import { AbsenQueue } from "./AbsenQueue";
import { enqueueScan, retryable, sendScan } from "./queue";
import css from "../modul.module.css";

const ICONS: Record<OutcomeText["icon"], typeof CircleCheck> = { check: CircleCheck, clock: Clock, "timer-off": TimerOff, info: Info, qr: QrCode, list: ListChecks };
const TONES = { success: "success", warning: "warning", error: "error", neutral: "neutral" } as const;

/** A02–A04 and the other answers to a scan, with the one action that helps. */
export function CheckInResultView({ outcome, contact, now = new Date(), initialContact = false }: { outcome: CheckInOutcome; contact: PanitiaContact | null; now?: Date; initialContact?: boolean }) {
  const t = useT();
  const { lang } = useLang();
  const [contactOpen, setContactOpen] = useState(initialContact);
  const text = outcomeText(outcome, now, lang);
  const Icon = ICONS[text.icon];
  const closed = outcome.kind === "tutup";
  return <div className={css.fill}>
    <ScreenContent>
      <Result icon={<Icon />} tone={TONES[text.tone]} title={text.title} sub={text.sub || undefined} body={text.body || undefined} />
    </ScreenContent>
    <ActionBar>
      {outcome.kind === "ceklis"
        ? <div className={css.stackActions}>
          <Button block icon={<ListChecks />} href={mainWamPath.session(outcome.block.sessionId)}>{t("absen.ceklisOpen")}</Button>
          <Button block variant="text" href={mainWamPath.home}>{t("ui.close")}</Button>
        </div>
        : closed
        ? <div className={css.stackActions}>
          <Button block icon={<Phone />} onClick={() => setContactOpen(true)}>{t("absen.contactTitle")}</Button>
          <Button block variant="text" href={mainWamPath.home}>{t("ui.close")}</Button>
        </div>
        : <Button block href={mainWamPath.home}>{t("absen.done")}</Button>}
    </ActionBar>
    <ContactSheet open={contactOpen} onClose={() => setContactOpen(false)} contact={contact} />
  </div>;
}

/** A02 offline: the scan is kept on the phone and goes out with its time when there is signal. */
export function OfflineSaved({ title, scannedAt, now }: { title: string; scannedAt: string; now?: Date }) {
  const t = useT();
  const { lang } = useLang();
  return <div className={css.fill}>
    <AbsenQueue />
    <ScreenContent>
      <Result icon={<CloudOff />} tone="warning" title={t("absen.saved")} sub={[title, clockWhen(scannedAt, now ?? new Date(), lang)].filter(Boolean).join(" · ")} body={t("absen.sentWhenOnline")} />
    </ScreenContent>
    <ActionBar><Button block href={mainWamPath.home}>{t("absen.done")}</Button></ActionBar>
  </div>;
}

type State = { kind: "kirim" } | { kind: "hasil"; outcome: CheckInOutcome } | { kind: "tersimpan"; at: string } | { kind: "gagal"; message: string };

/**
 * What a session's printed QR opens (A02–A04): the check-in is sent from the screen (a POST, never
 * on page load, so a prefetch can never record anyone), then its answer shows. No signal, or no
 * answer of ours (busy, a hotel Wi-Fi's login page): the scan is kept with its time and sent later
 * (A02 offline, audit T1). Only a refusal of ours shows as a failure.
 */
export function CheckIn({ token, contact }: { token: string; contact: PanitiaContact | null }) {
  const t = useT();
  const [state, setState] = useState<State>({ kind: "kirim" });
  const started = useRef(false);

  async function send() {
    setState({ kind: "kirim" });
    const at = new Date().toISOString();
    if (!navigator.onLine) { enqueueScan({ token, scannedAt: at, title: "" }); setState({ kind: "tersimpan", at }); return; }
    try {
      setState({ kind: "hasil", outcome: await sendScan(token) });
    } catch (error) {
      if (retryable(error)) { enqueueScan({ token, scannedAt: at, title: "" }); setState({ kind: "tersimpan", at }); return; }
      setState({ kind: "gagal", message: errorText(error) });
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the QR's screen opens
  }, []);

  if (state.kind === "hasil") return <CheckInResultView outcome={state.outcome} contact={contact} />;
  if (state.kind === "tersimpan") return <OfflineSaved title="" scannedAt={state.at} />;
  if (state.kind === "gagal") {
    return <div className={css.fill}>
      <ScreenContent><Result icon={<QrCode />} title={t("absen.notSent")} body={state.message} /></ScreenContent>
      <ActionBar><Button block onClick={() => void send()}>{t("shell.retry")}</Button></ActionBar>
    </div>;
  }
  return <ScreenContent>
    <SkeletonGroup label={t("absen.recording")} className={css.result}>
      <Spinner />
      <p className={css.resultBody}>{t("absen.recordingDots")}</p>
    </SkeletonGroup>
  </ScreenContent>;
}
