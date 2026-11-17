"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ArrowLeft, BookOpen, Check, Dices, Download, Globe2, IdCard, Lightbulb, Link2, RotateCcw, Share2, Shirt, Sparkles, Trophy, UserRound, X } from "lucide-react";
import { oddsLabel, serialLabel } from "@/lib/pra-wam/cards";
import { rarityOf, SPARK_COUNT } from "@/lib/pra-wam/figures";
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
 *
 * v3 (16 Nov 2026, Hanung): the rarity moves on the open card (a light ring turning on the edge,
 * a sweeping glare, rising sparks, stars; Epic and Legendary float), Epic and Legendary take
 * longer to open with a flash of the screen, Legendary throws gold confetti. Once Admin WAM opens
 * the re-roll, the opened card offers one re-roll of the figure, in its own dialog.
 *
 * v4 (handoff "undian kartu", approved by Hanung 16 Nov 2026): "Kartumu sudah siap." and "Ambil
 * bungkus kartuku", then a card pack with a face to tap three times (it squashes, winces and
 * sparkles; the second tap lets out the rarity's light, the only hint before it opens; Epic and
 * Legendary make it tremble first), the card jumps out, wobbles, turns open with a bounce, the
 * rarity stamp falls, and a short result: the name, the rarity, the persona, "1 dari 1", the
 * complement, save and wallpaper, "Kenapa …?", the re-roll and "Buka ulang" (the opening again,
 * never a new draw). "Lewati animasi" is always there; reduced motion goes straight to the result.
 * Everything is drawn on the server before; the page only shows it.
 */

type Phase = { kind: "printing"; step: number } | { kind: "ready" } | { kind: "pack"; taps: number } | { kind: "emerging"; wobble: boolean } | { kind: "open" } | { kind: "error"; text: string };
type Saved = { url: string; blob: Blob; filename: string; caption: string; tall?: boolean };

const openedKey = (formId: string) => `wam-cq-card-open:${formId}`;
const remembered = (formId: string) => { try { return window.localStorage.getItem(openedKey(formId)) === "1"; } catch { return false; } };
const remember = (formId: string) => { try { window.localStorage.setItem(openedKey(formId), "1"); } catch { /* only a convenience */ } };
const reducedMotion = () => typeof window === "undefined" || typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, reducedMotion() ? 0 : ms));
const buzz = (pattern: number | number[]) => { try { navigator.vibrate?.(pattern); } catch { /* not on this phone */ } };
const STEPS = ["Membaca jawabanmu", "Mencocokkan tokoh", "Mengundi rarity"];
/** What the pack says on each tap. */
const WORDS = [["Eh?", "Hihi!", "Duk!"], ["Aduh!", "Geli!", "Lagi!"], ["Brett!", "Yeay!", "Taraa!"]];
const pickOne = (list: readonly string[]) => list[Math.floor(Math.random() * list.length)];

/** Little stars flying out of a point of the stage (decoration only, not React's). */
function sparkBurst(layer: HTMLElement, x: number, y: number, count: number, color: string) {
  if (reducedMotion()) return;
  for (let index = 0; index < count; index++) {
    const star = document.createElement("i");
    star.className = styles.pop;
    const angle = Math.random() * Math.PI * 2, reach = 60 + Math.random() * 80;
    star.style.setProperty("--pc", index % 3 === 0 ? "#fff" : color);
    star.style.setProperty("--x0", `${x - 9}px`); star.style.setProperty("--y0", `${y - 9}px`);
    star.style.setProperty("--x1", `${x - 9 + Math.cos(angle) * reach}px`); star.style.setProperty("--y1", `${y - 9 + Math.sin(angle) * reach}px`);
    layer.appendChild(star);
    window.setTimeout(() => star.remove(), 800);
  }
}
/** A word popping up from the pack ("Aduh!"). */
function popWord(layer: HTMLElement, x: number, y: number, text: string) {
  if (reducedMotion()) return;
  const word = document.createElement("span");
  word.className = styles.word; word.textContent = text;
  word.style.left = `${x}px`; word.style.top = `${y}px`; word.style.setProperty("--rt", `${Math.random() * 20 - 10}deg`);
  layer.appendChild(word);
  window.setTimeout(() => word.remove(), 850);
}

/** The card pack: blue foil with a cheeky face, crimped ends, a tear line that lets the rarity's light out. */
function PackArt({ leak = 0 }: { leak?: number }) {
  return <>
    <span className={styles.packBody} />
    <span className={`${styles.crimp} ${styles.crimpBottom}`} />
    <span className={styles.tear}><span className={styles.crimp} /></span>
    <span className={styles.leak} style={{ opacity: leak }} />
    <span className={styles.pface}>
      <i className={`${styles.cheek} ${styles.left}`} /><i className={`${styles.eye} ${styles.left}`} /><i className={`${styles.eye} ${styles.right}`} /><i className={`${styles.cheek} ${styles.right}`} /><i className={styles.mouth} />
    </span>
    <span className={styles.packLabel}>KARTU TOKOH<small>WAM 2026 · 1 dari 1</small></span>
  </>;
}

/** Rising sparks per rarity, Common to Legendary (handoff v3). */
const RISING = [0, 8, 12, 18, 26];
const dateLabel = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

/** The moving rarity layers on the open card: ring, glare, rising sparks, holo and stars (none for Common). */
function RarityLayers({ rarity }: { rarity: number }) {
  if (rarity < 1) return null;
  return <>
    <span className={styles.edge} aria-hidden />
    <span className={styles.glare} aria-hidden />
    <span className={styles.riseFx} aria-hidden>{Array.from({ length: RISING[rarity] }, (_, index) => <i key={index} style={{
      ["--x" as string]: `${(index * 37 + 11) % 100}%`, ["--d" as string]: `${((index * 0.53) % 3.2).toFixed(2)}s`,
      ["--du" as string]: `${(2.6 + ((index * 0.71) % 2.2)).toFixed(2)}s`, ["--z" as string]: `${(rarity >= 3 ? 6 : 4) + (index % 3) * 2}px`,
    }} />)}</span>
    <span className={styles.holo} aria-hidden />
    <span className={styles.spark} aria-hidden>{SPARKS.slice(0, SPARK_COUNT[rarity]).map(([x, y, size], index) => <i key={index} style={{
      ["--x" as string]: `${x * 100}%`, ["--y" as string]: `${y * 78}%`, ["--s" as string]: `${(size * 250).toFixed(1)}%`, ["--d" as string]: `${((index * 0.37) % 2.4).toFixed(2)}s`,
    }} />)}</span>
  </>;
}
/** Both faces of a card, as pictures. */
async function facesOf(view: CardView) {
  const [face, cover] = await Promise.all([drawFront(view), drawBack(view)]);
  return { front: face.toDataURL("image/png"), back: cover.toDataURL("image/jpeg", 0.9) };
}
const SPARKS: readonly [number, number, number][] = [[.12, .1, .05], [.86, .16, .04], [.91, .44, .055], [.07, .46, .035], [.16, .66, .04], [.8, .06, .03], [.5, .05, .032], [.9, .64, .035], [.3, .2, .025], [.7, .3, .028]];

/**
 * The opened card tilts with a finger (or the phone, after it asks on iOS), with a shine and,
 * from Rare up, a holo layer, and the picture moves a little (handoff 12 Nov 2026, approved by
 * Hanung). Off under reduced motion. Writes only CSS variables on the card, never React state.
 */
function useTilt(open: boolean) {
  const flip = useRef<HTMLDivElement>(null);
  // The phone's motion listener and its idle timer, removed when the card goes.
  const motion = useRef<{ move: (event: DeviceOrientationEvent) => void; idle: number } | null>(null);
  const set = useCallback((x: number, y: number) => {
    const element = flip.current;
    // Only an open card tilts: after "Ulangi animasi" the closed card stays still and flips with its own easing.
    if (!element || !element.classList.contains(styles.open) || reducedMotion()) return;
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

export function CardReveal({ formId, initial, nickname, hasPhoto, settled, onReady }: {
  formId: string; initial: CardView | null; nickname: string; hasPhoto: boolean;
  /** The card is here (drawn now or before): the questionnaire locks the answers once it is a real one. */
  onReady?: (card: CardView) => void;
  /** Shown open with its result at once (the read-only view); "Buka ulang" still plays the opening. */
  settled?: boolean;
}) {
  const [card, setCard] = useState<CardView | null>(initial);
  const [phase, setPhase] = useState<Phase>(settled ? { kind: "open" } : { kind: "printing", step: 0 });
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  /** The stamp has fallen and the result shows (right away when settled or opened before). */
  const [stamped, setStamped] = useState(!!settled);
  const [flash, setFlash] = useState(false);
  const [tapLine, setTapLine] = useState("Ketuk bungkusnya!");
  /** The re-roll: "dialog" while its dialog is up, "done" once the new card is in. */
  const [reroll, setReroll] = useState<"" | "dialog" | "done">("");
  const [confirm, confirmElement] = useConfirm();
  const confetti = useRef<HTMLCanvasElement>(null);
  const pack = useRef<HTMLButtonElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const opening = useRef(false);
  const tilt = useTilt(phase.kind === "open");

  // Draw (or fetch) the card, paint both faces, then the opener, or the card open if opened before here.
  const prepare = useCallback(async () => {
    setPhase({ kind: "printing", step: 0 });
    try {
      const ticks = (async () => { for (let step = 1; step <= STEPS.length; step++) { await wait(650); setPhase(current => current.kind === "printing" ? { kind: "printing", step } : current); } })();
      const view = initial ?? (await praWamRequest<{ card: CardView }>(praWamApi.questionnaireCard, { method: "POST" })).data.card;
      setCard(view);
      onReady?.(view);
      const faces = await facesOf(view);
      setFront(faces.front); setBack(faces.back);
      await ticks; await wait(450);
      if (remembered(formId)) { setStamped(true); setPhase({ kind: "open" }); } else setPhase({ kind: "ready" });
    } catch (error) {
      setPhase({ kind: "error", text: errorText(error) });
    }
  // The draw runs once (started), so a new onReady never draws again.
  }, [formId, initial, onReady]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (settled && initial) { void facesOf(initial).then(faces => { setFront(faces.front); setBack(faces.back); }).catch(() => undefined); return; }
    // Starts the draw once: its state changes come from the request and the drawing, not this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void prepare();
  }, [initial, prepare, settled]);

  const level = card ? card.figure ? rarityOf(card.tier) : Math.min(4, card.tier.sort) : 0;

  /** "Ambil bungkus kartuku" (and "Buka ulang"): the pack to tap three times; under reduced motion the card opens at once. */
  function takePack() {
    setStamped(false); setTapLine("Ketuk bungkusnya!"); opening.current = false;
    if (reducedMotion()) { void finish(); return; }
    setPhase({ kind: "pack", taps: 0 });
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  }

  /** One tap on the pack: it squashes, winces and sparkles; the second lets out the rarity's light, the third tears it open. */
  async function tapPack() {
    if (!card || phase.kind !== "pack" || opening.current) return;
    const element = pack.current, host = stage.current, layer = fx.current;
    const taps = phase.taps + 1;
    setPhase({ kind: "pack", taps });
    if (element && host && layer) {
      const box = element.getBoundingClientRect(), frame = host.getBoundingClientRect();
      const x = box.left - frame.left + box.width / 2, y = box.top - frame.top + box.height * 0.45;
      element.classList.remove(styles.squash); void element.offsetWidth; element.classList.add(styles.squash, styles.hit);
      window.setTimeout(() => element.classList.remove(styles.hit), 260);
      sparkBurst(layer, x, y, 6 + taps * 4, taps >= 2 ? card.tier.color : "#FFC94A");
      popWord(layer, x + (Math.random() * 80 - 40), y - 90, pickOne(WORDS[Math.min(taps, 3) - 1]));
    }
    buzz(30 + taps * 20);
    if (taps === 1) setTapLine("Lagi! Bungkusnya mulai goyang.");
    if (taps === 2) setTapLine("Satu kali lagi...");
    if (taps < 3) return;
    opening.current = true;
    setTapLine(level >= 3 ? "Eh, kok bersinar terang?" : "Brett!");
    if (element && level >= 3) {
      element.classList.remove(styles.squash); element.classList.add(styles.jitter, styles.scared);
      buzz([30, 50, 30, 50, 30, 50, 80]);
      await wait(level === 4 ? 1500 : 1000);
      element.classList.remove(styles.jitter);
    }
    element?.classList.add(styles.rip);
    if (element && host && layer) {
      const box = element.getBoundingClientRect(), frame = host.getBoundingClientRect();
      sparkBurst(layer, box.left - frame.left + box.width / 2, box.top - frame.top + box.height * 0.45 - 110, 18, card.tier.color);
    }
    buzz(80);
    if (level >= 3) { setFlash(true); window.setTimeout(() => setFlash(false), 950); }
    await wait(380);
    setPhase({ kind: "emerging", wobble: false });
    await wait(650);
    setPhase({ kind: "emerging", wobble: true });
    await wait(level === 4 ? 900 : level === 3 ? 650 : 420);
    await finish();
  }

  /** The card turns open with a bounce, confetti flies, the rarity stamp falls, then the result. */
  async function finish() {
    if (!card) return;
    setPhase({ kind: "open" });
    buzz(level >= 3 ? [60, 40, 120] : 60);
    remember(formId);
    await wait(700);
    if (!reducedMotion() && confetti.current) throwConfetti(confetti.current, card.tier.color, level);
    setStamped(true);
    buzz(40);
  }

  /**
   * The re-roll's dialog closed. With a new card (drawn there, opened or not), the page shows it
   * only now, open, so nothing below the card gives the new figure away before its flip.
   */
  function rerolled(view: CardView | null, faces: { front: string; back: string } | null) {
    if (!view || !faces) { setReroll(""); return; }
    setCard(view); setFront(faces.front); setBack(faces.back);
    setReroll("done"); setStamped(true); setPhase({ kind: "open" });
  }

  async function saveImage(kind: "kartu" | "wallpaper") {
    if (!card) return;
    setBusy(kind); setNote(null);
    try {
      const canvas = kind === "kartu" ? await drawFront(card) : await drawWallpaper(card);
      const blob = await blobOf(canvas);
      if (!blob) throw new Error("Gambar belum dapat dibuat di browser ini.");
      setSaved(kind === "kartu"
        ? { url: URL.createObjectURL(blob), blob, filename: card.figure ? "kartu-tokoh-wam-2026.png" : "kartu-karakter-wam-2026.png", caption: "Kartu 1080 × 1350, siap dibagikan." }
        : { url: URL.createObjectURL(blob), blob, filename: "wallpaper-wam-2026.png", caption: `Wallpaper HP ${canvas.width} × ${canvas.height}, pas dengan layar HP-mu. Bagian atas sengaja kosong untuk jam layar kunci.`, tall: true });
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

  if (phase.kind === "ready") return <div className={`${styles.reveal} ${styles.opener}`}>
    <div className={styles.miniPack} aria-hidden><div className={styles.miniPackInner}><PackArt /></div></div>
    <p className={styles.ptitle}>Kartumu sudah siap.</p>
    <p className={styles.lead}>Tokoh-tokoh ini dulu membentuk hari esok mereka. Sekarang giliranmu. Buka kartumu dan kenali peranmu di tim.</p>
    <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={takePack}>Ambil bungkus kartuku</button>
  </div>;

  const open = phase.kind === "open";
  const packing = phase.kind === "pack" || phase.kind === "emerging";
  const showCard = phase.kind !== "pack";
  const name = nickname || "Kamu";
  const figure = card.figure;
  const shownName = figure?.name ?? card.character.name;
  const rarity = figure ? rarityOf(card.tier) : 0;
  const lit = (phase.kind === "pack" && phase.taps >= 2) || !packing;
  const { flip, listen, ...tiltEvents } = tilt;
  // One tone for the open card's page (17 Nov 2026): the persona's colour, gold for Legendary; the rarity's colour stays on the pack's light, the ring, the stamp and the rays.
  const tone = rarity === 4 ? "#E3A82B" : card.colors[0];
  return <div ref={stage} className={`${styles.reveal} ${styles.draw} ${lit ? styles.lit : ""} ${open ? styles.opened : ""}`} style={{ ["--glow" as string]: card.tier.color, ["--pc" as string]: card.colors[0], ["--stage-tone" as string]: tone }}>
    <div className={styles.bgdots} aria-hidden />
    <div ref={fx} className={styles.fxLayer} aria-hidden />
    {flash && <div className={styles.flash} aria-hidden />}

    {packing && <div className={`${styles.packZone} ${phase.kind === "emerging" ? styles.float : ""}`}>
      <button ref={pack} type="button" className={`${styles.pack} ${phase.kind === "emerging" ? styles.gone : ""}`} onClick={() => void tapPack()} disabled={phase.kind !== "pack"}
        aria-label="Bungkus kartu. Ketuk tiga kali untuk membuka.">
        <PackArt leak={phase.kind === "pack" && phase.taps >= 2 ? (level >= 2 ? 0.8 : 0.45) : phase.kind === "emerging" ? 1 : 0} />
      </button>
      <div>
        <p className={styles.tapLine} aria-live="polite">{tapLine}</p>
        <div className={styles.tapDots} aria-hidden>{[0, 1, 2].map(index => <i key={index} className={phase.kind === "pack" && phase.taps > index || phase.kind === "emerging" ? styles.on : ""} />)}</div>
        {phase.kind === "pack" && <p className={styles.center}><button type="button" className={`${styles.btn} ${styles.text} ${styles.skip}`} onClick={() => { opening.current = true; void finish(); }}>Lewati animasi</button></p>}
      </div>
    </div>}

    {showCard && <div className={`${styles.cardZone} ${phase.kind === "emerging" ? styles.emerge : ""} ${phase.kind === "emerging" && phase.wobble ? styles.wobble : ""}`}>
      <div ref={flip} className={`${styles.flip} ${styles.springy} ${open ? styles.open : ""}`} {...tiltEvents} onClick={() => { if (open) void listen(); }}>
        <div className={styles.rays} aria-hidden />
        <div className={styles.inner}>
          <div className={`${styles.face} ${styles.down}`} aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element -- card art drawn on canvas or served privately by this site; next/image cannot help */}
            {back && <img src={back} alt="" />}
          </div>
          <div className={`${styles.face} ${styles.up} ${figure ? styles[`r${rarity}`] : ""}`} aria-hidden={!open || undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element -- card art drawn on canvas or served privately by this site; next/image cannot help */}
            {front && open && <img src={front} alt={figure ? `Kartu ${figure.name}, ${card.character.class}, ${card.tier.name}, nomor ${serialLabel(card.serial)}` : `Kartu ${card.character.name}, level ${card.tier.name}, nomor ${serialLabel(card.serial)}`} />}
            {figure && <span className={styles.shine} aria-hidden />}
            {figure && open && <RarityLayers rarity={rarity} />}
          </div>
        </div>
      </div>
      <span className={`${styles.stamp} ${rarity === 4 ? styles.stampGold : ""} ${stamped ? styles.stampOn : ""}`} aria-hidden>{card.tier.name}</span>
      <canvas className={styles.confetti} ref={confetti} aria-hidden />
    </div>}
    {open && stamped && figure && <p className={styles.tiltHint}>Geser kartu atau miringkan HP untuk melihat kilapnya.</p>}

    {open && stamped && <div className={styles.res} role="status">
      <div><p className={styles.resWho}>{name}, kamu dapat</p><p className={`${styles.resName} ${rarity === 4 ? styles.goldName : ""}`}>{shownName}</p></div>
      <p className={styles.resTier}>{card.tier.name}.{card.tier.line ? ` ${card.tier.line}` : ""}{figure?.legend ? " Tokohmu tampil dalam wujud kelas RPG." : ""}</p>
      <div className={styles.pills}>
        <span className={`${styles.pill} ${styles.personaPill}`}>{card.character.class}</span>
        <span className={styles.pill}>{serialLabel(card.serial)}{card.trial ? "" : " · 1 dari 1"}</span>
        {card.character.partner && <span className={styles.pill}>Pelengkapmu: {card.character.partner.class}</span>}
      </div>
      {card.trial && <p className={styles.trial}>Kartu uji dari pratinjau draf: tanpa nomor, tidak dihitung. Saat kuesioner dibuka, kartumu diundi ulang sungguhan.</p>}
      <div className={styles.acts}>
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => void saveImage("kartu")} disabled={!!busy}>{busy === "kartu" ? "Membuat…" : "Simpan kartu"}</button>
        <button type="button" className={styles.btn} onClick={() => void saveImage("wallpaper")} disabled={!!busy}>{busy === "wallpaper" ? "Membuat…" : "Jadikan wallpaper"}</button>
      </div>
      <p className={note?.tone === "error" ? styles.problem : styles.done} aria-live="polite">{note?.text}</p>
      <FigureProfileSections card={card} name={name} rerolled={card.reroll?.state === "used" || reroll === "done"} />
      <div className={styles.rr}>
        {figure && card.reroll?.state === "open" && reroll !== "done" && <>
          <p className={styles.small}>Kurang sreg? Kamu boleh re-roll tokoh sekali{card.reroll.until ? `, sampai ${dateLabel(card.reroll.until)} WIB` : ""}. Tokoh dan rarity-nya diundi ulang, jadi bisa naik atau turun.</p>
          <button type="button" className={styles.btn} onClick={() => { setNote(null); setReroll("dialog"); }} disabled={reroll === "dialog" || !!busy}><Dices aria-hidden />Re-roll tokoh (1x)</button>
        </>}
        {figure && (card.reroll?.state === "used" || reroll === "done") && <p className={styles.small}>Jatah re-roll sudah dipakai. {figure.name} sekarang tokohmu.</p>}
        <button type="button" className={`${styles.btn} ${styles.text}`} onClick={() => void applyAsPhoto()} disabled={!!busy}><UserRound aria-hidden />{busy === "foto" ? "Menyimpan…" : "Pakai jadi foto profil"}</button>
        <button type="button" className={`${styles.btn} ${styles.text}`} onClick={takePack}><RotateCcw aria-hidden />Buka ulang</button>
      </div>
      {reroll === "dialog" && <RerollDialog card={card} nickname={name} onClose={rerolled} />}
    </div>}

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

/** One part of the tokoh profile: an icon, a title, its text. */
function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <section className={styles.prof} aria-label={title}><h3 className={styles.profTitle}>{icon}{title}</h3>{children}</section>;
}

type ProfileTab = "tokoh" | "cocok" | "tipe" | "kartu";
const PROFILE_TABS: { id: ProfileTab; label: string }[] = [
  { id: "tokoh", label: "Tokoh" }, { id: "cocok", label: "Cocok" }, { id: "tipe", label: "Tipemu" }, { id: "kartu", label: "Kartu" },
];

/**
 * Who the tokoh is and why it is mine (17 Nov 2026, the owner's choice): tabs, in the colours of
 * my card (the persona's colour, the rarity's for the highlights): Tokoh (who they are, their
 * achievement, their influence, the figure), Cocok (what of my answers they share), Tipemu (my
 * type and its complement), Kartu (rarity, number, edition). The profile is a draft HR checks
 * (figure-profiles.ts); a tokoh without one shows the rest.
 */
function FigureProfileSections({ card, name, rerolled }: { card: CardView; name: string; rerolled: boolean }) {
  const [tab, setTab] = useState<ProfileTab>("tokoh");
  const figure = card.figure;
  const profile = figure ? card.profile ?? null : null;
  const items = card.match?.items ?? [];
  const shared = items.filter(item => item.mine).length;
  const tabs = figure ? PROFILE_TABS : PROFILE_TABS.filter(item => item.id !== "tokoh" && item.id !== "cocok");
  const current = tabs.some(item => item.id === tab) ? tab : tabs[0].id;
  const tabsRef = useRef<HTMLDivElement>(null);
  /** Arrow keys move between the tabs, as a tab list should. */
  function onKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex(item => item.id === current);
    const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length];
    setTab(target.id);
    tabsRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${target.id}"]`)?.focus();
  }
  return <div className={`${styles.profile} ${rarityOf(card.tier) === 4 ? styles.profileGold : ""}`}>
    <div ref={tabsRef} className={styles.profileTabs} role="tablist" aria-label="Tentang kartumu" onKeyDown={onKey}>
      {tabs.map(item => <button key={item.id} type="button" role="tab" data-tab={item.id} id={`cq-tab-${item.id}`} aria-controls={`cq-panel-${item.id}`}
        aria-selected={current === item.id} tabIndex={current === item.id ? 0 : -1} className={current === item.id ? styles.tabOn : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </div>

    <div role="tabpanel" id={`cq-panel-${current}`} aria-labelledby={`cq-tab-${current}`} className={styles.profilePanel}>
      {current === "tokoh" && figure && <>
        {profile ? <>
          <Section icon={<UserRound aria-hidden />} title={`Siapa ${figure.name}`}>
            <p>{profile.who}</p>
            <p className={styles.tags}>{profile.tags.map(tag => <span key={tag} className={styles.tag}>{tag}</span>)}</p>
          </Section>
          {profile.story && <Section icon={<BookOpen aria-hidden />} title="Kisahnya"><p>{profile.story}</p></Section>}
          <Section icon={<Trophy aria-hidden />} title="Kehebatannya">
            {profile.feats?.length ? <ul className={styles.feats}>{profile.feats.map(feat => <li key={feat}>{feat}</li>)}</ul> : <p>{profile.feat}</p>}
          </Section>
          <Section icon={<Globe2 aria-hidden />} title="Pengaruhnya"><p>{profile.impact}</p></Section>
          {profile.lesson && <Section icon={<Sparkles aria-hidden />} title="Yang bisa kamu bawa"><p>{profile.lesson}</p></Section>}
          {profile.fact && <Section icon={<Lightbulb aria-hidden />} title="Tahukah kamu?"><p>{profile.fact}</p></Section>}
        </> : <p className={styles.small}>Profil {figure.name} sedang disiapkan.</p>}
        <Section icon={<Shirt aria-hidden />} title="Figurnya">
          {figure.costume && <p>{figure.costume.charAt(0).toUpperCase() + figure.costume.slice(1)}.</p>}
          {figure.legend && <p>Kartumu Legendary, jadi {figure.name} tampil dalam wujud kelas RPG: <b>{figure.legendClass ?? "kelas RPG"}</b>.</p>}
          {figure.quote && <blockquote className={styles.small}>{figure.quote}</blockquote>}
          <p className={styles.small}>Figur mainan berwajah umum, dikenali dari kostum dan aksesorinya.</p>
        </Section>
      </>}

      {current === "cocok" && figure && <Section icon={<Link2 aria-hidden />} title={`Kamu dan ${figure.name}`}>
        {items.length > 0 && <ul className={styles.matches}>
          {items.map(item => <li key={`${item.label}-${item.value}`} className={item.mine ? styles.matchOn : ""}>
            <span className={styles.matchMark} aria-hidden>{item.mine ? <Check /> : null}</span>
            <span><b>{item.label}:</b> {item.value}{item.mine ? <em> · kamu juga</em> : ""}</span>
          </li>)}
          {card.match && card.match.role.length > 0 && <li className={styles.matchOn}>
            <span className={styles.matchMark} aria-hidden><Check /></span>
            <span><b>Peranmu di tim:</b> {card.match.role.join(", ")} <em>· jadi tipemu {card.character.class}</em></span>
          </li>}
        </ul>}
        {items.length > 0 && <p className={styles.small}>{shared ? `${shared} dari ${items.length} hal yang disukai ${figure.name} juga kamu pilih di kuesioner.` : `${figure.name} punya kesukaan yang berbeda darimu.`}{rerolled ? " Tokoh ini datang dari re-roll, jadi diundi acak dari tokoh yang masih tersedia." : ""}</p>}
        {card.reason && <p>{card.reason}</p>}
      </Section>}

      {current === "tipe" && <Section icon={<Sparkles aria-hidden />} title={`Tipemu: ${card.character.class}`}>
        {card.character.title && <p><b>{card.character.title}.</b></p>}
        {card.character.description && <p>{card.character.description}</p>}
        {card.character.powers.length > 0 && <ul className={styles.powers} aria-label="Kekuatan">{card.character.powers.map(power => <li key={power}>{power}</li>)}</ul>}
        {card.character.partner && <p>Pelengkapmu: <b>{card.character.partner.class}</b>. Kamu paling klop kerja bareng tipe ini.</p>}
        <p className={styles.small}>{name}, tipemu dihitung dari peranmu di tim, hobi, kegiatan favorit, gaya berkumpul, dan kesiapan aktivitas fisik.</p>
      </Section>}

      {current === "kartu" && <Section icon={<IdCard aria-hidden />} title="Kartumu">
        <dl className={styles.facts}>
          <div><dt>Rarity</dt><dd>{card.tier.name}</dd><span>Peluang {oddsLabel(card.tier.odds)}{card.tier.line ? `. ${card.tier.line}` : ""}</span></div>
          <div><dt>Nomor</dt><dd>{serialLabel(card.serial)}</dd><span>Urutan selesai mengisi</span></div>
          {figure && <div><dt>Edisi</dt><dd>1 dari 1</dd><span>Setiap tokoh hanya dimiliki satu orang</span></div>}
          <div><dt>DNA kartu</dt><dd>{card.dna}</dd><span>Sidik unik kartumu</span></div>
        </dl>
        <p className={styles.small}>Tokoh dan tipe dicocokkan dari jawabanmu. Rarity diundi terpisah di server, sekali, lalu dikunci.</p>
      </Section>}
    </div>
  </div>;
}

/**
 * The re-roll in its own dialog (16 Nov 2026, the owner's choice): first what it means and "Ya, undi
 * ulang sekarang", then the new card face down to tap and open, as the first time; Kembali closes
 * it at any step. Nothing about the new figure shows before its flip.
 */
function RerollDialog({ card, nickname, onClose }: { card: CardView; nickname: string; onClose: (view: CardView | null, faces: { front: string; back: string } | null) => void }) {
  type Step = { kind: "ask" } | { kind: "busy" } | { kind: "error"; text: string } | { kind: "closed" | "opening" | "open"; view: CardView; faces: { front: string; back: string } };
  const [step, setStep] = useState<Step>({ kind: "ask" });
  const [flash, setFlash] = useState(false);
  const confetti = useRef<HTMLCanvasElement>(null);
  // Not while the server draws: the new figure is about to be mine, so the page must get it.
  const close = () => { if (step.kind !== "busy") onClose("view" in step ? step.view : null, "faces" in step ? step.faces : null); };

  async function draw() {
    setStep({ kind: "busy" });
    try {
      const view = (await praWamRequest<{ card: CardView }>(praWamApi.questionnaireCard, { method: "PATCH" })).data.card;
      setStep({ kind: "closed", view, faces: await facesOf(view) });
    } catch (error) {
      setStep({ kind: "error", text: errorText(error) });
    }
  }

  async function open() {
    if (step.kind !== "closed") return;
    const { view, faces } = step;
    const level = rarityOf(view.tier);
    setStep({ kind: "opening", view, faces });
    buzz(level >= 3 ? [20, 60, 20, 60, 20, 60, 80] : [20, 80, 20, 80, 40]);
    await wait(level === 4 ? 2200 : level === 3 ? 1700 : 1300);
    if (level >= 3 && !reducedMotion()) { setFlash(true); window.setTimeout(() => setFlash(false), 950); }
    setStep({ kind: "open", view, faces });
    buzz(level >= 3 ? [60, 40, 120] : 60);
    await wait(620);
    if (!reducedMotion() && confetti.current) throwConfetti(confetti.current, view.tier.color, level);
  }

  const back = <button type="button" className={`${styles.btn} ${styles.text}`} onClick={close} autoFocus><ArrowLeft aria-hidden />Kembali</button>;
  return <SavedDialog onClose={close} label="Re-roll tokoh">
    <div className={styles.sheet} style={{ ["--glow" as string]: "view" in step ? step.view.tier.color : card.tier.color }}>
      {flash && <div className={styles.flash} aria-hidden />}
      {(step.kind === "ask" || step.kind === "busy") && <>
        <h2 className={styles.heading}>Re-roll tokoh</h2>
        <p>Tokohmu sekarang dilepas dan tokoh baru diundi dari tokoh yang masih tersedia di tipe {card.character.class}. Rarity juga diundi ulang (sekarang <b>{card.tier.name}</b>), jadi bisa naik atau turun. Hasilnya wajib diterima dan tidak bisa kembali ke kartu lama. Nomor kartumu tetap.</p>
        <div className={styles.row}>
          {back}
          <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => void draw()} disabled={step.kind === "busy"}><Dices aria-hidden />{step.kind === "busy" ? "Mengundi…" : "Ya, undi ulang sekarang"}</button>
        </div>
      </>}
      {step.kind === "error" && <>
        <p className={styles.problem} role="alert">{step.text}</p>
        <div className={styles.row}>{back}</div>
      </>}
      {(step.kind === "closed" || step.kind === "opening" || step.kind === "open") && <>
        <p className={styles.hint} aria-live="polite">{step.kind === "open" ? "" : "Kartu barumu sudah diundi. Ketuk kartunya untuk membuka."}</p>
        <div className={`${styles.flip} ${step.kind === "open" ? styles.open : ""} ${step.kind === "opening" ? styles.charge : ""}`}>
          <div className={styles.inner}>
            <button type="button" className={`${styles.face} ${styles.down}`} onClick={() => void open()} disabled={step.kind !== "closed"} aria-label="Buka tokoh barumu" tabIndex={step.kind === "open" ? -1 : 0} aria-hidden={step.kind === "open" || undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element -- card art drawn on canvas; next/image cannot help */}
              <img src={step.faces.back} alt="" />
              <span className={styles.tap}>Ketuk untuk membuka</span>
            </button>
            <div className={`${styles.face} ${styles.up} ${styles[`r${rarityOf(step.view.tier)}`]}`} aria-hidden={step.kind !== "open" || undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element -- card art drawn on canvas; next/image cannot help */}
              {step.kind === "open" && <img src={step.faces.front} alt={`Kartu ${step.view.figure?.name ?? ""}, ${step.view.tier.name}`} />}
              {step.kind === "open" && <RarityLayers rarity={rarityOf(step.view.tier)} />}
            </div>
          </div>
          <canvas className={styles.confetti} ref={confetti} aria-hidden />
        </div>
        {step.kind === "open" && <div className={styles.banner} role="status">
          <b style={{ background: step.view.tier.color }}>{step.view.tier.name}</b>
          <strong>{nickname}, tokoh barumu {step.view.figure?.name}</strong>
          {step.view.reason && <span>{step.view.reason}</span>}
        </div>}
        <div className={styles.row}>{back}</div>
      </>}
    </div>
  </SavedDialog>;
}

/**
 * The picture to keep, in a modal <dialog>: the top layer, so the questionnaire's bar and dock
 * never cover it. Escape or a tap outside closes it.
 */
function SavedDialog({ onClose, children, label = "Gambar siap disimpan" }: { onClose: () => void; children: ReactNode; label?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal?.();
  }, []);
  return <dialog ref={ref} className={styles.overlay} aria-label={label} onClose={onClose} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    {children}
  </dialog>;
}

/** Confetti from the middle of the card: more pieces for a rarer level, all gold for Legendary. */
function throwConfetti(canvas: HTMLCanvasElement, color: string, level: number) {
  const pieces = [18, 45, 80, 120, 170][Math.max(0, Math.min(4, level))];
  const box = canvas.getBoundingClientRect(), ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = box.width * ratio; canvas.height = box.height * ratio;
  const g = canvas.getContext("2d");
  if (!g) return;
  g.scale(ratio, ratio);
  const colours = level >= 4 ? ["#FFC94A", "#FFE27A", "#F0BB3E", "#FFF4C9", "#E3A82B"] : [color, "#3A6FBF", "#75C3F5", "#F0BB3E", "#5BB37C", "#E5722D", "#D42E7E"];
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
