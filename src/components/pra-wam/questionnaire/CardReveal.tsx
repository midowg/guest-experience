"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Download, ImageIcon, RotateCcw, Share2, Smartphone, UserRound, X } from "lucide-react";
import { oddsLabel, serialLabel } from "@/lib/pra-wam/cards";
import { encodeWithinLimit, PHOTO_SIDE } from "@/lib/pra-wam/photo";
import type { CardView } from "@/lib/server/pra-wam/cards";
import { praWamApi } from "@/lib/routes";
import { errorText, praWamRequest } from "../api";
import { useConfirm } from "../ConfirmDialog";
import { uploadProfilePhoto } from "../photoUpload";
import { blobOf, drawAvatar, drawBack, drawFront, drawWallpaper } from "./cardArt";
import styles from "./card.module.css";

/*
 * The character card at the end of the questionnaire (mockup "Cerita Kita"): "Kartumu sedang
 * dicetak" while the server draws it (once; asking again returns the same card), the back of the
 * card to tap, the flip with confetti, then the level, the actions (profile photo, save the card,
 * wallpaper) and what the card says. Opening it once is remembered on this device, so coming
 * back shows it open.
 */

type Phase = { kind: "printing"; step: number } | { kind: "closed" } | { kind: "opening" } | { kind: "open" } | { kind: "error"; text: string };
type Saved = { url: string; blob: Blob; filename: string; caption: string; tall?: boolean };

const openedKey = (formId: string) => `wam-cq-card-open:${formId}`;
const remembered = (formId: string) => { try { return window.localStorage.getItem(openedKey(formId)) === "1"; } catch { return false; } };
const remember = (formId: string) => { try { window.localStorage.setItem(openedKey(formId), "1"); } catch { /* only a convenience */ } };
const reducedMotion = () => typeof window === "undefined" || typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, reducedMotion() ? 0 : ms));
const buzz = (pattern: number | number[]) => { try { navigator.vibrate?.(pattern); } catch { /* not on this phone */ } };
const STEPS = ["Membaca jawabanmu", "Mencocokkan tokoh", "Mengundi rarity"];

/**
 * The opened card tilts with a finger (or the phone, after it asks on iOS), with a shine and,
 * from Rare up, a holo layer, and the picture moves a little (handoff 12 Nov 2026, approved by
 * Hanung). Off under reduced motion. Writes only CSS variables on the card, never React state.
 */
function useTilt(open: boolean) {
  const flip = useRef<HTMLDivElement>(null);
  const isOpen = useRef(open);
  // The phone's motion listener and its idle timer, removed when the card goes.
  const motion = useRef<{ move: (event: DeviceOrientationEvent) => void; idle: number } | null>(null);
  useEffect(() => { isOpen.current = open; }, [open]);
  const set = useCallback((x: number, y: number) => {
    const element = flip.current;
    // Only an open card tilts: after "Ulangi animasi" the closed card stays still and flips with its own easing.
    if (!element || !isOpen.current || reducedMotion()) return;
    const tx = Math.max(-1, Math.min(1, x)), ty = Math.max(-1, Math.min(1, y));
    element.style.setProperty("--ry", `${(tx * 16).toFixed(2)}deg`); element.style.setProperty("--rx", `${(ty * 12).toFixed(2)}deg`);
    element.style.setProperty("--sx", `${(50 + tx * 45).toFixed(1)}%`); element.style.setProperty("--sy", `${(50 + ty * 45).toFixed(1)}%`);
    element.style.setProperty("--px", `${(tx * -9).toFixed(1)}px`); element.style.setProperty("--py", `${(ty * -9).toFixed(1)}px`);
    element.dataset.tilt = "1";
  }, []);
  const reset = useCallback(() => {
    const element = flip.current;
    if (!element) return;
    delete element.dataset.tilt;
    for (const name of ["--ry", "--rx", "--sx", "--sy", "--px", "--py"]) element.style.removeProperty(name);
  }, []);
  useEffect(() => { if (!open) reset(); }, [open, reset]);
  useEffect(() => () => {
    if (!motion.current) return;
    window.removeEventListener("deviceorientation", motion.current.move);
    window.clearTimeout(motion.current.idle);
    motion.current = null;
  }, []);
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!open) return;
    const box = event.currentTarget.getBoundingClientRect();
    set(((event.clientX - box.left) / box.width) * 2 - 1, ((event.clientY - box.top) / box.height) * 2 - 1);
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => { if (event.pointerType !== "mouse") reset(); };
  /** The phone's motion: on iOS only after a tap asks for it. */
  const listen = useCallback(async () => {
    if (motion.current || reducedMotion() || typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return;
    const ask = (window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    if (ask) { try { if ((await ask()) !== "granted") return; } catch { return; } }
    if (motion.current) return;
    const state = { idle: 0, move: (event: DeviceOrientationEvent) => {
      if (event.gamma == null || event.beta == null) return;
      set(event.gamma / 25, (event.beta - 50) / 25);
      window.clearTimeout(state.idle); state.idle = window.setTimeout(reset, 4000);
    } };
    motion.current = state;
    window.addEventListener("deviceorientation", state.move);
  }, [reset, set]);
  return { flip, onPointerMove, onPointerLeave: reset, onPointerCancel: reset, onPointerUp, listen };
}

export function CardReveal({ formId, initial, nickname, hasPhoto, settled }: {
  formId: string; initial: CardView | null; nickname: string; hasPhoto: boolean;
  /** Shown without the printing and the flip (the read-only view after the deadline). */
  settled?: boolean;
}) {
  const [card, setCard] = useState<CardView | null>(initial);
  const [phase, setPhase] = useState<Phase>(settled ? { kind: "open" } : { kind: "printing", step: 0 });
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [burst, setBurst] = useState(false);
  const [confirm, confirmElement] = useConfirm();
  const confetti = useRef<HTMLCanvasElement>(null);
  const started = useRef(false);
  const tilt = useTilt(phase.kind === "open");

  // Draw (or fetch) the card, paint both faces, then show the back, or the front if opened before here.
  const prepare = useCallback(async () => {
    setPhase({ kind: "printing", step: 0 });
    try {
      const ticks = (async () => { for (let step = 1; step <= STEPS.length; step++) { await wait(650); setPhase(current => current.kind === "printing" ? { kind: "printing", step } : current); } })();
      const view = initial ?? (await praWamRequest<{ card: CardView }>(praWamApi.questionnaireCard, { method: "POST" })).data.card;
      setCard(view);
      const [face, cover] = await Promise.all([drawFront(view), drawBack(view)]);
      setFront(face.toDataURL("image/png"));
      setBack(cover.toDataURL("image/jpeg", 0.9));
      await ticks; await wait(450);
      setPhase(remembered(formId) ? { kind: "open" } : { kind: "closed" });
    } catch (error) {
      setPhase({ kind: "error", text: errorText(error) });
    }
  }, [formId, initial]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (settled && initial) { void drawFront(initial).then(face => setFront(face.toDataURL("image/png"))).catch(() => undefined); return; }
    // Starts the draw once: its state changes come from the request and the drawing, not this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void prepare();
  }, [initial, prepare, settled]);

  async function reveal() {
    if (!card || phase.kind !== "closed") return;
    setPhase({ kind: "opening" });
    buzz([20, 80, 20, 80, 40]);
    await wait(1300);
    setPhase({ kind: "open" });
    buzz(card.tier.sort >= 3 ? [60, 40, 120] : 60);
    remember(formId);
    await wait(620);
    setBurst(true);
    if (!reducedMotion() && confetti.current) throwConfetti(confetti.current, card.tier.color, card.tier.sort);
  }

  function replay() { setBurst(false); setPhase({ kind: "closed" }); window.scrollTo?.({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" }); }

  async function saveImage(kind: "kartu" | "wallpaper") {
    if (!card) return;
    setBusy(kind); setNote(null);
    try {
      const canvas = kind === "kartu" ? await drawFront(card) : await drawWallpaper(card);
      const blob = await blobOf(canvas);
      if (!blob) throw new Error("Gambar belum dapat dibuat di browser ini.");
      setSaved(kind === "kartu"
        ? { url: URL.createObjectURL(blob), blob, filename: card.figure ? "kartu-tokoh-wam-2026.png" : "kartu-karakter-wam-2026.png", caption: "Kartu 1080 × 1350, siap dibagikan." }
        : { url: URL.createObjectURL(blob), blob, filename: "wallpaper-wam-2026.png", caption: "Wallpaper HP 1080 × 2340. Bagian atas sengaja kosong untuk jam layar kunci.", tall: true });
    } catch (error) {
      setNote({ tone: "error", text: errorText(error) });
    } finally {
      setBusy("");
    }
  }

  async function applyAsPhoto() {
    if (!card) return;
    if (hasPhoto && !(await confirm({ title: "Pakai kartu jadi foto profil?", body: "Foto profilmu sekarang diganti dengan potongan karaktermu. Kamu bisa menggantinya dengan foto biasa kapan saja di Profil.", confirmLabel: "Pakai kartu" }))) return;
    setBusy("foto"); setNote(null);
    try {
      const canvas = await drawAvatar(card, PHOTO_SIDE);
      const { blob, mime } = await encodeWithinLimit((type, quality) => blobOf(canvas, type, quality));
      await uploadProfilePhoto(blob, mime);
      setNote({ tone: "ok", text: "Foto profilmu sekarang kartu karaktermu." });
    } catch (error) {
      setNote({ tone: "error", text: errorText(error) });
    } finally {
      setBusy("");
    }
  }

  const closeSaved = () => { if (saved) URL.revokeObjectURL(saved.url); setSaved(null); };
  const shareable = typeof navigator !== "undefined" && !!saved && typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([saved.blob], saved.filename, { type: "image/png" })] });
  async function share() {
    if (!saved) return;
    try { await navigator.share({ files: [new File([saved.blob], saved.filename, { type: "image/png" })], title: "Kartu karakter WAM 2026" }); } catch { /* closed the share sheet */ }
  }

  if (phase.kind === "error") return <div className={styles.reveal} role="alert">
    <p className={styles.problem}>{phase.text}</p>
    <button type="button" className={styles.btn} onClick={() => void prepare()}>Coba lagi</button>
  </div>;

  if (phase.kind === "printing" || !card) return <div className={styles.printing} aria-live="polite">
    <div className={styles.pcard} aria-hidden />
    <p className={styles.ptitle}>Kartumu sedang dicetak</p>
    <ol className={styles.psteps}>{STEPS.map((step, index) => <li key={step} className={phase.kind === "printing" && phase.step > index ? styles.ok : ""}>{step}</li>)}</ol>
  </div>;

  const open = phase.kind === "open";
  const name = nickname || "Kamu";
  const figure = card.figure;
  const { flip, listen, ...tiltEvents } = tilt;
  return <div className={`${styles.reveal} ${burst ? styles.burst : ""}`} style={{ ["--glow" as string]: card.tier.color }}>
    {!settled && <p className={styles.hint} aria-live="polite">{phase.kind === "closed" ? `${figure ? "Rarity" : "Level"} sudah diundi. Siapa tahu kamu dapat Legendary.` : ""}</p>}
    <div ref={flip} className={`${styles.flip} ${open ? styles.open : ""} ${phase.kind === "opening" ? styles.charge : ""}`} {...tiltEvents}
      onClick={() => { if (open) void listen(); }}>
      <div className={styles.rays} aria-hidden />
      <div className={styles.inner}>
        <button type="button" className={`${styles.face} ${styles.down}`} onClick={() => void reveal()} disabled={phase.kind !== "closed"} aria-label="Buka kartu karaktermu" tabIndex={open ? -1 : 0} aria-hidden={open || undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element -- card art drawn on canvas or served privately by this site; next/image cannot help */}
          {back && <img src={back} alt="" />}
          <span className={styles.tap}>Ketuk untuk membuka</span>
        </button>
        <div className={`${styles.face} ${styles.up}`} aria-hidden={!open || undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element -- card art drawn on canvas or served privately by this site; next/image cannot help */}
          {front && <img src={front} alt={figure ? `Kartu ${figure.name}, ${card.character.class}, ${card.tier.name}, nomor ${serialLabel(card.serial)}` : `Kartu ${card.character.name}, level ${card.tier.name}, nomor ${serialLabel(card.serial)}`} />}
          {figure && <span className={styles.shine} aria-hidden />}
          {figure && card.tier.sort >= 2 && <span className={styles.holo} aria-hidden />}
        </div>
      </div>
      <canvas className={styles.confetti} ref={confetti} aria-hidden />
    </div>
    {open && figure && !settled && <p className={styles.tiltHint}>Geser kartu atau miringkan HP untuk melihat kilapnya.</p>}

    {open && <>
      <div className={styles.banner} role="status">
        <b style={{ background: card.tier.color }}>{card.tier.name}</b>
        {card.tier.line && <span>{card.tier.line}</span>}
        <strong>{name}, kamu {figure ? `dapat ${figure.name}` : card.character.name}</strong>
      </div>
      {card.trial && <p className={styles.trial}>Kartu uji dari pratinjau draf: tanpa nomor, tidak dihitung. Saat kuesioner dibuka, kartumu diundi ulang sungguhan.</p>}
      <div className={styles.actions}>
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => void applyAsPhoto()} disabled={!!busy}><UserRound aria-hidden />{busy === "foto" ? "Menyimpan…" : "Pakai jadi foto profil"}</button>
        <button type="button" className={styles.btn} onClick={() => void saveImage("kartu")} disabled={!!busy}><ImageIcon aria-hidden />{busy === "kartu" ? "Membuat…" : "Simpan kartu"}</button>
        <button type="button" className={styles.btn} onClick={() => void saveImage("wallpaper")} disabled={!!busy}><Smartphone aria-hidden />{busy === "wallpaper" ? "Membuat…" : "Jadikan wallpaper"}</button>
        {!settled && <button type="button" className={`${styles.btn} ${styles.text}`} onClick={replay}><RotateCcw aria-hidden />Ulangi animasi</button>}
      </div>
      <p className={note?.tone === "error" ? styles.problem : styles.done} aria-live="polite">{note?.text}</p>

      {figure ? <>
        <section className={styles.panel} aria-labelledby="cq-card-who">
          <p className={styles.who}>{name}, tokohmu</p>
          <h2 id="cq-card-who" className={styles.name}>{figure.name}</h2>
          {card.reason && <p>{card.reason}</p>}
          {figure.costume && <p className={styles.small}>Figurnya: {figure.costume.charAt(0).toLowerCase() + figure.costume.slice(1)}.</p>}
          {figure.quote && <blockquote className={styles.small}>{figure.quote}</blockquote>}
        </section>
        <section className={styles.panel} aria-labelledby="cq-card-role">
          <p className={styles.who}>Tipemu</p>
          <h2 id="cq-card-role" className={styles.name}>{card.character.class}</h2>
          {card.character.title && <p className={styles.role}>{card.character.title}.</p>}
          {card.character.description && <p>{card.character.description}</p>}
          {card.character.powers.length > 0 && <ul className={styles.powers} aria-label="Kekuatan">{card.character.powers.map(power => <li key={power}>{power}</li>)}</ul>}
          {card.character.partner && <p className={styles.small}>Partner ideal: <b>{card.character.partner.class}</b></p>}
        </section>
        <section className={styles.panel} aria-labelledby="cq-card-traits">
          <h2 id="cq-card-traits" className={styles.heading}>Trait kartumu</h2>
          <p className={styles.small}>Tokoh dan tipe dicocokkan dari jawabanmu. Rarity diundi terpisah, sekali, lalu kartunya dikunci. Satu tokoh dimiliki paling banyak dua orang, tiga bila semua tokoh sudah terisi dua.</p>
          <dl className={styles.traits}>
            <div><dt>Tokoh</dt><dd>{figure.name}</dd><span>Dicocokkan dari jawabanmu</span></div>
            <div><dt>Peran</dt><dd>{card.character.class}</dd><span>Dari peranmu di tim</span></div>
            <div className={card.tier.sort >= 3 ? styles.rare : ""}><dt>Rarity</dt><dd>{card.tier.name}</dd><span>Peluang {oddsLabel(card.tier.odds)}, diundi terpisah</span></div>
            <div><dt>Nomor</dt><dd>{serialLabel(card.serial)}</dd><span>Urutan selesai mengisi</span></div>
          </dl>
          <p className={styles.dna}>DNA kartu {card.dna}</p>
        </section>
      </> : <>
      <section className={styles.panel} aria-labelledby="cq-card-who">
        <p className={styles.who}>{name}, karaktermu</p>
        <h2 id="cq-card-who" className={styles.name}>{card.character.name}</h2>
        <p className={styles.role}>Peran: {card.character.class}{card.character.figure ? ` (${card.character.figure})` : ""}.{card.character.title ? ` ${card.character.title}` : ""}</p>
        {card.character.description && <p>{card.character.description}</p>}
        {card.character.powers.length > 0 && <ul className={styles.powers} aria-label="Kekuatan">{card.character.powers.map(power => <li key={power}>{power}</li>)}</ul>}
        {card.character.partner && <p className={styles.small}>Partner ideal: <b>{card.character.partner.class}</b> ({card.character.partner.name})</p>}
      </section>

      <section className={styles.panel} aria-labelledby="cq-card-traits">
        <h2 id="cq-card-traits" className={styles.heading}>Trait kartumu</h2>
        <p className={styles.small}>Karakter dipilih dari jawabanmu. Level, latar kartu, dan stiker diundi acak sekali, lalu dikunci. Kombinasinya tidak sama dengan kartu rekan lain.</p>
        <dl className={styles.traits}>
          <div><dt>Karakter</dt><dd>{card.character.name}</dd><span>Dipilih dari jawabanmu</span></div>
          <div className={card.tier.sort >= 3 ? styles.rare : ""}><dt>Level</dt><dd>{card.tier.name}</dd><span>Peluang {oddsLabel(card.tier.odds)}, diundi terpisah</span></div>
          <div><dt>Latar</dt><dd>{card.background.name}</dd><span>Punggung kartu dan wallpaper</span></div>
          <div><dt>Stiker</dt><dd>{card.stickers.length ? card.stickers.map(sticker => sticker.name).join(" + ") : "Tanpa stiker"}</dd><span>0 sampai 2 stiker</span></div>
          <div><dt>Nomor</dt><dd>{serialLabel(card.serial)}</dd><span>Urutan selesai mengisi</span></div>
        </dl>
        <p className={styles.dna}>DNA kartu {card.dna}</p>
      </section>
      </>}
    </>}

    {saved && <SavedDialog onClose={closeSaved}>
      <div className={`${styles.sheet} ${saved.tall ? styles.tall : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- card art drawn on canvas or served privately by this site; next/image cannot help */}
        <img src={saved.url} alt={`Pratinjau ${saved.filename}`} />
        <p>{saved.caption} Tekan lama gambar untuk menyimpan, atau pakai tombol di bawah.</p>
        <div className={styles.row}>
          <button type="button" className={`${styles.btn} ${styles.text}`} onClick={closeSaved} autoFocus><X aria-hidden />Tutup</button>
          {shareable && <button type="button" className={styles.btn} onClick={() => void share()}><Share2 aria-hidden />Bagikan</button>}
          <a className={`${styles.btn} ${styles.primary}`} href={saved.url} download={saved.filename}><Download aria-hidden />Unduh PNG</a>
        </div>
      </div>
    </SavedDialog>}
    {confirmElement}
  </div>;
}

/**
 * The picture to keep, in a modal <dialog>: the top layer, so the questionnaire's bar and dock
 * never cover it. Escape or a tap outside closes it.
 */
function SavedDialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal?.();
  }, []);
  return <dialog ref={ref} className={styles.overlay} aria-label="Gambar siap disimpan" onClose={onClose} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    {children}
  </dialog>;
}

/** Confetti from the middle of the card: more pieces for a rarer level. */
function throwConfetti(canvas: HTMLCanvasElement, color: string, level: number) {
  const pieces = [18, 45, 80, 120, 170][Math.max(0, Math.min(4, level))];
  const box = canvas.getBoundingClientRect(), ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = box.width * ratio; canvas.height = box.height * ratio;
  const g = canvas.getContext("2d");
  if (!g) return;
  g.scale(ratio, ratio);
  const colours = [color, "#3A6FBF", "#75C3F5", "#F0BB3E", "#5BB37C", "#E5722D", "#D42E7E"];
  const flying = Array.from({ length: pieces }, (_, index) => {
    const angle = Math.random() * Math.PI * 2, speed = 4 + Math.random() * 9;
    return { x: box.width / 2, y: box.height * 0.45, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 4, size: 4 + Math.random() * 7, colour: colours[index % colours.length], turn: Math.random() * 6, spin: (Math.random() - 0.5) * 0.4 };
  });
  const start = performance.now();
  const step = (now: number) => {
    const share = (now - start) / 1800;
    g.clearRect(0, 0, box.width, box.height);
    if (share > 1) return;
    for (const piece of flying) {
      piece.vy += 0.28; piece.vx *= 0.985; piece.x += piece.vx; piece.y += piece.vy; piece.turn += piece.spin;
      g.save(); g.globalAlpha = 1 - share; g.translate(piece.x, piece.y); g.rotate(piece.turn); g.fillStyle = piece.colour; g.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2); g.restore();
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
