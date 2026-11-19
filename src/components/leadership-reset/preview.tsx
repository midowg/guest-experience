"use client";

import { useMemo } from "react";
import { DEFAULT_CONTENT, newKey, normalizeContent, questionsFor, type CmsView, type CoachResponse, type LrContent, type OwnAnswer } from "@/lib/leadership-reset/form";
import type { CmsApi, CoachApi, FormApi } from "./api";
import { Cms } from "./Cms";
import { CoachView } from "./CoachView";
import { ReflectionForm } from "./ReflectionForm";

/* Refleksi Leader on made-up data, for /dev-preview/refleksi only: nothing reaches a server. */

const content: LrContent = { ...DEFAULT_CONTENT, trainingDate: "2026-11-27", deadline: "2026-11-25T17:00:00+07:00" };
const people: [string, string, CoachResponse["targetStatus"]][] = [
  ["Raka Contoh", "Event Production", "sebagian"], ["Nadia Contoh", "Account", "tercapai"], ["Bima Rekaan", "Production", "belum"],
  ["Sinta Sampel", "Human Resources & General Affair", "tercapai"], ["Yoga Sampel", "Business & Administrative Services", "belum"],
];
const sample = { belum: "Saya cenderung mengambil alih pekerjaan tim ketika tenggat mepet, sehingga tim jarang belajar mengambil keputusan sendiri.", tercapai: "Yang paling membantu tim adalah ritme cek mingguan yang singkat: semua tahu prioritas dan hambatan dibuka lebih awal." };
const responses: CoachResponse[] = people.map(([name, team, targetStatus], index) => ({
  id: `00000000-0000-4000-8000-00000000000${index + 1}`, name, team, targetStatus,
  answers: questionsFor(targetStatus, content.questions).map(question => ({ id: question.id, label: question.label, text: sample[question.id as "belum" | "tercapai"] ?? "" })),
  createdAt: `2026-11-1${9 - (index % 3)}T0${index + 1}:15:00Z`, updatedAt: `2026-11-1${9 - (index % 3)}T0${index + 1}:15:00Z`,
}));
const wait = <T,>(value: T) => new Promise<T>(resolve => setTimeout(() => resolve(value), 350));

export function PreviewForm() {
  const api = useMemo<FormApi>(() => ({
    save: input => wait<OwnAnswer>({ name: input.name, team: input.team, targetStatus: input.targetStatus, answers: input.answers.filter(a => a.text.trim()).map(a => ({ id: a.id, label: content.questions.find(q => q.id === a.id)?.label ?? a.id, text: a.text.trim() })), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
    readOwn: () => wait(null),
  }), []);
  return <ReflectionForm content={content} isOpen now={new Date().toISOString()} api={api} preview />;
}

const rowsOnly = () => responses.map(row => ({ id: row.id, name: row.name, team: row.team, targetStatus: row.targetStatus, createdAt: row.createdAt, updatedAt: row.updatedAt }));
const firstView = (): CmsView => ({ migrated: true, content, isOpen: true, state: "open", coach: { linked: false, createdAt: null, seenAt: null }, responses: rowsOnly() });

/** An in-memory CMS: what it "saves" lives until the page reloads. */
function memoryCms(): CmsApi {
  const box = { view: firstView() };
  return {
    view: () => wait(box.view),
    saveForm: async input => { box.view = { ...box.view, content: normalizeContent(input.content), isOpen: input.isOpen, state: input.isOpen ? "open" : "closed" }; return { view: await wait(box.view), message: "Pratinjau: tidak disimpan." }; },
    newCoachKey: async () => { box.view = { ...box.view, coach: { linked: true, createdAt: new Date().toISOString(), seenAt: null } }; return wait({ coachKey: newKey(), view: box.view }); },
    newCmsKey: () => wait({ cmsKey: newKey() }),
    deleteResponse: async id => { box.view = { ...box.view, responses: box.view.responses.filter(row => row.id !== id) }; return wait(box.view); },
  };
}

export function PreviewCms() {
  const api = useMemo(() => memoryCms(), []);
  return <Cms cmsKey={"p".repeat(43)} initial={firstView()} api={api} hrefOf={section => `/dev-preview/refleksi/kelola${section === "ringkasan" ? "" : `?bagian=${section}`}`} preview />;
}

export function PreviewCoach() {
  const api = useMemo<CoachApi>(() => ({ view: () => wait({ content, responses }), excel: () => Promise.reject(new Error("Pratinjau: Excel dibuat oleh server.")) }), []);
  return <CoachView initial={{ content, responses }} api={api} preview />;
}
