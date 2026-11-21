"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Camera, CameraOff, CloudOff, Hourglass, Image as ImageIcon, Lock, QrCode, Settings, SwitchCamera, X } from "lucide-react";
import { useLang, useT } from "@/components/main-wam/i18n";
import { ShellChrome } from "@/components/main-wam/shell";
import { ActionBar, Button, EmptyState, IconBox, IconButton, LoadingDialog, Pill, PhotoFill, Sheet, useToast } from "@/components/main-wam/ui";
import { GALLERY_PICK_MAX } from "@/lib/main-wam/momen/filters";
import { UMUM } from "@/lib/main-wam/momen/types";
import type { QueueItem } from "@/lib/main-wam/momen/queue";
import { queuedPill, sentText } from "@/lib/main-wam/momen/stack";
import { autoTag } from "@/lib/main-wam/rundown";
import type { MwSession } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import { decodeFile, grabFrame, PhotoProblem, prepareInTurn, prepareMomenPhoto, type Picture } from "./upload/compress";
import { MomenQueueRunner, useMomenQueue } from "./upload/QueueRunner";
import { momenQueue } from "./upload/sender";
import css from "./camera.module.css";

/*
 * U01–U05 and O04: the camera, Instagram Instants style: one press = one photo sent, no review, no
 * form. No chip and no sheet to choose a session: a photo is tagged behind the scenes with the session running when
 * it is taken (no tag when none runs, or when the address names one: ?sesi=). Every photo is for everyone.
 *
 * The camera itself (RISET §1): on a home-screen iPhone a web page's camera permission is asked
 * again at every launch (WebKit 327237), so the shutter opens the phone's own camera through
 * <input type=file capture> (no prompt, HDR, zoom) and the viewfinder shows the last photo. The live
 * viewfinder (getUserMedia) is used only when the browser already holds the permission ("granted",
 * Chrome on Android remembers it), or right after the person allows it in O04. Galeri: the phone's
 * own picker, up to ten photos at once.
 *
 * A photo is made ready on the phone (4:5 JPEG, three sizes), saved in the queue and sent; the toast
 * "Terkirim ke semua peserta · Batalkan" runs 5 seconds, the server shows the photo to others after
 * those 5 seconds. Without signal: "Akan terkirim saat online" and the pill "Offline · 2 foto antre".
 */

type Live = "memuat" | "menyala" | "hp" | "ditolak" | "menunggu";
export type CameraDemo = { phase?: "izin" | "kamera"; live?: "contoh" | "ditolak" | "hp" | "menunggu"; pill?: number; offline?: boolean; sheet?: "galeri" | "cara" };

const PERMISSION_KEY = "mw-momen-kamera";

function store(kind: "local" | "session", key: string, value?: string): string | null {
  try {
    const target = kind === "local" ? window.localStorage : window.sessionStorage;
    if (value === undefined) return target.getItem(key);
    target.setItem(key, value);
  } catch { /* not kept: private window, blocked storage */ }
  return null;
}
const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID()
  : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)));

export function CameraScreen({ sessions, nowIso, absen, migrated, initialSession, demo }: {
  sessions: MwSession[];
  nowIso: string;
  absen: boolean;
  migrated: boolean;
  /** From the address: a session id, "umum", or none (the running session). */
  initialSession: string | null;
  /** Dev preview only: a fixed state to look at. */
  demo?: CameraDemo;
}) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const { lang } = useLang();
  const queue = useMomenQueue();
  // The server's clock minus this phone's: the session tag and the time sent follow the server.
  const clockOffset = useRef(0);
  useEffect(() => { clockOffset.current = Date.parse(nowIso) - Date.now(); }, [nowIso]);
  const [now, setNow] = useState(() => new Date(nowIso));
  const [phase, setPhase] = useState<"izin" | "kamera" | null>(demo?.phase ?? null);
  const [live, setLive] = useState<Live>(demo?.live === "contoh" ? "menyala" : demo?.live ?? (migrated ? "memuat" : "menunggu"));
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  // The tag, out of sight: the session the address names ("umum" = none), else the session running now (it follows the clock).
  const tag = initialSession !== null ? (initialSession === UMUM ? null : initialSession) : autoTag(sessions, now)?.id ?? null;
  const [sheet, setSheet] = useState<CameraDemo["sheet"] | null>(demo?.sheet ?? null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const shutterInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const wantLive = useRef(false);

  /* The clock (server time): the automatic tag follows the running session while not touched. */
  useEffect(() => {
    if (demo) return;
    const tick = () => setNow(new Date(Date.now() + clockOffset.current));
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [demo]);

  /* The live viewfinder. */
  const stop = useCallback(() => {
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);
  const start = useCallback(async (side: "environment" | "user", asking: boolean): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    stop();
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: side }, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false });
      stream.current = media;
      wantLive.current = true;
      setLive("menyala");
      if (video.current) { video.current.srcObject = media; void video.current.play().catch(() => undefined); }
      return true;
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") { if (asking) setLive("ditolak"); else setLive("hp"); }
      else setLive("hp"); // NotFound, NotReadable (another app has it), Overconstrained: the phone's camera still works
      return false;
    }
  }, [stop]);

  useEffect(() => {
    if (demo || !migrated) return;
    const asked = store("local", PERMISSION_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- what this phone was asked before (browser storage)
    if (!asked) { setPhase("izin"); return; }
    setPhase("kamera");
    if (asked === "nanti") { setLive("ditolak"); return; }
    let cancelled = false;
    (async () => {
      let state: PermissionState | "unknown" = "unknown";
      try { state = (await navigator.permissions.query({ name: "camera" as PermissionName })).state; } catch { /* not supported */ }
      if (cancelled) return;
      if (state === "granted") await start("environment", false);
      else setLive(state === "denied" ? "ditolak" : "hp");
    })();
    return () => { cancelled = true; };
  }, [demo, migrated, start]);

  // Stop the camera in the background and when leaving; start it again on return.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "hidden") stop();
      else if (wantLive.current && !stream.current) void start(facing, false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); stop(); };
  }, [facing, start, stop]);

  // The video element appears with the live state: give it the stream then.
  useEffect(() => {
    const element = video.current;
    if (live !== "menyala" || !element || !stream.current || element.srcObject === stream.current) return;
    element.srcObject = stream.current;
    void element.play().catch(() => undefined);
  }, [live]);

  async function allow() {
    store("local", PERMISSION_KEY, "izin");
    setPhase("kamera");
    setLive("memuat");
    await start("environment", true);
  }
  function later() { store("local", PERMISSION_KEY, "nanti"); setPhase("kamera"); setLive("ditolak"); }
  async function askAgain() {
    store("local", PERMISSION_KEY, "izin");
    const ok = await start(facing, true);
    if (!ok) setSheet("cara");
  }

  const tagSession = sessions.find(session => session.id === tag) ?? null;

  /* Taking and sending. */
  async function send(pictures: (() => Promise<Picture>)[], fromGallery: boolean) {
    if (!pictures.length) return;
    setBusy(true);
    const batch = newId();
    const ready: QueueItem[] = [];
    let thumb: string | null = null;
    let problem: string | null = null;
    for (const picture of pictures) {
      try {
        const prepared = await prepareInTurn(async () => prepareMomenPhoto(await picture()));
        const [besar, kecil, ubin] = await Promise.all([prepared.besar.arrayBuffer(), prepared.kecil.arrayBuffer(), prepared.ubin.arrayBuffer()]);
        thumb ??= URL.createObjectURL(prepared.kecil);
        ready.push({
          clientId: newId(), batch, sessionId: tag, takenAt: new Date(Date.now() + clockOffset.current).toISOString(), createdAt: Date.now() + ready.length,
          width: prepared.width, height: prepared.height, besar, kecil, ubin, state: "antre", attempts: 0, nextAt: 0, error: null, offline: false, photoId: null,
          deferred: navigator.onLine === false,
        });
      } catch (error) {
        problem = error instanceof PhotoProblem ? error.message : t("momen.cam.unreadable");
      }
    }
    setBusy(false);
    if (!ready.length) {
      if (fromGallery) setSheet("galeri");
      else toast.show({ text: problem ?? t("momen.cam.unreadableShort"), tone: "error" });
      return;
    }
    if (thumb) { setLast(previous => { if (previous) URL.revokeObjectURL(previous); return thumb; }); }
    await momenQueue().add(ready);
    const ids = ready.map(item => item.clientId);
    const cancel = () => {
      ids.forEach(id => { void momenQueue().cancel(id); });
      toast.show({ text: ready.length > 1 ? t("momen.cam.cancelledMany", { n: ready.length }) : t("momen.cam.cancelledOne"), tone: "info", duration: 3000 });
    };
    // eslint-disable-next-line @next/next/no-img-element -- the photo just made on this phone (object URL)
    const picture = thumb ? <img src={thumb} alt="" /> : undefined;
    // "Lihat": the stack opened at the photo just sent (the first of a batch), in the view it went to; Fotoku if the server has not got it in a moment.
    const see = async () => {
      const id = await momenQueue().sentId(ids[0], 3000);
      stop();
      router.push(id ? mainWamPath.moments({ foto: id }) : mainWamPath.gallery({ lihat: "saya" }));
    };
    if (ready[0].deferred) toast.show({ text: t("momen.cam.sendsOnline"), thumb: picture, action: { label: t("momen.cam.undo"), onAction: cancel } });
    else toast.show({
      text: sentText(ready.length, lang), sub: t("momen.cam.sentSession", { title: tagSession?.title ?? t("momen.general") }), thumb: picture, timer: true, duration: 5000,
      action: { label: t("momen.cam.undo"), onAction: cancel }, secondary: { label: t("ui.see"), onAction: () => { void see(); } },
    });
    if (problem) toast.show({ text: problem, tone: "error" });
  }

  async function shutter() {
    if (busy) return;
    if (live === "menyala" && video.current && stream.current) { await send([() => grabFrame(video.current!)], false); return; }
    shutterInput.current?.click();
  }
  function onShot(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void send([() => decodeFile(file)], false);
  }
  function onPicked(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length > GALLERY_PICK_MAX) toast.show({ text: t("momen.cam.pickMax", { max: GALLERY_PICK_MAX }), tone: "info" });
    void send(files.slice(0, GALLERY_PICK_MAX).map(file => () => decodeFile(file)), true);
  }
  async function flip() {
    const side = facing === "environment" ? "user" : "environment";
    setFacing(side);
    if (live === "menyala") await start(side, false);
  }
  function close() {
    stop();
    if (window.history.length > 1) router.back(); else router.push(mainWamPath.moments());
  }

  /* Words on the buttons and in the sheets. */
  const shutterLabel = t("momen.cam.shutterAll");
  const waiting = demo?.pill ?? queue.summary.waiting;
  const offline = demo?.offline ?? queue.summary.offline;
  const showPill = waiting > 0 && (offline || queue.items.some(item => item.attempts > 0));
  const canShoot = live !== "ditolak" && live !== "menunggu" && live !== "memuat";

  if (phase === "izin") return <CameraPermission absen={absen} onAllow={allow} onLater={later} />;

  return <div className={css.screen} data-momen-camera="">
    <ShellChrome hideTopBar hideNav />
    {!demo && <MomenQueueRunner />}
    <div className={css.bar}>
      <IconButton variant="tonal" icon={X} label={t("momen.cam.close")} onClick={close} />
      <div className={css.barText}><span className={css.barEyebrow}>{t("momen.cam.eyebrow")}</span><span className={css.barTitle}>{t("momen.cam.title")}</span></div>
    </div>

    <div className={css.stage}><div className={css.stageInner}>
      <div className={css.view}>
        <i className={`${css.hud} ${css.hudA}`} aria-hidden /><i className={`${css.hud} ${css.hudB}`} aria-hidden /><i className={`${css.hud} ${css.hudC}`} aria-hidden /><i className={`${css.hud} ${css.hudD}`} aria-hidden />
        {live === "menyala" && !demo && <video ref={video} className={`${css.video} ${facing === "user" ? css.mirror : ""}`} playsInline muted autoPlay aria-label={facing === "user" ? t("momen.cam.viewfinderFront") : t("momen.cam.viewfinderBack")} />}
        {(live === "menyala" && demo) && <span role="img" aria-label={t("momen.cam.viewfinderBack")}><PhotoFill tone={5} className={css.fill} /></span>}
        {live === "hp" && (last
          // eslint-disable-next-line @next/next/no-img-element -- a photo on this phone (object URL)
          ? <img className={css.still} src={last} alt={t("momen.cam.lastSent")} />
          : <div className={css.off}><IconBox icon={Camera} size={64} round /><p className={css.offBody}>{t("momen.cam.phoneCamera")}</p></div>)}
        {live === "memuat" && <div className={css.off} role="status" aria-label={t("momen.cam.preparing")} />}
        {live === "ditolak" && <div className={css.off} role="status">
          <IconBox icon={CameraOff} size={64} round />
          <h1 className={css.offTitle}>{t("momen.cam.notAllowed")}</h1>
          <p className={css.offBody}>{t("momen.cam.orGallery")}</p>
          <Button icon={Camera} className={css.offAction} onClick={askAgain}>{t("momen.cam.allow")}</Button>
        </div>}
        {live === "menunggu" && <div className={css.off} role="status">
          <IconBox icon={Hourglass} size={64} round />
          <h1 className={css.offTitle}>{t("peserta.waiting.title")}</h1>
          <p className={css.offBody}>{t("momen.cam.waitingBody")}</p>
        </div>}
        {showPill && <Pill tone="onmedia" icon={<CloudOff />} className={css.status}>{queuedPill(waiting, offline, lang)}</Pill>}
      </div>
    </div></div>

    <div className={css.dock}>
      <div className={css.controls}>
        <button type="button" className={css.gallery} aria-label={t("momen.cam.pickGallery")} onClick={() => galleryInput.current?.click()} disabled={live === "menunggu"}>
          {last
            // eslint-disable-next-line @next/next/no-img-element -- the photo just sent (object URL)
            ? <img className={css.galleryImg} src={last} alt="" />
            : <PhotoFill tone={1} className={css.fill} />}
        </button>
        <button type="button" className={css.shutter} aria-label={shutterLabel} aria-busy={busy || undefined} disabled={!canShoot} onClick={shutter} />
        <IconButton variant="tonal" icon={SwitchCamera} label={t("momen.cam.flip")} pressed={facing === "user"} disabled={!canShoot} onClick={flip} />
      </div>
      <input ref={shutterInput} className={css.hidden} type="file" accept="image/*" capture={facing} onChange={onShot} tabIndex={-1} aria-hidden />
      <input ref={galleryInput} className={css.hidden} type="file" accept="image/*" multiple onChange={onPicked} tabIndex={-1} aria-hidden />
    </div>

    {/* Making the photo ready to send (the pictures are shrunk on the phone first): a dialog, so nothing is tapped twice. */}
    <LoadingDialog open={busy} title={t("momen.cam.sendingPhoto")} />
    <Sheet open={sheet === "galeri"} onClose={() => setSheet(null)} title={t("momen.gallery")} history={live !== "menyala"}>
      <EmptyState size="s" icon={ImageIcon} title={t("momen.cam.noAccess")} headingLevel={3}
        action={<Button icon={Settings} onClick={() => setSheet("cara")}>{t("momen.cam.openSettings")}</Button>} />
    </Sheet>
    <Sheet open={sheet === "cara"} onClose={() => setSheet(null)} title={t("momen.cam.allowTitle")} history={live !== "menyala"}
      footer={<Button block variant="secondary" icon={Camera} onClick={() => { setSheet(null); setLive("hp"); }}>{t("momen.cam.useCamera")}</Button>}>
      <ol className={css.steps}>
        <li>{t("momen.cam.stepIphone")}</li>
        <li>{t("momen.cam.stepAndroid")}</li>
      </ol>
      <p className={css.note}>{t("momen.cam.stillWorks")}</p>
    </Sheet>
  </div>;
}

/** O04: why the camera, before the browser asks (web.dev permissions best practices). */
export function CameraPermission({ absen, onAllow, onLater }: { absen: boolean; onAllow: () => void; onLater: () => void }) {
  const t = useT();
  return <div className={css.izin}>
    <ShellChrome hideTopBar hideNav />
    <div className={css.izinBody}>
      <h1 className={css.izinTitle}>{t("momen.cam.allowTitle")}</h1>
      <div className={css.ill} aria-hidden>
        {absen && <div className={css.scan}>
          <span className={`${css.corner} ${css.tl}`} /><span className={`${css.corner} ${css.tr}`} />
          <span className={`${css.corner} ${css.bl}`} /><span className={`${css.corner} ${css.br}`} />
          <QrCode />
        </div>}
        <span className={css.thumb}><PhotoFill tone={3} className={css.fill} /></span>
      </div>
      <ul className={css.bullets}>
        <li><IconBox icon={Camera} tone="primary" />{t("momen.cam.permPhotos")}</li>
        {absen && <li><IconBox icon={QrCode} tone="primary" />{t("momen.cam.permScan")}</li>}
        <li><IconBox icon={Lock} tone="primary" />{t("momen.cam.permOnlyOpen")}</li>
      </ul>
    </div>
    <div className={css.izinBar}>
      <ActionBar>
        <Button block onClick={onAllow}>{t("momen.cam.allow")}</Button>
        <Button block variant="text" onClick={onLater}>{t("momen.cam.later")}</Button>
      </ActionBar>
    </div>
  </div>;
}
