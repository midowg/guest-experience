"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Bell, BellOff, CalendarClock, CircleCheck, ClipboardList, Heart, Hourglass, KeyRound, Lock, Megaphone, Trophy, type LucideIcon } from "lucide-react";
import { noteHash, type NotificationRow } from "@/lib/main-wam/peserta/notifications";
import type { NoteKind } from "@/lib/main-wam/types";
import { mainWamApi, mainWamPath } from "@/lib/routes";
import { ScreenContent, ScreenSection } from "@/components/main-wam/shell";
import { Banner, EmptyState, IconBox, List, Sheet, type IconBoxTone } from "@/components/main-wam/ui";
import { mwRequest } from "../request";
import { usePushDevice, type PushState } from "../usePushDevice";
import css from "../peserta.module.css";

const ICON: Record<NoteKind, LucideIcon> = {
  pengumuman: Megaphone, jadwal: CalendarClock, absen: CircleCheck, momen: Heart, kamar: KeyRound, silent: Lock, voting: Trophy, survei: ClipboardList, lain: Bell,
};
const TONE: Partial<Record<NoteKind, IconBoxTone>> = { jadwal: "warning", absen: "success" };

const subscribeHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => { window.removeEventListener("hashchange", onChange); window.removeEventListener("popstate", onChange); };
};
const readHash = () => decodeURIComponent(window.location.hash.slice(1));

/**
 * Notifikasi (N01, revisi 16 Nov): Hari ini and Sebelumnya, one line per note (unread: a dot and
 * bold). A tap opens where it points; a panitia's announcement opens in a sheet with its full text,
 * which has its own address (#kabar-<id>, so Beranda's pinned banner opens it and Back closes it).
 * Opening the screen marks everything read; the bell's count follows on the next refresh.
 */
export function NotificationsScreen({ migrated, today, earlier, unread, preview }: {
  migrated: boolean; today: NotificationRow[]; earlier: NotificationRow[]; unread: number;
  /** Previews: no request, the push state fixed, a note opened. */
  preview?: { push?: PushState; open?: string };
}) {
  const router = useRouter();
  const push = usePushDevice({ preview: preview ? preview.push ?? "on" : undefined });
  const hash = useSyncExternalStore(subscribeHash, readHash, () => (preview?.open ? noteHash(preview.open) : ""));
  const all = [...today, ...earlier];
  const opened = all.find(row => noteHash(row.id) === (hash || (preview?.open ? noteHash(preview.open) : ""))) ?? null;

  useEffect(() => {
    if (preview || !migrated || unread === 0) return;
    // Read: after a moment, so the dots are seen first.
    const timer = window.setTimeout(() => {
      mwRequest(mainWamApi.notifications, { method: "POST", json: {} }).then(() => router.refresh()).catch(() => undefined);
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [preview, migrated, unread, router]);

  const show = useCallback((id: string) => {
    window.history.pushState({ ...window.history.state, mwHashSheet: noteHash(id) }, "", `#${noteHash(id)}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, []);
  const close = useCallback(() => {
    if (!readHash()) return;
    if (window.history.state?.mwHashSheet === readHash()) window.history.back();
    else { window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search); window.dispatchEvent(new HashChangeEvent("hashchange")); }
  }, []);

  const pushOff = push.state === "off" || push.state === "denied" || push.state === "ios-install";
  const group = (title: string, rows: NotificationRow[]) => rows.length > 0 && <ScreenSection key={title}>
    <h2 className={css.groupHead}>{title}</h2>
    <List>
      {rows.map(row => {
        const Icon = ICON[row.kind];
        const inner = <>
          {row.unread && <span className={css.notifDot} role="img" aria-label="Belum dibaca" />}
          <IconBox icon={<Icon />} tone={TONE[row.kind]} smallIcon />
          <span className={css.notifText}><span className={css.notifTitle}>{row.title}</span><span className={css.notifTime}>{row.time}</span></span>
        </>;
        const className = `${css.notifRow} ${row.unread ? css.notifUnread : ""}`;
        return row.href
          ? <Link key={row.id} href={row.href} className={className}>{inner}</Link>
          : <button key={row.id} type="button" className={className} onClick={() => show(row.id)} aria-haspopup="dialog">{inner}</button>;
      })}
    </List>
  </ScreenSection>;

  return <ScreenContent>
    {pushOff && <Banner tone="warning" icon={<BellOff />} title="Notifikasi di HP mati" action={{ label: "Aktifkan", onClick: () => router.push(mainWamPath.settings) }} />}
    {!migrated && !all.length
      ? <EmptyState size="s" icon={<Hourglass />} title="Menunggu pembaruan sistem">Notifikasi acara tampil setelah pembaruan selesai.</EmptyState>
      : !all.length
        ? <EmptyState size="s" icon={<Bell />} title="Belum ada notifikasi" />
        : <>{group("Hari ini", today)}{group("Sebelumnya", earlier)}</>}
    <Sheet open={!!opened} onClose={close} history={false} title={opened?.title ?? ""}>
      {opened && <div className={css.sheetStack}>
        <p className={css.sheetMeta}>{opened.meta}</p>
        {opened.body && <p className={css.text}>{opened.body}</p>}
      </div>}
    </Sheet>
  </ScreenContent>;
}
