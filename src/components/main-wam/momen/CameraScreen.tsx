"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Camera, CameraOff, CloudOff, Hourglass, Image as ImageIcon, Lock, QrCode, Settings, SwitchCamera, X } from "lucide-react";
import { useLang, useT } from "@/components/main-wam/i18n";
import { ShellChrome } from "@/components/main-wam/shell";
import { ActionBar, Button, EmptyState, IconBox, IconButton, Pill, PhotoFill, Sheet, useToast } from "@/components/main-wam/ui";
import { loadTemplateAssets } from "@/lib/main-wam/momen/camera-template-draw";
import type { SignId } from "@/lib/main-wam/momen/camera-templates";
import type { CameraToneId } from "@/lib/main-wam/momen/camera-filters";
import { originalName } from "@/lib/main-wam/momen/editor";
import { demoPicture } from "@/lib/main-wam/momen/viewer";
import { sourceProblem } from "@/lib/pra-wam/photo";
import { GALLERY_PICK_MAX } from "@/lib/main-wam/momen/filters";
import { UMUM } from "@/lib/main-wam/momen/types";
import type { QueueItem } from "@/lib/main-wam/momen/queue";
import { queuedPill, sentText } from "@/lib/main-wam/momen/stack";
import { autoTag } from "@/lib/main-wam/rundown";
import type { MwSession } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import { misiDetectApi } from "@/lib/main-wam/misi/detect-routes";
import type { FromPhoto } from "@/lib/main-wam/misi/missions";
import type { TagCandidate } from "@/lib/main-wam/misi/rules";
import { errorText, misiRequest } from "@/components/main-wam/misi/request";
import { applyLook, decodeFile, frameFile, PhotoProblem, prepareInTurn, prepareMomenPhoto } from "./upload/compress";
import { PhotoEditor, type EditorPhoto, type EditorResult } from "./PhotoEditor";
import { saveOriginal } from "./saveFile";
import { useShareLocation, type ShareMode, type SharedFix } from "./useShareLocation";
import { MomenQueueRunner, useMomenQueue } from "./upload/QueueRunner";
import { momenQueue } from "./upload/sender";
import css from "./camera.module.css";

/*
 * U01–U05 and O04: the camera. It keeps only the shutter, the flip, the gallery button (and the header with the Galeri icon). A shot, or the pictures picked
 * from the gallery (up to ten), open "Periksa fotomu" at once (PhotoEditor, KONTRAK §40): sign and colour are chosen there, over the plain picture, and the
 * look is drawn only when Kirim is pressed. No chip and no sheet to choose a session: a photo is tagged behind the scenes with the session running when
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
/** Preview only: the editor open, with how many photos, how many still being made, who is tagged, and the look of each. */
export type EditorDemo = { photos?: number; pending?: number; tags?: string[]; query?: string; ask?: boolean; keep?: boolean; cur?: number; all?: boolean; gallery?: boolean; looks?: { sign: SignId; tone: CameraToneId }[]; panel?: "sign" | "filter" };
export type CameraDemo = { phase?: "izin" | "kamera"; live?: "contoh" | "ditolak" | "hp" | "menunggu"; pill?: number; offline?: boolean; sheet?: "galeri" | "cara"; geo?: ShareMode; editor?: EditorDemo };

const PERMISSION_KEY = "mw-momen-kamera";
/** "Tanya setiap foto": whether the tag part of "Periksa fotomu" is open for each photo ("tidak" = folded). */
const TAG_KEY = "mw-momen-tag";
/** "Simpan asli di HP": whether the plain capture is kept on the phone when Kirim is pressed ("tidak" = no; on by default). */
const KEEP_KEY = "mw-momen-asli";
/** The phone's clock (kept out of the component body: it runs when a photo is made, never while drawing). */
const nowMs = () => Date.now();
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function store(kind: "local" | "session", key: string, value?: string): string | null {
  try {
    const target = kind === "local" ? window.localStorage : window.sessionStorage;
    if (value === undefined) return target.getItem(key);
    target.setItem(key, value);
  } catch { /* not kept: private window, blocked storage */ }
  return null;
}
/** A shot in the editor: the plain picture as a file (shown by an object URL, kept for the sending and for "Simpan asli"). */
type Shot = EditorPhoto & { file: File | null };
/** Photos being looked at before Kirim. `pending` = still being made (a skeleton in the editor); `at`/`where` = when and where the shutter was pressed. */
type Edit = { key: string; photos: Shot[]; pending: number; fromGallery: boolean; takenAt: string; where: SharedFix | null; sending: boolean };
const demoEdit = (demo: EditorDemo): Edit => ({
  key: "demo", pending: demo.pending ?? 0, fromGallery: demo.gallery ?? false, takenAt: "2027-01-05T15:20:00+07:00", where: null, sending: false,
  photos: Array.from({ length: demo.photos ?? 1 }, (_, index) => ({ id: `demo-${index}`, url: demoPicture(index === 0 ? 4 : index * 2 + 1), fromGallery: demo.gallery ?? false, file: null })),
});
const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID()
  : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)));

export function CameraScreen({ sessions, nowIso, absen, migrated, initialSession, demo, candidates = [], detect = false }: {
  sessions: MwSession[];
  nowIso: string;
  absen: boolean;
  migrated: boolean;
  /** From the address: a session id, "umum", or none (the running session). */
  initialSession: string | null;
  /** Dev preview only: a fixed state to look at. */
  demo?: CameraDemo;
  /** The people the person may tag in "Periksa fotomu": active participants (with their profile photo when there is one). None = no tag block. */
  candidates?: readonly TagCandidate[];
  /** Some mission takes detection from Momen photos: the editor offers "Tandai lokasi" and the camera follows what detection found. */
  detect?: boolean;
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
  const [last, setLast] = useState<string | null>(null);
  // Optional extras (KONTRAK §13, §40): the position of the photo and the people in it, both chosen in the editor and both can be left off.
  const geo = useShareLocation(detect && !demo, demo?.geo);
  const [tagAsk, setTagAsk] = useState(demo?.editor?.ask ?? true);
  const [keep, setKeep] = useState(demo?.editor?.keep ?? true);
  // "Periksa fotomu": the photos between the shutter and Kirim (none = the camera).
  const [edit, setEdit] = useState<Edit | null>(demo?.editor ? demoEdit(demo.editor) : null);
  const editRef = useRef(edit);
  /** What the editor shows, set at once (the ref is what the async steps read; the state is what draws). */
  const put = (next: Edit | null) => { editRef.current = next; setEdit(next); };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- what this phone chose before (browser storage), known only after the first paint
  useEffect(() => { if (!demo) { if (store("local", TAG_KEY) === "tidak") setTagAsk(false); if (store("local", KEEP_KEY) === "tidak") setKeep(false); } }, [demo]);
  // Leaving the screen while the editor is open drops what it shows (the pictures are only here, nothing was sent).
  useEffect(() => () => { editRef.current?.photos.forEach(shot => { if (!demo) URL.revokeObjectURL(shot.url); }); }, [demo]);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const shutterInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const wantLive = useRef(false);

  /* The mark and the network art of the templates, ready before the first shutter (a late or failed load never costs the photo). */
  useEffect(() => { if (!demo) void loadTemplateAssets(); }, [demo]);

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
      else if (wantLive.current && !stream.current && !editRef.current) void start(facing, false);
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

  /* Taking: the editor opens at once (the frame is still being made: a skeleton), the shot is only a plain picture until Kirim. */
  function begin(count: number, fromGallery: boolean): string {
    const key = newId();
    put({ key, photos: [], pending: count, fromGallery, takenAt: new Date(nowMs() + clockOffset.current).toISOString(), where: fromGallery ? null : geo.fixNow(), sending: false });
    return key;
  }
  /** Leaves the editor: the pictures it showed are dropped, the camera comes back (Ulangi) or the screen closes (Batal, Kirim). */
  function dismiss(back: "kamera" | "tutup" | "kirim") {
    editRef.current?.photos.forEach(shot => URL.revokeObjectURL(shot.url));
    put(null);
    if (back === "tutup") close();
    else if (wantLive.current && !stream.current) void start(facing, false);
  }
  /** The pictures made for a session that is still the one on screen (a session dropped meanwhile ignores them). */
  function addShots(key: string, files: File[], failed: number, problem: string | null) {
    const current = editRef.current;
    if (!current || current.key !== key) return;
    const shots: Shot[] = files.map(file => ({ id: newId(), url: URL.createObjectURL(file), fromGallery: current.fromGallery, file }));
    if (!shots.length) {
      // Nothing could be read: back to the camera, with the reason.
      dismiss("kamera");
      toast.show({ text: problem ?? t("momen.cam.unreadableShort"), tone: "error" });
      return;
    }
    put({ ...current, photos: [...current.photos, ...shots], pending: Math.max(0, current.pending - shots.length - failed) });
    if (problem) toast.show({ text: problem, tone: "error" });
  }

  /** Kirim: the original is kept on the phone (from this tap), then each photo gets its look drawn, is made ready (4:5, three sizes) and queued with the people chosen. */
  async function sendEdit(result: EditorResult) {
    const session = editRef.current;
    if (!session || session.sending || !session.photos.length) return;
    put({ ...session, sending: true });
    if (keep && !session.fromGallery) void keepOriginals(session);
    const batch = newId();
    const where = session.fromGallery || geo.mode !== "aktif" ? null : geo.fixNow() ?? session.where;
    const ready: QueueItem[] = [];
    let thumb: string | null = null;
    let problem: string | null = null;
    for (const [index, shot] of session.photos.entries()) {
      const look = result.looks[index];
      try {
        const prepared = await prepareInTurn(async () => prepareMomenPhoto(await applyLook(await decodeFile(shot.file!), look?.sign, look?.tone, session.takenAt)));
        const [besar, kecil, ubin] = await Promise.all([prepared.besar.arrayBuffer(), prepared.kecil.arrayBuffer(), prepared.ubin.arrayBuffer()]);
        thumb ??= URL.createObjectURL(prepared.kecil);
        ready.push({
          clientId: newId(), batch, sessionId: tag, takenAt: session.takenAt, createdAt: nowMs() + ready.length,
          width: prepared.width, height: prepared.height, besar, kecil, ubin, state: "antre", attempts: 0, nextAt: 0, error: null, offline: false, photoId: null,
          deferred: navigator.onLine === false, tags: result.tags, geo: where, gallery: session.fromGallery,
        });
      } catch (error) {
        problem = error instanceof PhotoProblem ? error.message : t("momen.cam.unreadable");
      }
    }
    dismiss("kirim");
    if (!ready.length) {
      if (session.fromGallery) setSheet("galeri");
      else toast.show({ text: problem ?? t("momen.cam.unreadableShort"), tone: "error" });
      return;
    }
    if (thumb) { setLast(previous => { if (previous) URL.revokeObjectURL(previous); return thumb; }); }
    await deliver(ready, thumb, problem);
  }

  /**
   * "Simpan asli di HP": the plain capture goes to the phone (a share sheet on an iPhone, a download elsewhere), started from the tap on Kirim.
   * Never blocks the sending: a failure is one calm toast, and a closed share sheet says nothing.
   */
  async function keepOriginals(session: Edit) {
    try {
      const at = new Date(session.takenAt);
      for (const [index, shot] of session.photos.entries()) {
        if (shot.file) await saveOriginal(new File([shot.file], originalName(at, index), { type: shot.file.type || "image/jpeg" }));
      }
    } catch { toast.show({ text: t("momen.edit.keepFailed"), tone: "info" }); }
  }

  /** The photo goes (the queue keeps it until it is sent), with the toast "Terkirim · Batalkan", and what detection finds is told after. */
  async function deliver(ready: QueueItem[], thumb: string | null, problem: string | null) {
    await momenQueue().add(ready);
    const ids = ready.map(item => item.clientId);
    const cancel = () => {
      ids.forEach(id => { void momenQueue().cancel(id); });
      toast.show({ text: ready.length > 1 ? t("momen.cam.cancelledMany", { n: ready.length }) : t("momen.cam.cancelledOne"), tone: "info", duration: 3000 });
    };
    // eslint-disable-next-line @next/next/no-img-element -- the photo just made on this phone (object URL)
    const picture = thumb ? <img src={thumb} alt="" /> : undefined;
    // "Lihat": the stack opened at the photo just sent (the first of a batch), in the view it went to; the Momen stack if the server has not got it in a moment.
    const see = async () => {
      const id = await momenQueue().sentId(ids[0], 3000);
      stop();
      router.push(id ? mainWamPath.moments({ foto: id }) : mainWamPath.moments());
    };
    if (ready[0].deferred) toast.show({ text: t("momen.cam.sendsOnline"), thumb: picture, action: { label: t("momen.cam.undo"), onAction: cancel } });
    else toast.show({
      text: sentText(ready.length, lang), sub: t("momen.cam.sentSession", { title: tagSession?.title ?? t("momen.general") }), thumb: picture, timer: true, duration: 5000,
      action: { label: t("momen.cam.undo"), onAction: cancel }, secondary: { label: t("ui.see"), onAction: () => { void see(); } },
    });
    if (problem) toast.show({ text: problem, tone: "error" });
    if (detect) void follow(ids[0]);
  }

  function askTags(ask: boolean) { setTagAsk(ask); store("local", TAG_KEY, ask ? "ya" : "tidak"); }
  function keepOriginal(on: boolean) { setKeep(on); store("local", KEEP_KEY, on ? "ya" : "tidak"); }

  /*
   * After a photo is sent: the server looks for missions it meets (it waits for the photo to show to others first), so ask a few
   * times, then say what it found: "Fotomu otomatis diajukan untuk misi ..." with Tarik, or "Fotomu cocok untuk misi ..." with Ajukan.
   * Nothing found, or any trouble, says nothing: the photo is already kept.
   */
  async function follow(clientId: string) {
    const photoId = await momenQueue().sentId(clientId, 25_000);
    if (!photoId) return;
    for (const wait of [6500, 6000, 8000]) {
      await sleep(wait);
      try {
        const answer = await misiRequest<{ pending: boolean; items: FromPhoto[] }>(misiDetectApi.ofPhoto(photoId));
        if (answer.data.pending) continue;
        announce(answer.data.items.filter(item => item.photoId === photoId));
        return;
      } catch { return; }
    }
  }
  function announce(found: FromPhoto[]) {
    const [first, ...rest] = [...found].sort((a, b) => Number(b.outcome === "diajukan") - Number(a.outcome === "diajukan"));
    if (!first) return;
    const points = first.points.toLocaleString(lang === "en" ? "en-US" : "id-ID");
    const done = first.outcome === "diajukan" && first.state === "done";
    const base = done ? t("misi.auto.doneSub", { points }) : first.outcome === "diajukan" ? t("misi.auto.sentSub", { points }) : t("misi.auto.suggestSub", { points });
    const open = { label: t("misi.auto.open"), onAction: () => { stop(); router.push(mainWamPath.missions); } };
    const change = async (work: () => Promise<unknown>, said: string) => {
      try { await work(); toast.show({ text: said, tone: "info", duration: 3500 }); } catch (error) { toast.show({ text: errorText(error) || t("misi.auto.failed"), tone: "error" }); }
    };
    toast.show({
      text: done ? t("misi.auto.done", { title: first.title }) : first.outcome === "diajukan" ? t("misi.auto.sent", { title: first.title }) : t("misi.auto.suggest", { title: first.title }),
      sub: rest.length ? t("misi.auto.more", { sub: base, n: rest.length }) : base, tone: done ? "success" : "info", duration: 9000, secondary: open,
      ...(first.outcome === "saran"
        ? { action: { label: t("misi.auto.submit"), onAction: () => { void change(() => misiRequest(misiDetectApi.submit(first.missionId), { method: "POST", json: { photoId: first.photoId } }), t("misi.auto.submitted")); } } }
        : first.canTakeBack ? { action: { label: t("misi.auto.takeBack"), onAction: () => { void change(() => misiRequest(misiDetectApi.takeBack(first.missionId), { method: "DELETE" }), t("misi.auto.tookBack")); } } } : {}),
    });
  }

  async function shutter() {
    if (editRef.current) return;
    if (live === "menyala" && video.current && stream.current) {
      const key = begin(1, false);
      const here = () => editRef.current?.key === key;
      try {
        const file = await frameFile(video.current);
        stop(); // the camera rests while the photo is looked at; Ulangi and Kirim bring it back
        addShots(key, [file], 0, null);
      } catch (error) {
        if (here()) { dismiss("kamera"); toast.show({ text: error instanceof PhotoProblem ? error.message : t("momen.cam.unreadableShort"), tone: "error" }); }
      }
      return;
    }
    shutterInput.current?.click();
  }
  /** Files from the phone's own camera or the gallery: the editor opens at once; a file that is not a photo is left out, with the reason. */
  function open(files: File[], fromGallery: boolean) {
    if (!files.length || editRef.current) return;
    const key = begin(files.length, fromGallery);
    const problems = files.map(file => sourceProblem(file));
    const good = files.filter((_, index) => !problems[index]);
    addShots(key, good, files.length - good.length, problems.find(Boolean) ?? null);
  }
  function onShot(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) open([file], false);
  }
  function onPicked(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length > GALLERY_PICK_MAX) toast.show({ text: t("momen.cam.pickMax", { max: GALLERY_PICK_MAX }), tone: "info" });
    open(files.slice(0, GALLERY_PICK_MAX), true);
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
        <button type="button" className={css.shutter} aria-label={shutterLabel} disabled={!canShoot} onClick={shutter} />
        <IconButton variant="tonal" icon={SwitchCamera} label={t("momen.cam.flip")} pressed={facing === "user"} disabled={!canShoot} onClick={flip} />
      </div>
      {(live === "menyala" || live === "hp") && <p className={css.next}>{t("momen.cam.nextNote")}</p>}
      <input ref={shutterInput} className={css.hidden} type="file" accept="image/*" capture={facing} onChange={onShot} tabIndex={-1} aria-hidden />
      <input ref={galleryInput} className={css.hidden} type="file" accept="image/*" multiple onChange={onPicked} tabIndex={-1} aria-hidden />
    </div>

    {edit && <PhotoEditor photos={edit.photos} pending={edit.pending} candidates={candidates} lang={lang} taken={edit.takenAt} ask={tagAsk} onAskChange={askTags} keep={keep} onKeepChange={keepOriginal}
      canKeep={!edit.fromGallery} geo={detect && !edit.fromGallery ? { mode: geo.mode, toggle: geo.toggle } : null} sending={edit.sending}
      demo={demo?.editor ? { tags: demo.editor.tags, query: demo.editor.query, cur: demo.editor.cur, all: demo.editor.all, looks: demo.editor.looks, panel: demo.editor.panel } : undefined}
      onSend={sendEdit} onRetake={() => dismiss("kamera")} />}
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
