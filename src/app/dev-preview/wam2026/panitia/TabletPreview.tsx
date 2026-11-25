"use client";

import { useMemo } from "react";
import { FaceTablet, type FaceTabletClient, type TabletEngine } from "@/components/main-wam/panitia/FaceTablet";
import { EMBEDDING_SIZE } from "@/lib/hr/face-match";
import { matchFaces, type GalleryEntry, type TabletAnswer, type TabletData, type TabletFaceAnswer } from "@/lib/main-wam/panitia/face-tablet";
import { PanitiaError } from "@/components/main-wam/panitia/api";
import type { AttendeeRow } from "@/lib/main-wam/panitia/attendance";
import { PreviewApi } from "./PreviewApi";

/*
 * Dev-preview only (no sign-in, 404 in production): Absen mode tablet with a FAKE camera and FAKE
 * faces, so every state can be seen and screenshotted without a tablet. The picture is a canvas
 * (captureStream) with a few made-up heads on it; the engine reports where they are and gives each
 * a made-up set of numbers; the server's side is the real one-to-many rule (matchFaces) over a
 * two-person gallery. Nothing is saved, nothing is sent anywhere.
 */

export type TabletVariant = "" | "intro" | "ditolak" | "tanpa-wajah" | "belum-terdaftar" | "offline" | "belum-dibuka" | "ditutup" | "tanpa-sesi";

type Head = { x: number; y: number; hue: number; numbers: number[] };
const unit = (i: number) => Array.from({ length: EMBEDDING_SIZE }, (_, j) => (j === i ? 1 : 0));

const GALLERY: GalleryEntry[] = [{ employeeId: "bima", embedding: unit(0) }, { employeeId: "hendra", embedding: unit(1) }];
const PEOPLE: Record<string, { name: string; role: "peserta" | "bod" }> = { bima: { name: "Bima", role: "peserta" }, hendra: { name: "Pak Hendra", role: "bod" } };

/** Where each made-up person stands in the picture (0…1), and whose numbers they have. */
function heads(variant: TabletVariant): Head[] {
  if (variant === "tanpa-wajah") return [];
  if (variant === "belum-terdaftar") return [{ x: 0.38, y: 0.24, hue: 200, numbers: unit(7) }];
  return [
    { x: 0.1, y: 0.3, hue: 265, numbers: unit(0) },
    { x: 0.4, y: 0.2, hue: 195, numbers: unit(1) },
    { x: 0.72, y: 0.34, hue: 330, numbers: unit(9) },
  ];
}

function fakeCamera(people: Head[]): Promise<MediaStream> {
  const canvas = document.createElement("canvas");
  canvas.width = 1280; canvas.height = 720;
  const context = canvas.getContext("2d")!;
  const draw = () => {
    const gradient = context.createRadialGradient(640, 300, 80, 640, 360, 800);
    gradient.addColorStop(0, "#1c3a78"); gradient.addColorStop(1, "#070d22");
    context.fillStyle = gradient; context.fillRect(0, 0, 1280, 720);
    for (const head of people) {
      const cx = (head.x + 0.075) * 1280, cy = (head.y + 0.1) * 720;
      context.fillStyle = `hsl(${head.hue} 60% 38%)`;
      context.beginPath(); context.ellipse(cx, cy + 190, 120, 90, 0, Math.PI, 0); context.fill();
      context.fillStyle = `hsl(${head.hue} 70% 58%)`;
      context.beginPath(); context.arc(cx, cy, 62, 0, Math.PI * 2); context.fill();
    }
    window.requestAnimationFrame(draw);
  };
  draw();
  return Promise.resolve(canvas.captureStream(15));
}

function fakeEngine(people: Head[]): TabletEngine {
  const numbersOf = new WeakMap<object, number[]>();
  return {
    readAll(_video, t) {
      return people.map((head, index) => {
        const points = [[0, 0], [1, 0], [0, 1], [0, 2], [1, 2]] as never;
        numbersOf.set(points, head.numbers);
        // A little drift, so the brackets visibly follow the face.
        const dx = Math.sin(t / 900 + index) * 0.004, dy = Math.cos(t / 1100 + index) * 0.004;
        return {
          faces: people.length, points, closeness: 0.12, signal: { t, blinkLeft: 0, blinkRight: 0, smileLeft: 0, smileRight: 0, yaw: 0 },
          box: { x: head.x + dx, y: head.y + dy, width: 0.15, height: 0.2 },
        };
      });
    },
    async embed(_source, points) { return { embedding: numbersOf.get(points)!, sharpness: 100 }; },
  };
}

function fakeClient(variant: TabletVariant, total: number, startPresent: number): FaceTabletClient {
  let present = startPresent;
  const recorded = new Set<string>();
  return {
    async identify(input): Promise<TabletAnswer> {
      await new Promise(resolve => setTimeout(resolve, 350));
      if (variant === "offline") throw new PanitiaError("Tidak ada koneksi. Coba lagi saat sinyal kembali.", 0);
      if (variant === "belum-terdaftar") return { faces: input.faces.map(() => ({ kind: "belum-terdaftar" as const })), present, total };
      const verdicts = matchFaces(input.faces.map(face => face.embedding), GALLERY);
      const faces: TabletFaceAnswer[] = verdicts.map(verdict => {
        if (verdict.kind !== "dikenali") return { kind: verdict.kind };
        const who = PEOPLE[verdict.employeeId];
        const isNew = who.role !== "bod" && !recorded.has(verdict.employeeId);
        if (isNew) { recorded.add(verdict.employeeId); present += 1; }
        return { kind: "dikenali", person: { employeeId: verdict.employeeId, name: who.name, department: "CoE", photo: null, role: who.role }, already: !isNew && who.role !== "bod", recorded: isNew, checkedInAt: who.role === "bod" ? null : new Date().toISOString() };
      });
      return { faces, present, total };
    },
  };
}

export function TabletPreview({ data, variant, rows }: { data: TabletData; variant: TabletVariant; rows: AttendeeRow[] }) {
  const people = useMemo(() => heads(variant), [variant]);
  const engine = useMemo(() => fakeEngine(people), [people]);
  const client = useMemo(() => fakeClient(variant, data.rows.length, data.rows.filter(row => row.checkedInAt).length), [variant, data.rows]);
  const denied = variant === "ditolak";
  return <PreviewApi rows={rows}>
    <FaceTablet data={data} backHref="/dev-preview/wam2026/panitia?layar=k05" client={client} sample autoStart={variant !== "intro" && variant !== "tanpa-sesi"} loadEngine={async () => engine}
      getStream={() => (denied ? Promise.reject(new DOMException("Permission denied", "NotAllowedError")) : fakeCamera(people))} />
  </PreviewApi>;
}
