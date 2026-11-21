"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardList, Gamepad2, ListChecks, Lock, Printer, QrCode, RefreshCw, Trophy, UserCheck } from "lucide-react";
import { useKnown, useLang, useT } from "@/components/main-wam/i18n";
import { Banner, Button, ConfirmDialog, Pill, ProgressBar, Sheet, StatusPill, useToast } from "@/components/main-wam/ui";
import type { CeklisBlock } from "@/lib/main-wam/ceklis/ceklis";
import type { AbsenCard } from "@/lib/main-wam/modul/absen";
import { presentLabel } from "@/lib/main-wam/modul/absen";
import type { PanitiaContact } from "@/lib/main-wam/modul/contact";
import { openPill } from "@/lib/main-wam/modul/silent";
import { number } from "@/lib/main-wam/i18n";
import { mainWamApi, mainWamPath } from "@/lib/routes";
import { ContactSheet } from "./ContactSheet";
import { errorText, modulRequest } from "./request";
import { AbsenQueue } from "./absen/AbsenQueue";
import css from "./modul.module.css";

/** What SessionAbsen draws (computed on the server, SessionModule.tsx). */
export type AbsenSlot =
  | Exclude<AbsenCard, { kind: "terlewat" }>
  | { kind: "terlewat"; contact: PanitiaContact | null }
  | { kind: "bod"; present: number; expected: number }
  /** Module Ceklis: absen is open but a checklist that must be finished first is not (the lock and the way to it). */
  | { kind: "ceklis"; block: CeklisBlock };

/** What SessionModuleAction draws. */
export type ModuleSlot = {
  action:
    | { kind: "silent-buka"; href: string; closesAt: string | null }
    | { kind: "silent-tutup"; href: string }
    | { kind: "link"; label: string; href: string; icon: "lock" | "trophy" | "survei" | "kuis"; primary?: boolean }
    | null;
  /** Panitia: the session's QR to print or show. */
  qr: { sessionId: string } | null;
};

const ICONS = { lock: Lock, trophy: Trophy, survei: ClipboardList, kuis: Gamepad2 } as const;

/** SessionAbsen's look (P04 + P04__status; Beranda's Sekarang card gets only the open state's button). */
export function AbsenView({ slot, home }: { slot: AbsenSlot; /** On Beranda's Sekarang card: the gold button is "Absen sekarang" and sits beside "Wajib absen", not full width. */ home?: boolean }) {
  const t = useT();
  const { lang } = useLang();
  const [contactOpen, setContactOpen] = useState(false);
  switch (slot.kind) {
    case "none": return null;
    case "buka": return <>
      <AbsenQueue />
      <Button block={!home} icon={<QrCode />} href={mainWamPath.scan}>{home ? t("peserta.now.absenNow") : t("absen.button")}</Button>
    </>;
    // The gate (prototipe .box.gold): the lock, and the sentence naming the checklist that opens it.
    case "ceklis": return <div className={css.gate}>
      <span className={css.gateLabel}><QrCode aria-hidden />{t("peserta.agenda.absen")}</span>
      <Button block icon={<Lock />} disabled>{t("absen.ceklisFirst")}</Button>
      <p className={css.gateInfo}>
        <ListChecks aria-hidden />
        <span>{t("absen.ceklisBody", { title: slot.block.title, done: slot.block.done, total: slot.block.total })} <Link className={css.gateLink} href={mainWamPath.session(slot.block.sessionId)}>{t("absen.ceklisOpen")}</Link></span>
      </p>
    </div>;
    case "hadir": return <div className={css.pills}><StatusPill status="present">{presentLabel(slot.at, lang)}</StatusPill></div>;
    case "terlewat": return <>
      <Banner tone="warning" title={t("absen.missed")} action={{ label: t("absen.contactTitle"), onClick: () => setContactOpen(true) }} />
      <ContactSheet open={contactOpen} onClose={() => setContactOpen(false)} contact={slot.contact} />
    </>;
    case "bod": {
      const percent = slot.expected ? Math.round((slot.present / slot.expected) * 100) : 0;
      return <ProgressBar icon={<UserCheck />} label={t("absen.presentOf", { present: number(lang, slot.present), expected: number(lang, slot.expected) })}
        value={slot.present} max={Math.max(slot.expected, 1)} valueText={`${percent}%`} />;
    }
  }
}

/** SessionModuleAction's look: the module's one action, and panitia's QR. */
export function ModuleActionView({ slot }: { slot: ModuleSlot }) {
  const t = useT();
  const { lang } = useLang();
  const known = useKnown();
  const { action, qr } = slot;
  if (!action && !qr) return null;
  return <div className={css.slot}>
    {action?.kind === "silent-buka" && <>
      <div className={css.pills}><Pill icon={<Lock />}>{openPill({ closesAt: action.closesAt }, lang)}</Pill></div>
      <Button block icon={<Lock />} href={action.href}>{t("silent.send")}</Button>
    </>}
    {action?.kind === "silent-tutup" && <Button block variant="secondary" href={action.href}>{t("silent.closed")}</Button>}
    {action?.kind === "link" && (() => {
      const Icon = ICONS[action.icon];
      return <Button block variant={action.primary ? "primary" : "secondary"} icon={<Icon />} href={action.href}>{known(action.label)}</Button>;
    })()}
    {qr && <PanitiaQr sessionId={qr.sessionId} />}
  </div>;
}

/** Panitia: the session's QR on an A5 page (print it, or show it on a screen), and a new one when needed. */
export function PanitiaQr({ sessionId, initialOpen = false }: { sessionId: string; initialOpen?: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(initialOpen);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  async function renew() {
    setBusy(true);
    try {
      const { message } = await modulRequest(mainWamApi.sessionQr(sessionId), { method: "POST", json: {} });
      toast.show({ text: message || "QR baru dibuat.", tone: "success" });
      setConfirm(false);
    } catch (problem) {
      toast.show({ text: errorText(problem), tone: "error" });
      setConfirm(false);
    } finally { setBusy(false); }
  }
  return <>
    <Button block variant="secondary" icon={<QrCode />} onClick={() => setOpen(true)}>QR absen</Button>
    <Sheet open={open} onClose={() => setOpen(false)} title="QR absen" subtitle="Cetak atau tayangkan di pintu ruang. QR tetap sama walau jam sesi berubah."
      footer={<div className={css.stackActions}>
        <Button block icon={<Printer />} href={mainWamApi.sessionQr(sessionId)} external>Buka QR</Button>
        <Button block variant="danger-text" icon={<RefreshCw />} onClick={() => setConfirm(true)}>Buat QR baru</Button>
      </div>}>
      <p className={css.cardNote}>Peserta memindai QR ini dengan kamera HP atau menu Absen. Absen dibuka 30 menit sebelum mulai sampai 30 menit setelah selesai.</p>
    </Sheet>
    <ConfirmDialog open={confirm} tone="danger" icon={<RefreshCw />} title="Buat QR baru?" body="QR lama yang sudah dicetak tidak berlaku lagi."
      confirmLabel="Buat QR baru" busy={busy} busyLabel="Membuat…" onCancel={() => setConfirm(false)} onConfirm={() => void renew()} />
  </>;
}

