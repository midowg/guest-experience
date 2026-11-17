"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, Clock, CloudOff, Info, Phone, QrCode, TimerOff } from "lucide-react";
import { ScreenContent } from "@/components/main-wam/shell";
import { ActionBar, Button, SkeletonGroup, Spinner } from "@/components/main-wam/ui";
import { clockWhen, outcomeText, type CheckInOutcome, type OutcomeText } from "@/lib/main-wam/modul/absen";
import type { PanitiaContact } from "@/lib/main-wam/modul/contact";
import { mainWamPath } from "@/lib/routes";
import { ContactSheet } from "../ContactSheet";
import { errorText, ModulError } from "../request";
import { Result } from "../Result";
import { AbsenQueue } from "./AbsenQueue";
import { enqueueScan, sendScan } from "./queue";
import css from "../modul.module.css";

const ICONS: Record<OutcomeText["icon"], typeof CircleCheck> = { check: CircleCheck, clock: Clock, "timer-off": TimerOff, info: Info, qr: QrCode };
const TONES = { success: "success", warning: "warning", error: "error", neutral: "neutral" } as const;

/** A02–A04 and the other answers to a scan, with the one action that helps. */
export function CheckInResultView({ outcome, contact, now = new Date(), initialContact = false }: { outcome: CheckInOutcome; contact: PanitiaContact | null; now?: Date; initialContact?: boolean }) {
  const [contactOpen, setContactOpen] = useState(initialContact);
  const text = outcomeText(outcome, now);
  const Icon = ICONS[text.icon];
  const closed = outcome.kind === "tutup";
  return <div className={css.fill}>
    <ScreenContent>
      <Result icon={<Icon />} tone={TONES[text.tone]} title={text.title} sub={text.sub || undefined} body={text.body || undefined} />
    </ScreenContent>
    <ActionBar>
      {closed
        ? <div className={css.stackActions}>
          <Button block icon={<Phone />} onClick={() => setContactOpen(true)}>Hubungi panitia</Button>
          <Button block variant="text" href={mainWamPath.home}>Tutup</Button>
        </div>
        : <Button block href={mainWamPath.home}>Selesai</Button>}
    </ActionBar>
    <ContactSheet open={contactOpen} onClose={() => setContactOpen(false)} contact={contact} />
  </div>;
}

/** A02 offline: the scan is kept on the phone and goes out with its time when there is signal. */
export function OfflineSaved({ title, scannedAt, now }: { title: string; scannedAt: string; now?: Date }) {
  return <div className={css.fill}>
    <AbsenQueue />
    <ScreenContent>
      <Result icon={<CloudOff />} tone="warning" title="Absen tersimpan" sub={[title, clockWhen(scannedAt, now ?? new Date())].filter(Boolean).join(" · ")} body="Dikirim otomatis saat ada sinyal." />
    </ScreenContent>
    <ActionBar><Button block href={mainWamPath.home}>Selesai</Button></ActionBar>
  </div>;
}

type State = { kind: "kirim" } | { kind: "hasil"; outcome: CheckInOutcome } | { kind: "tersimpan"; at: string } | { kind: "gagal"; message: string };

/**
 * What a session's printed QR opens (A02–A04): the check-in is sent from the screen (a POST, never
 * on page load, so a prefetch can never record anyone), then its answer shows. No signal: the scan
 * is kept with its time (A02 offline).
 */
export function CheckIn({ token, contact }: { token: string; contact: PanitiaContact | null }) {
  const [state, setState] = useState<State>({ kind: "kirim" });
  const started = useRef(false);

  async function send() {
    setState({ kind: "kirim" });
    const at = new Date().toISOString();
    if (!navigator.onLine) { enqueueScan({ token, scannedAt: at, title: "" }); setState({ kind: "tersimpan", at }); return; }
    try {
      setState({ kind: "hasil", outcome: await sendScan(token) });
    } catch (error) {
      if (error instanceof ModulError && error.offline) { enqueueScan({ token, scannedAt: at, title: "" }); setState({ kind: "tersimpan", at }); return; }
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
      <ScreenContent><Result icon={<QrCode />} title="Absen belum terkirim" body={state.message} /></ScreenContent>
      <ActionBar><Button block onClick={() => void send()}>Coba lagi</Button></ActionBar>
    </div>;
  }
  return <ScreenContent>
    <SkeletonGroup label="Mencatat absen" className={css.result}>
      <Spinner />
      <p className={css.resultBody}>Mencatat absen…</p>
    </SkeletonGroup>
  </ScreenContent>;
}
