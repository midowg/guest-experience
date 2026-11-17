"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff, Image as ImageIcon, ShieldAlert, Trash2 } from "lucide-react";
import { ScreenContent, Stack } from "@/components/main-wam/shell";
import { Banner, Button, Card, ChipRow, FilterChip, PhotoFill, Pill, Segmented, Sheet, StatusPill, TextField, useToast } from "@/components/main-wam/ui";
import { hiddenLine, moderationReason, moderationReasonLabels, ownerLine, type ModerationCard } from "@/lib/main-wam/panitia/moderation";
import { MODERATION_NOTE_MAX, MODERATION_REASONS, type ModerationReason } from "@/lib/main-wam/panitia/schemas";
import { mainWamPath } from "@/lib/routes";
import type { ModerationData } from "@/lib/server/main-wam/panitia/moderation";
import { errorText, PanitiaError, useLiveRefresh, useOnline, usePanitiaApi, useServerState } from "./api";
import { EmptyBlock } from "./parts";
import css from "./panitia.module.css";

type Tab = "dilaporkan" | "disembunyikan";
type Asking = "sembunyikan" | "hapus";
type Why = { reason: ModerationReason | null; note: string };

/**
 * K08 Moderasi Momen: Dilaporkan (photos with a report panitia have not decided on: Sembunyikan,
 * Tampilkan lagi) and Disembunyikan (Tampilkan lagi, Hapus). Sembunyikan and Hapus ask first, with an
 * optional short reason (a quick choice and/or a note) that only panitia see (audit L8); the uploader
 * is told in fixed words, reporters are never named. Tapping a photo shows it larger in a sheet.
 */
export function Moderation(props: ModerationData & { tab?: Tab }) {
  const api = usePanitiaApi();
  const toast = useToast();
  const online = useOnline();
  const [reported, setReported] = useServerState(props.reported);
  const [hidden, setHidden] = useServerState(props.hidden);
  const [tab, setTab] = useState<Tab>(props.tab ?? "dilaporkan");
  // The decision being asked (the sheet stays mounted with its last card, so focus goes back on close).
  const [asking, setAsking] = useState<Asking | null>(null);
  const [subject, setSubject] = useState<ModerationCard | null>(null);
  const [why, setWhy] = useState<Why>({ reason: null, note: "" });
  const [viewing, setViewing] = useState<ModerationCard | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const now = useMemo(() => new Date(props.now), [props.now]);
  useLiveRefresh(api.refresh, 60_000, asking !== null || viewing !== null || busy !== null);
  const ask = (kind: Asking, card: ModerationCard) => { setSubject(card); setWhy({ reason: null, note: "" }); setAsking(kind); };

  function switchTab(next: Tab) {
    setTab(next);
    // The address follows (a link from Beranda opens the same tab), without a navigation.
    window.history.replaceState(window.history.state, "", mainWamPath.moderation(next));
  }

  async function decide(card: ModerationCard, action: "sembunyikan" | "tampilkan" | "hapus", given?: Why) {
    if (busy) return;
    setBusy(card.id);
    try {
      const note = given?.note.trim() ?? "";
      await api.moderate(card.id, action === "tampilkan" || !given ? { action, from: card.status } : { action, from: card.status, reason: given.reason, note });
      setReported(current => current.filter(item => item.id !== card.id));
      if (action === "sembunyikan") {
        setHidden(current => [{ ...card, status: "disembunyikan", hiddenAt: new Date().toISOString(), hiddenBy: null, hiddenReason: moderationReason(given?.reason, note) }, ...current]);
      }
      else setHidden(current => current.filter(item => item.id !== card.id));
      toast.show({ text: action === "sembunyikan" ? "Foto disembunyikan" : action === "hapus" ? "Foto dihapus" : "Foto tampil lagi", tone: "success" });
      api.refresh();
    } catch (error) {
      toast.show({ text: errorText(error), tone: "error" });
      if (error instanceof PanitiaError && (error.status === 409 || error.status === 404)) api.refresh();
    } finally { setBusy(null); setAsking(null); }
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
          onHide={() => ask("sembunyikan", card)}
          onShow={() => decide(card, "tampilkan")}
          onDelete={() => ask("hapus", card)} />)}
      </Stack>}

    <Sheet open={asking !== null && subject !== null} onClose={() => setAsking(null)} locked={busy !== null}
      title={asking === "hapus" ? "Hapus foto ini?" : "Sembunyikan foto ini?"}
      subtitle={asking === "hapus" ? "Foto hilang untuk semua dan tidak bisa dikembalikan. Pengunggah diberi kabar." : "Pengunggah diberi kabar dengan alasan: Ada rekan yang tidak setuju."}
      footer={<>
        <Button block variant="danger" icon={asking === "hapus" ? <Trash2 /> : <EyeOff />} loading={busy !== null} loadingLabel={asking === "hapus" ? "Menghapus…" : "Menyembunyikan…"}
          onClick={() => subject && asking && decide(subject, asking, why)}>{asking === "hapus" ? "Hapus foto" : "Sembunyikan"}</Button>
        <Button block variant="text" onClick={() => setAsking(null)} disabled={busy !== null}>Batal</Button>
      </>}>
      <div className={css.sheetBody}>
        <div className={css.group}>
          <span className={css.groupLabel} aria-hidden>Alasan<span className={css.optional}> (opsional)</span></span>
          <ChipRow label="Alasan (opsional)">
            {MODERATION_REASONS.map(reason => <FilterChip key={reason} selected={why.reason === reason}
              onClick={() => setWhy(current => ({ ...current, reason: current.reason === reason ? null : reason }))}>{moderationReasonLabels[reason]}</FilterChip>)}
          </ChipRow>
        </div>
        <TextField label="Catatan" optional help="Hanya panitia yang melihat." value={why.note} maxLength={MODERATION_NOTE_MAX} showCount
          onChange={event => setWhy(current => ({ ...current, note: event.target.value }))} autoComplete="off" />
      </div>
    </Sheet>
    <Sheet open={viewing !== null} onClose={() => setViewing(null)} title={viewing ? `Foto dari ${viewing.owner}` : "Foto"} subtitle={viewing ? ownerLine(viewing, now) : undefined}>
      {viewing?.large
        // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed storage address, shown as it is
        ? <img className={css.viewer} src={viewing.large} alt={`Foto dari ${viewing.owner}`} />
        : <EmptyBlock icon={<ImageIcon />} title="Foto belum dapat ditampilkan." level={3} />}
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
        {isHidden && card.hiddenAt && <span className={css.reportReason}>{hiddenLine(card, now)}</span>}
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
