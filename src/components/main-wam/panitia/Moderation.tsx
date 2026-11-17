"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff, Image as ImageIcon, ShieldAlert, Trash2 } from "lucide-react";
import { ScreenContent, Stack } from "@/components/main-wam/shell";
import { Banner, Button, Card, ConfirmDialog, PhotoFill, Pill, Segmented, Sheet, StatusPill, useToast } from "@/components/main-wam/ui";
import { dayClock } from "@/lib/main-wam/panitia/format";
import { ownerLine, type ModerationCard } from "@/lib/main-wam/panitia/moderation";
import { mainWamPath } from "@/lib/routes";
import type { ModerationData } from "@/lib/server/main-wam/panitia/moderation";
import { errorText, PanitiaError, useLiveRefresh, useOnline, usePanitiaApi, useServerState } from "./api";
import { EmptyBlock } from "./parts";
import css from "./panitia.module.css";

type Tab = "dilaporkan" | "disembunyikan";
type Pending = { kind: "sembunyikan" | "hapus"; card: ModerationCard } | null;

/**
 * K08 Moderasi Momen: Dilaporkan (photos with a report panitia have not decided on: Sembunyikan,
 * Tampilkan lagi) and Disembunyikan (Tampilkan lagi, Hapus). Sembunyikan and Hapus ask first; the
 * uploader is told, reporters are never named. Tapping a photo shows it larger in a sheet.
 */
export function Moderation(props: ModerationData & { tab?: Tab }) {
  const api = usePanitiaApi();
  const toast = useToast();
  const online = useOnline();
  const [reported, setReported] = useServerState(props.reported);
  const [hidden, setHidden] = useServerState(props.hidden);
  const [tab, setTab] = useState<Tab>(props.tab ?? "dilaporkan");
  const [pending, setPending] = useState<Pending>(null);
  const [viewing, setViewing] = useState<ModerationCard | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const now = useMemo(() => new Date(props.now), [props.now]);
  useLiveRefresh(api.refresh, 60_000, pending !== null || viewing !== null || busy !== null);

  function switchTab(next: Tab) {
    setTab(next);
    // The address follows (a link from Beranda opens the same tab), without a navigation.
    window.history.replaceState(window.history.state, "", mainWamPath.moderation(next));
  }

  async function decide(card: ModerationCard, action: "sembunyikan" | "tampilkan" | "hapus") {
    if (busy) return;
    setBusy(card.id);
    try {
      await api.moderate(card.id, { action, from: card.status });
      setReported(current => current.filter(item => item.id !== card.id));
      if (action === "sembunyikan") setHidden(current => [{ ...card, status: "disembunyikan", hiddenAt: new Date().toISOString(), hiddenBy: null }, ...current]);
      else setHidden(current => current.filter(item => item.id !== card.id));
      toast.show({ text: action === "sembunyikan" ? "Foto disembunyikan" : action === "hapus" ? "Foto dihapus" : "Foto tampil lagi", tone: "success" });
      api.refresh();
    } catch (error) {
      toast.show({ text: errorText(error), tone: "error" });
      if (error instanceof PanitiaError && (error.status === 409 || error.status === 404)) api.refresh();
    } finally { setBusy(null); setPending(null); }
  }

  const list = tab === "dilaporkan" ? reported : hidden;
  return <ScreenContent>
    {!online && <Banner tone="offline" title="Tidak ada koneksi">Daftar mungkin belum yang terbaru.</Banner>}
    {!props.migrated && <Banner tone="info" title="Menunggu pembaruan sistem">Moderasi aktif setelah pembaruan sistem dijalankan.</Banner>}
    <Segmented<Tab> label="Tampilkan" value={tab} onChange={switchTab}
      options={[{ value: "dilaporkan", label: `Dilaporkan (${reported.length})` }, { value: "disembunyikan", label: `Disembunyikan (${hidden.length})` }]} />
    {list.length === 0
      ? tab === "dilaporkan" ? <EmptyBlock icon={<ShieldAlert />} title="Tidak ada laporan." /> : <EmptyBlock icon={<EyeOff />} title="Tidak ada foto yang disembunyikan." />
      : <Stack>
        {list.map(card => <ReportCard key={card.id} card={card} now={now} busy={busy === card.id} disabled={busy !== null && busy !== card.id}
          onView={() => setViewing(card)}
          onHide={() => setPending({ kind: "sembunyikan", card })}
          onShow={() => decide(card, "tampilkan")}
          onDelete={() => setPending({ kind: "hapus", card })} />)}
      </Stack>}

    <ConfirmDialog open={pending?.kind === "sembunyikan"} onCancel={() => setPending(null)} onConfirm={() => pending && decide(pending.card, "sembunyikan")} busy={busy !== null} busyLabel="Menyembunyikan…"
      tone="danger" icon={EyeOff} title="Sembunyikan foto ini?" body="Pengunggah diberi kabar." confirmLabel="Sembunyikan" />
    <ConfirmDialog open={pending?.kind === "hapus"} onCancel={() => setPending(null)} onConfirm={() => pending && decide(pending.card, "hapus")} busy={busy !== null} busyLabel="Menghapus…"
      tone="danger" icon={Trash2} title="Hapus foto ini?" body="Foto hilang untuk semua dan tidak bisa dikembalikan. Pengunggah diberi kabar." confirmLabel="Hapus foto" />
    <Sheet open={viewing !== null} onClose={() => setViewing(null)} title={viewing ? `Foto dari ${viewing.owner}` : "Foto"} subtitle={viewing ? ownerLine(viewing, now) : undefined}>
      {viewing?.large
        // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed storage address, shown as it is
        ? <img className={css.viewer} src={viewing.large} alt={`Foto dari ${viewing.owner}`} />
        : <EmptyBlock icon={<ImageIcon />} title="Foto belum dapat ditampilkan." />}
    </Sheet>
  </ScreenContent>;
}

/** One reported or hidden photo (prototype K08). */
export function ReportCard({ card, now, busy, disabled, onView, onHide, onShow, onDelete }: {
  card: ModerationCard; now: Date; busy?: boolean; disabled?: boolean;
  onView: () => void; onHide: () => void; onShow: () => void; onDelete: () => void;
}) {
  const isHidden = card.status === "disembunyikan";
  return <Card as="article" aria-label={`Foto dari ${card.owner}`}>
    <div className={css.report}>
      <button type="button" className={css.thumb} onClick={onView} aria-label={`Lihat foto dari ${card.owner}`}>
        <PhotoFill photo={card.thumb ? { src: card.thumb, alt: "" } : null} tone={4} />
        {!card.thumb && <ImageIcon className={css.thumbIcon} aria-hidden />}
      </button>
      <div className={css.reportText}>
        <span className={css.reportWho}>{ownerLine(card, now)}</span>
        {isHidden ? <StatusPill status="hidden" /> : card.status === "ditinjau" ? <Pill tone="warning" icon={<EyeOff />}>Disembunyikan</Pill> : <Pill icon={<Eye />}>Masih tampil</Pill>}
        <span className={css.reportCount}>
          <span className={css.reportStrong}>{card.reports} laporan</span>
          {card.reasons.map(reason => <span key={reason} className={css.reportReason}>{reason}</span>)}
        </span>
        {card.notes.map(note => <p key={note} className={css.reportNote}>&ldquo;{note}&rdquo;</p>)}
        {isHidden && card.hiddenAt && <span className={css.reportReason}>{[card.hiddenBy ? `Disembunyikan ${card.hiddenBy}` : "Disembunyikan", dayClock(card.hiddenAt, now)].join(" · ")}</span>}
      </div>
    </div>
    <div className={css.actions}>
      {isHidden
        ? <>
          <Button variant="secondary" size="m" icon={<Eye />} loading={busy} disabled={disabled} onClick={onShow}>Tampilkan lagi</Button>
          <Button variant="danger-outline" size="m" icon={<Trash2 />} disabled={disabled || busy} onClick={onDelete}>Hapus</Button>
        </>
        : <>
          <Button variant="danger-outline" size="m" icon={<EyeOff />} disabled={disabled || busy} onClick={onHide}>Sembunyikan</Button>
          <Button variant="secondary" size="m" icon={<Eye />} loading={busy} disabled={disabled} onClick={onShow}>Tampilkan lagi</Button>
        </>}
    </div>
  </Card>;
}
