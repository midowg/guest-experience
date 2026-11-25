"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Camera, CameraOff, CheckCircle2, CircleX, Hourglass, ImageOff, Lock, RotateCcw, Send, SwitchCamera } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { ScreenContent } from "@/components/main-wam/shell";
import { Banner, Button, EmptyState, EyebrowLabel, IconBox, IconButton, Pill, Text } from "@/components/main-wam/ui";
import { grabFrame, PhotoProblem, prepareInTurn, prepareMomenPhoto } from "@/components/main-wam/momen/upload/compress";
import type { MissionItem } from "@/lib/main-wam/misi/missions";
import { tagRuleOf, type TagCandidate } from "@/lib/main-wam/misi/rules";
import { mainWamApi, mainWamPath } from "@/lib/routes";
import { StepLabel, SummaryStep, TagStep, checkOf } from "./MissionSteps";
import { useNum } from "./MisiParts";
import { PlaceBanner } from "./PlaceBanner";
import { currentFix, useMissionPlace } from "./useMissionPlace";
import { errorText, misiRequest, putJpeg } from "./request";
import { DEMO_WRITE_MESSAGE } from "@/lib/main-wam/demo";
import css from "./misi.module.css";
import stepCss from "./misi-steps.module.css";

/*
 * A photo mission in steps: Kamera (the camera, and only the camera), Tag (when the mission asks to tag
 * friends: pick them), Ringkasan (the checklist of the mission's rules, met or not, then send).
 * The camera step: the camera, and only the camera. The viewfinder is the live stream (getUserMedia);
 * there is no file picker and no `capture` input anywhere on this screen, so a photo from the gallery
 * cannot be chosen. The shutter stays locked until the server says the position is inside the mission's
 * area (or, without a place, that the location is on). The photo is made ready on the phone (the same
 * 4:5 JPEG as Momen), then sent in two steps straight to storage, with the position read again at that
 * moment and judged again by the server.
 */

type Camera = "memuat" | "menyala" | "ditolak" | "tidakada";
type Shot = { besar: Blob; kecil: Blob; ubin: Blob; width: number; height: number; url: string; clientId: string };
type Phase = "bidik" | "tag" | "ringkas" | "kirim" | "selesai";
type Result = { status: string; reasons: string[] } | null;

const DEMO_SHOT = "/wam/demo/foto-05.svg";

const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID()
  : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)));

export function MissionCamera({ item, demo = false, candidates = [], viewer = { id: "", department: "" }, demoStart = null, demoTagged = [] }: {
  item: MissionItem;
  /** Mode demo: nothing is read from the server or saved. */
  demo?: boolean;
  /** The people the person may tag (the server lists them: active participants, with BOD, seat and room flags). */
  candidates?: readonly TagCandidate[];
  viewer?: { id: string; department: string };
  /** Dev preview only: start at a step with the stand-in photo (the preview has no camera). */
  demoStart?: "tag" | "ringkas" | null;
  demoTagged?: readonly string[];
}) {
  const t = useT();
  const num = useNum();
  const router = useRouter();
  const { place, check } = useMissionPlace(item.id, "foto", { demo, hasPlace: item.hasPlace, radiusM: item.radiusM });
  const [camera, setCamera] = useState<Camera>("memuat");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const tagRule = tagRuleOf(item.rules);
  const empty = () => new Blob();
  const [shot, setShot] = useState<Shot | null>(() => (demo && demoStart ? { besar: empty(), kecil: empty(), ubin: empty(), width: 1200, height: 1500, url: DEMO_SHOT, clientId: "demo" } : null));
  const [phase, setPhase] = useState<Phase>(demo && demoStart ? demoStart : "bidik");
  const [tagged, setTagged] = useState<string[]>([...demoTagged]);
  const [result, setResult] = useState<Result>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);
  const start = useCallback(async (side: "environment" | "user") => {
    if (!navigator.mediaDevices?.getUserMedia) { setCamera("tidakada"); return; }
    stop();
    setCamera("memuat");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: side }, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false });
      stream.current = media;
      setCamera("menyala");
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setCamera(name === "NotAllowedError" || name === "SecurityError" ? "ditolak" : "tidakada");
    }
  }, [stop]);

  // The camera opens with the screen and closes when it is left or the app goes to the background.
  useEffect(() => {
    if (phase !== "bidik" || shot) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening the camera is the effect: it ends in setCamera
    void start(facing);
    const onVisible = () => { if (document.visibilityState === "hidden") stop(); else if (!stream.current) void start(facing); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); stop(); };
  }, [phase, shot, facing, start, stop]);

  // The video element exists once the camera is on: hand it the stream then.
  useEffect(() => {
    const element = video.current;
    if (camera !== "menyala" || !element || !stream.current || element.srcObject === stream.current) return;
    element.srcObject = stream.current;
    void element.play().catch(() => undefined);
  }, [camera]);

  // Lets go of the preview's object URL when it is replaced or the screen closes.
  useEffect(() => () => { if (shot && shot.url.startsWith("blob:")) URL.revokeObjectURL(shot.url); }, [shot]);

  const unlocked = place.status === "ready" && place.answer.inside;
  const canShoot = camera === "menyala" && unlocked && !preparing;

  async function shutter() {
    if (!canShoot || !video.current) return;
    setPreparing(true); setProblem(null);
    try {
      const prepared = await prepareInTurn(async () => prepareMomenPhoto(await grabFrame(video.current!)));
      setShot({ besar: prepared.besar, kecil: prepared.kecil, ubin: prepared.ubin, width: prepared.width, height: prepared.height, url: URL.createObjectURL(prepared.kecil), clientId: newId() });
      stop();
    } catch (error) {
      setProblem(error instanceof PhotoProblem ? error.message : t("misi.cam.unreadable"));
    } finally { setPreparing(false); }
  }

  async function send() {
    if (!shot || phase === "kirim") return;
    if (demo) { setProblem(DEMO_WRITE_MESSAGE); return; }
    setPhase("kirim"); setProblem(null);
    try {
      const position = await currentFix();
      const body = { clientId: shot.clientId, position, size: shot.besar.size, thumbSize: shot.kecil.size, tileSize: shot.ubin.size, width: shot.width, height: shot.height, tags: tagged };
      const started = await misiRequest<{ token: string; uploads: { besar: string; kecil: string; ubin: string } }>(mainWamApi.missionPhotoStart(item.id), { method: "POST", json: body });
      await Promise.all([putJpeg(started.data.uploads.besar, shot.besar), putJpeg(started.data.uploads.kecil, shot.kecil), putJpeg(started.data.uploads.ubin, shot.ubin)]);
      const done = await misiRequest<{ status: string; reasons: string[] }>(mainWamApi.missionPhotoConfirm(item.id), { method: "POST", json: { ...body, token: started.data.token } });
      setResult(done.data);
      setPhase("selesai");
      router.refresh();
    } catch (error) {
      setPhase("ringkas");
      setProblem(error instanceof Error && !("status" in error) ? t("misi.loc.offNote") : errorText(error));
    }
  }

  function retake() { setShot(null); setProblem(null); setTagged([]); setPhase("bidik"); void check(); }

  const people = useMemo(() => tagged.flatMap(id => candidates.find(candidate => candidate.id === id) ?? []), [tagged, candidates]);
  const summary = useMemo(() => checkOf(item.rules, { inside: item.hasPlace ? place.status === "ready" && place.answer.inside : null, tags: people, viewer, attempts: Math.max(0, item.attempts) }), [item.rules, item.hasPlace, item.attempts, place, people, viewer]);
  const steps = tagRule ? 3 : 2;
  const afterShot = () => setPhase(tagRule ? "tag" : "ringkas");
  const tagEnough = !tagRule || !tagRule.required || tagged.length >= tagRule.count;

  if (phase === "selesai") {
    const status = result?.status ?? "perlu_ditinjau";
    const approved = status === "disetujui", rejected = status === "ditolak", checking = status === "dikirim" || status === "diperiksa";
    return <ScreenContent>
      <EmptyState icon={approved ? <CheckCircle2 /> : rejected ? <CircleX /> : <Hourglass />}
        title={approved ? t("misi.cam.doneTitle") : rejected ? t("misi.cam.rejectedTitle") : checking ? t("misi.cam.checkedTitle") : t("misi.cam.reviewTitle")}
        action={<Button block href={mainWamPath.missions}>{t("misi.cam.backToMissions")}</Button>}>
        {approved ? t("misi.cam.doneBody", { points: num(item.points) }) : rejected ? (result?.reasons.join(" ") || t("misi.sheet.rejected")) : checking ? t("misi.cam.checkedBody") : t("misi.cam.reviewBody")}
      </EmptyState>
    </ScreenContent>;
  }

  if (shot && (phase === "tag" || phase === "ringkas" || phase === "kirim")) {
    const onSummary = phase !== "tag";
    return <ScreenContent>
      <div className={css.head}>
        <div className={css.headText}>
          <EyebrowLabel tone="gold">{t("misi.sheet.points", { points: num(item.points) })}</EyebrowLabel>
          <h2 className={css.headTitle}>{item.title}</h2>
        </div>
      </div>
      <StepLabel step={onSummary ? steps : 2} total={steps} name={onSummary ? t("misi.step.summary") : t("misi.step.tag")} />
      {problem && <Banner tone="error">{problem}</Banner>}
      <div className={stepCss.thumbRow}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the photo just made on this phone (object URL) or the demo stand-in */}
        <img className={stepCss.thumb} src={shot.url} alt={t("misi.cam.preview")} />
        <Button variant="secondary" size="m" icon={<RotateCcw />} disabled={phase === "kirim"} onClick={retake}>{t("misi.cam.retake")}</Button>
      </div>
      {phase === "tag" && tagRule
        ? <>
          <TagStep rule={tagRule} candidates={candidates} selected={tagged} onChange={setTagged} />
          <div className={css.actions}>
            <Button variant="secondary" onClick={() => setPhase("bidik")}>{t("misi.step.back")}</Button>
            <Button icon={<ArrowRight />} disabled={!tagEnough} onClick={() => setPhase("ringkas")}>{t("misi.step.next")}</Button>
          </div>
        </>
        : <>
          <SummaryStep rules={item.rules} checks={summary.checks} tags={people} points={item.points} tries={item.maxAttempts ? { n: Math.min(item.maxAttempts, Math.max(0, item.attempts) + 1), max: item.maxAttempts } : null} />
          <div className={css.actions}>
            <Button variant="secondary" disabled={phase === "kirim"} onClick={() => setPhase(tagRule ? "tag" : "bidik")}>{t("misi.step.back")}</Button>
            <Button icon={<Send />} loading={phase === "kirim"} loadingLabel={t("misi.cam.sending")} disabled={!summary.ok} onClick={() => void send()}>{t("misi.sum.send", { points: num(item.points) })}</Button>
          </div>
        </>}
    </ScreenContent>;
  }

  return <ScreenContent>
    <div className={css.head}>
      <div className={css.headText}>
        <EyebrowLabel tone="gold">{t("misi.sheet.points", { points: num(item.points) })}</EyebrowLabel>
        <h2 className={css.headTitle}>{item.title}</h2>
      </div>
    </div>
    <StepLabel step={1} total={steps} name={t("misi.step.camera")} />
    <PlaceBanner place={place} item={item} onCheck={() => void check()} />
    {problem && <Banner tone="error">{problem}</Banner>}

    <div className={css.stage}>
      <i className={`${css.hud} ${css.hudA}`} aria-hidden /><i className={`${css.hud} ${css.hudB}`} aria-hidden /><i className={`${css.hud} ${css.hudC}`} aria-hidden /><i className={`${css.hud} ${css.hudD}`} aria-hidden />
      {shot
        // eslint-disable-next-line @next/next/no-img-element -- the photo just made on this phone (object URL)
        ? <img className={css.shot} src={shot.url} alt={t("misi.cam.preview")} />
        : camera === "menyala"
          ? <video ref={video} className={`${css.video} ${facing === "user" ? css.mirror : ""}`} playsInline muted autoPlay aria-label={t("misi.cam.viewfinder")} />
          : camera === "memuat"
            ? <div className={css.stageNote} role="status" aria-label={t("ui.loading")} />
            : <div className={css.stageNote} role="status">
              <IconBox icon={<CameraOff />} size={64} round />
              <Text as="h3" variant="subtitle">{camera === "ditolak" ? t("misi.cam.deniedTitle") : t("misi.cam.unsupportedTitle")}</Text>
              <Text variant="body" color="2">{camera === "ditolak" ? t("misi.cam.deniedBody") : t("misi.cam.unsupportedBody")}</Text>
              {camera === "ditolak" && <Button icon={<Camera />} onClick={() => void start(facing)}>{t("misi.cam.allow")}</Button>}
            </div>}
      <Pill tone="onmedia" icon={<Camera />} className={css.stageChip}>{t("misi.cam.chip")}</Pill>
      {!shot && camera === "menyala" && !unlocked && <div className={css.lock}><Lock aria-hidden />{t("misi.cam.locked")}</div>}
    </div>
    {demo && !shot && <Button className={stepCss.demoShot} variant="secondary" size="m" icon={<Camera />} onClick={() => setShot({ besar: empty(), kecil: empty(), ubin: empty(), width: 1200, height: 1500, url: DEMO_SHOT, clientId: "demo" })}>{t("misi.demo.useSample")}</Button>}
    <p className={css.noGallery}><ImageOff aria-hidden />{t("misi.cam.noGallery")}</p>

    {shot
      ? <div className={css.actions}>
        <Button variant="secondary" icon={<RotateCcw />} onClick={retake}>{t("misi.cam.retake")}</Button>
        <Button icon={<ArrowRight />} onClick={afterShot}>{t("misi.step.next")}</Button>
      </div>
      : <div className={css.shutterRow}>
        <span className={css.shutterSide} />
        <button type="button" className={css.shutter} aria-label={t("misi.cam.shutter")} aria-busy={preparing || undefined} disabled={!canShoot} onClick={() => void shutter()} />
        <span className={css.shutterSide}>
          <IconButton variant="tonal" icon={SwitchCamera} label={t("misi.cam.flip")} pressed={facing === "user"} disabled={camera !== "menyala"} onClick={() => setFacing(side => (side === "environment" ? "user" : "environment"))} />
        </span>
      </div>}
  </ScreenContent>;
}
