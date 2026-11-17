"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Camera, CircleAlert, Images, Sparkles, Trash2 } from "lucide-react";
import { Panel } from "@/components/app-shell/Panel";
import { useToast } from "@/components/app-shell/Toast";
import { acceptPhotos, encodeWithinLimit, PHOTO_SIDE, sourceProblem, type PhotoMime } from "@/lib/pra-wam/photo";
import type { CardView } from "@/lib/server/pra-wam/cards";
import { errorText } from "./api";
import { useWellbeing } from "./context";
import { Avatar, cx, Sk } from "./parts";
import css from "./wellbeing.module.css";

/*
 * Foto profil (18 Nov 2026): the WAM account's photo, the one WLM, WAM and Booking Kantor all show.
 * The choices, as on a phone: Pakai kartu tokoh WAM (my character card cut to a round photo: the
 * figure on its persona colour, as WAM's "Jadikan foto profil"), Ambil foto (touch screens only),
 * Pilih dari galeri, and Hapus foto. A choice is shown round first (Pratinjau, with the card's
 * rarity colour as its ring) and saved only on "Pakai foto ini".
 */

type Ready = { blob: Blob; mime: PhotoMime; url: string };
type CardState = { state: "idle" | "loading" | "none" } | { state: "error"; text: string } | ({ state: "ready"; card: CardView } & Ready);
type Draft = Ready & { from: "card" | "photo"; ring: string | null; caption: string };
type View = "choose" | "preview" | "remove";

/** My card as a 320 × 320 photo, drawn in the browser (the drawing code loads only now). */
async function cardPhoto(card: CardView): Promise<Ready> {
  const { blobOf, drawAvatar } = await import("@/components/pra-wam/questionnaire/cardArt");
  const canvas = await drawAvatar(card, PHOTO_SIDE);
  const { blob, mime } = await encodeWithinLimit((type, quality) => blobOf(canvas, type, quality));
  return { blob, mime, url: URL.createObjectURL(blob) };
}

/** A picked picture: its middle square at 320 × 320, as small as it needs to be (WAM's own steps). */
async function filePhoto(file: File): Promise<Ready> {
  const { shrink } = await import("@/components/pra-wam/ProfilePhoto");
  const { blob, mime } = await shrink(file);
  return { blob, mime, url: URL.createObjectURL(blob) };
}

const touchScreen = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

export function PhotoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { api, me, setPhoto } = useWellbeing();
  const toast = useToast();
  const [view, setView] = useState<View>("choose");
  const [card, setCard] = useState<CardState>({ state: "idle" });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<{ text: string; progress?: number } | null>(null);
  const [problem, setProblem] = useState("");
  const gallery = useRef<HTMLInputElement>(null);
  const shoot = useRef<HTMLInputElement>(null);
  const cardUrl = card.state === "ready" ? card.url : null;
  const draftUrl = draft?.url ?? null;
  useEffect(() => () => { if (cardUrl) URL.revokeObjectURL(cardUrl); }, [cardUrl]);
  useEffect(() => () => { if (draftUrl && draftUrl !== cardUrl) URL.revokeObjectURL(draftUrl); }, [draftUrl, cardUrl]);
  // "Ambil foto" only on a touch screen (the sheet is closed on the server, so no mismatch).
  const camera = open && touchScreen();

  // Closed: back to the choices next time (the card stays ready; a failed one is tried again).
  if (!open && (view !== "choose" || draft || problem)) { setView("choose"); setDraft(null); setProblem(""); }
  if (!open && card.state === "error") setCard({ state: "idle" });
  // Opened: my card, asked for once and drawn once.
  if (open && card.state === "idle") setCard({ state: "loading" });
  useEffect(() => {
    if (card.state !== "loading") return;
    let live = true;
    void (async () => {
      try {
        const found = await api.myCard();
        if (!found) { if (live) setCard({ state: "none" }); return; }
        const ready = await cardPhoto(found);
        if (live) setCard({ state: "ready", card: found, ...ready }); else URL.revokeObjectURL(ready.url);
      } catch (error) {
        if (live) setCard({ state: "error", text: errorText(error) });
      }
    })();
    return () => { live = false; };
  }, [card.state, api]);

  function chooseCard() {
    if (card.state !== "ready") return;
    const rarity = card.card.tier.name;
    setDraft({ blob: card.blob, mime: card.mime, url: card.url, from: "card", ring: card.card.tier.color,
      caption: `Kartu tokohmu: ${card.card.figure?.name ?? card.card.character.name} · ${rarity}. Dipotong bulat dari kartu, dengan warna personamu.` });
    setProblem(""); setView("preview");
  }

  async function picked(file: File | undefined) {
    if (gallery.current) gallery.current.value = "";
    if (shoot.current) shoot.current.value = "";
    if (!file) return;
    const wrong = sourceProblem(file);
    if (wrong) { setProblem(wrong); return; }
    setProblem(""); setBusy({ text: "Memperkecil foto…" });
    try {
      const ready = await filePhoto(file);
      setDraft({ ...ready, from: "photo", ring: null, caption: "Fotomu, dipotong persegi di bagian tengah." });
      setView("preview");
    } catch (error) {
      setProblem(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!draft || busy) return;
    setProblem(""); setBusy({ text: "Mengunggah foto…", progress: 0 });
    try {
      const address = await api.savePhoto(draft.blob, draft.mime, share => setBusy({ text: share < 1 ? "Mengunggah foto…" : "Menyimpan foto…", progress: share }));
      setPhoto(address);
      toast({ message: draft.from === "card" ? "Foto profilmu sekarang kartu tokohmu." : "Foto profil diganti.", tone: "ok" });
      onClose();
    } catch (error) {
      setProblem(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (busy) return;
    setProblem(""); setBusy({ text: "Menghapus foto…" });
    try {
      await api.removePhoto();
      setPhoto(null);
      toast({ message: "Foto profil dihapus.", tone: "ok" });
      onClose();
    } catch (error) {
      setProblem(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  const footer = view === "preview"
    ? <div className={css.btnRow}>
        <button type="button" className={cx(css.btn, css.btnOutline)} disabled={!!busy} onClick={() => { setView("choose"); setDraft(null); setProblem(""); }}>{draft?.from === "card" ? "Kembali" : "Pilih lagi"}</button>
        <button type="button" className={cx(css.btn, css.btnPrimary)} aria-busy={!!busy} disabled={!!busy} onClick={() => void save()}>
          {busy ? <span className={css.spin} aria-hidden="true" /> : null}Pakai foto ini</button>
      </div>
    : view === "remove"
      ? <div className={css.btnRow}>
          <button type="button" className={cx(css.btn, css.btnOutline)} disabled={!!busy} onClick={() => setView("choose")}>Batal</button>
          <button type="button" className={cx(css.btn, css.btnDanger)} aria-busy={!!busy} disabled={!!busy} onClick={() => void remove()}>
            {busy ? <span className={css.spin} aria-hidden="true" /> : <Trash2 size={20} aria-hidden="true" />}Hapus foto</button>
        </div>
      : undefined;

  return <Panel open={open} onClose={onClose} locked={!!busy} variant="sheet"
    title={view === "preview" ? "Pratinjau foto profil" : view === "remove" ? "Hapus foto profil?" : "Foto profil"} footer={footer}>
    {view === "preview" && draft ? <div className={css.photoPreview}>
      <span className={css.photoBig} data-ring={draft.ring ? "true" : undefined} style={draft.ring ? { "--ring": draft.ring } as CSSProperties : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a picture made in this browser */}
        <img src={draft.url} alt="Pratinjau foto profil" />
      </span>
      <p className={cx(css.muted, css.center)}>{draft.caption}</p>
      <p className={cx(css.caption, css.faint, css.center)}>Tampil di WLM, WAM, dan Booking Kantor.</p>
    </div>
    : view === "remove" ? <p className={css.muted}>Foto dihapus dari akun WAM-mu. Inisial namamu tampil sebagai gantinya di WLM, WAM, dan Booking Kantor.</p>
    : <>
      <div className={css.photoPreview}>
        <Avatar name={me.name} photo={me.photo} size="xl" />
        <p className={cx(css.caption, css.faint, css.center)}>Satu foto untuk WLM, WAM, dan Booking Kantor.</p>
      </div>
      <div className={cx(css.card, css.list)}>
        <button type="button" className={cx(css.row, css.pressable)} disabled={card.state !== "ready" || !!busy} onClick={chooseCard}
          aria-label={card.state === "ready" ? `Pakai kartu tokoh WAM: ${card.card.figure?.name ?? card.card.character.name}, ${card.card.tier.name}` : undefined}>
          {card.state === "ready"
            // eslint-disable-next-line @next/next/no-img-element -- a picture made in this browser
            ? <span className={css.cardThumb} style={{ "--ring": card.card.tier.color } as CSSProperties}><img src={card.url} alt="" /></span>
            : card.state === "loading" || card.state === "idle" ? <Sk width={44} height={44} radius={22} />
            : <span className={cx(css.lead, css.tonePrimary)}><Sparkles size={22} aria-hidden="true" /></span>}
          <span className={css.rowMain}>
            <span className={css.rowTitle}>Pakai kartu tokoh WAM</span>
            <span className={css.rowMeta}>{card.state === "ready" ? `${card.card.figure?.name ?? card.card.character.name} · ${card.card.tier.name}`
              : card.state === "none" ? "Belum ada kartu. Selesaikan kuesioner WAM dulu."
              : card.state === "error" ? card.text : "Menyiapkan kartumu…"}</span>
          </span>
        </button>
        {camera && <button type="button" className={cx(css.row, css.pressable)} disabled={!!busy} onClick={() => shoot.current?.click()}>
          <span className={cx(css.lead, css.tonePrimary)}><Camera size={22} aria-hidden="true" /></span>
          <span className={css.rowMain}><span className={css.rowTitle}>Ambil foto</span><span className={css.rowMeta}>Pakai kamera depan</span></span>
        </button>}
        <button type="button" className={cx(css.row, css.pressable)} disabled={!!busy} onClick={() => gallery.current?.click()}>
          <span className={cx(css.lead, css.tonePrimary)}><Images size={22} aria-hidden="true" /></span>
          <span className={css.rowMain}><span className={css.rowTitle}>Pilih dari galeri</span><span className={css.rowMeta}>JPG, PNG, WebP, atau HEIC</span></span>
        </button>
        {me.photo && <button type="button" className={cx(css.row, css.pressable, css.rowDanger)} disabled={!!busy} onClick={() => { setProblem(""); setView("remove"); }}>
          <span className={cx(css.lead, css.toneError)}><Trash2 size={22} aria-hidden="true" /></span>
          <span className={css.rowMain}><span className={css.rowTitle}>Hapus foto</span></span>
        </button>}
      </div>
      <input ref={gallery} type="file" accept={acceptPhotos} hidden onChange={event => void picked(event.target.files?.[0])} />
      <input ref={shoot} type="file" accept="image/*" capture="user" hidden onChange={event => void picked(event.target.files?.[0])} />
    </>}
    {busy && <p className={cx(css.caption, css.muted, css.center)} role="status" style={{ marginTop: 12 }}>
      {busy.text}{busy.progress != null && busy.progress < 1 ? ` ${Math.round(busy.progress * 100)}%` : ""}</p>}
    {problem && <div className={cx(css.note, css.noteErr)} role="alert" style={{ marginTop: 12 }}><CircleAlert size={20} aria-hidden="true" /><span>{problem}</span></div>}
  </Panel>;
}
