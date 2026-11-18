"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleDot, CloudOff, Lock, Send, X } from "lucide-react";
import { useLang, useT } from "@/components/main-wam/i18n";
import { ScreenContent, ShellChrome, Stack } from "@/components/main-wam/shell";
import { ActionBar, Banner, Button, Card, ChipRow, ConfirmDialog, FilterChip, TextField, TopBar, useToast } from "@/components/main-wam/ui";
import { draftKey, openBanner, readDraft, SILENT_BODY_MAX, type SilentView } from "@/lib/main-wam/modul/silent";
import { mainWamApi, mainWamPath } from "@/lib/routes";
import { errorText, ModulError, modulRequest } from "../request";
import { Result } from "../Result";
import { useOnline } from "../useOnline";
import css from "../modul.module.css";

type Sent = { remaining: number };

function loadDraft(questionId: string) {
  try { return readDraft(window.localStorage.getItem(draftKey(questionId))); } catch { return { topic: "", body: "" }; }
}
function saveDraft(questionId: string, draft: { topic: string; body: string }) {
  try {
    if (draft.body.trim() || draft.topic) window.localStorage.setItem(draftKey(questionId), JSON.stringify(draft));
    else window.localStorage.removeItem(draftKey(questionId));
  } catch { /* private mode: the text stays on screen only */ }
}

/**
 * T01 Silent Meeting dibuka → T02 Masukan terkirim. The text is kept on this phone while it is
 * written (it survives a closed tab, no signal, and the Silent Meeting closing mid-sentence), and
 * leaves the phone only when sent, without the person. Back with text asks first (T01-buang).
 * Closing while writing (by the clock or by panitia, T01-ditutup) keeps the text and says so.
 * Once shown open, it tells the server (a request of its own, never with a feedback) that this person
 * opened the form: the recap needs 5 different people (audit H1). `preview` opens a dialog or a state
 * without a server (dev-preview).
 */
export function SilentForm({ view, remaining: initialRemaining, preview }: {
  view: SilentView;
  remaining: number;
  preview?: { body?: string; topic?: string; dialog?: "buang" | "ditutup"; sending?: boolean; offline?: boolean; sent?: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const { lang } = useLang();
  const id = useId();
  const online = useOnline() && !preview?.offline;
  const [topic, setTopic] = useState(preview?.topic ?? "");
  const [body, setBody] = useState(preview?.body ?? "");
  const [sending, setSending] = useState(!!preview?.sending);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"buang" | "ditutup" | null>(preview?.dialog ?? null);
  const [done, setDone] = useState<Sent | null>(preview?.sent ? { remaining: initialRemaining - 1 } : null);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [closed, setClosed] = useState(false);
  const loaded = useRef(!!preview);
  const questionId = view.question.id;

  // The draft of this question on this phone, once (after the first paint: localStorage is the browser's).
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const draft = loadDraft(questionId);
    if (!draft.body && !draft.topic) return;
    // Restoring the phone's draft once after hydration (the server cannot see localStorage).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of an external store, not derived state
    setBody(draft.body); setTopic(view.question.topics.includes(draft.topic) ? draft.topic : "");
  }, [questionId, view.question.topics]);
  useEffect(() => { if (loaded.current && !preview) saveDraft(questionId, { topic, body }); }, [questionId, topic, body, preview]);

  // "I opened the form" (the threshold's 5 people): once per screen, when there is signal; the server
  // keeps it once per person per question. Never sent with the text, and failures are quiet.
  const opened = useRef(!!preview);
  useEffect(() => {
    if (opened.current) return;
    const tell = () => {
      if (opened.current || !navigator.onLine) return;
      opened.current = true;
      modulRequest(mainWamApi.silent, { method: "POST", json: { questionId } }).catch(problem => {
        if (problem instanceof ModulError && problem.offline) opened.current = false;
      });
    };
    tell();
    window.addEventListener("online", tell);
    return () => window.removeEventListener("online", tell);
  }, [questionId]);

  // Closing by the clock while the screen is open: the text stays, the person is told.
  useEffect(() => {
    if (!view.closesAt || preview) return;
    const wait = Date.parse(view.closesAt) - Date.now();
    if (wait <= 0 || wait > 24 * 3600_000) return;
    const timer = window.setTimeout(() => { setClosed(true); setDialog(current => current ?? "ditutup"); }, wait + 1000);
    return () => window.clearTimeout(timer);
  }, [view.closesAt, preview]);

  const leave = () => {
    if (window.history.length > 1) router.back();
    else router.push(mainWamPath.home);
  };
  const back = () => (body.trim() && !done ? setDialog("buang") : leave());

  async function send() {
    if (!body.trim() || sending || !online || closed) return;
    setSending(true); setError(null);
    try {
      const { data } = await modulRequest<Sent>(mainWamApi.silentFeedback, { method: "POST", json: { questionId, topic, body } });
      saveDraft(questionId, { topic: "", body: "" });
      setBody(""); setTopic(""); setRemaining(data.remaining); setDone(data);
      window.scrollTo({ top: 0 });
    } catch (problem) {
      if (problem instanceof ModulError && problem.status === 409) { setClosed(true); setDialog("ditutup"); }
      else setError(errorText(problem));
    } finally { setSending(false); }
  }

  async function copyText() {
    setDialog(null);
    try { await navigator.clipboard.writeText(body); toast.show({ text: t("silent.copied"), tone: "success" }); }
    catch { toast.show({ text: t("silent.copyFailed"), sub: t("silent.copyFailedSub"), tone: "error" }); }
  }

  const top = (icon?: "x") => <>
    <ShellChrome hideTopBar />
    <div className={css.ownTop}>
      <TopBar variant="back" title={icon ? "" : t("screen.silent")} onBack={icon ? leave : back} backLabel={icon ? t("shell.closeTask") : t("shell.back")} backIcon={icon ? <X /> : undefined} />
    </div>
  </>;

  if (done) {
    return <div className={css.fill}>
      {top("x")}
      <ScreenContent className={css.grow}>
        <Result center icon={<CircleCheck />} tone="success" title={t("silent.sent")} body={t("silent.sentBody")} />
      </ScreenContent>
      <ActionBar>
        <div className={css.stackActions}>
          {remaining > 0 && !closed && <Button block onClick={() => setDone(null)}>{t("silent.writeAgain")}</Button>}
          <Button block variant={remaining > 0 && !closed ? "text" : "primary"} href={mainWamPath.home}>{t("silent.done")}</Button>
        </div>
      </ActionBar>
    </div>;
  }

  const empty = !body.trim();
  const over = Array.from(body).length > SILENT_BODY_MAX;
  const disabled = empty || over || !online || closed || remaining <= 0;
  const note = !online
    ? <span className={css.offlineNote}><CloudOff aria-hidden />{t("silent.needSignal")}</span>
    : closed ? t("silent.closedKept")
      : remaining <= 0 ? t("silent.rateLimited") : undefined;

  return <>
    {top()}
    <ScreenContent>
      {closed
        ? <Banner tone="warning" icon={<Lock />} title={t("silent.closed")} />
        : <Banner tone="success" icon={<CircleDot />} title={openBanner(view, lang)} />}
      <Stack>
        <Card><p className={css.questionText}>{view.question.question}</p></Card>
        <Card variant="tonal">
          <p className={css.privacyHead}><Lock aria-hidden />{t("silent.anonymous")}</p>
          <p className={css.privacyBody}>{t("silent.anonymousBody")}</p>
        </Card>
      </Stack>
      {view.question.topics.length > 0 && <div role="group" aria-labelledby={`${id}-topik`}>
        <p id={`${id}-topik`} className={css.fieldLabel}>{t("silent.topic")} <span>{t("silent.optional")}</span></p>
        <ChipRow>
          {view.question.topics.map(item => <FilterChip key={item} selected={topic === item} onClick={() => setTopic(topic === item ? "" : item)}>{item}</FilterChip>)}
        </ChipRow>
      </div>}
      <TextField multiline label={t("silent.yourInput")} placeholder={t("silent.placeholder")} rows={6} value={body} onChange={event => setBody(event.target.value)}
        help={t("silent.help")} showCount countMax={SILENT_BODY_MAX} error={over ? t("silent.tooLong") : error ?? undefined} />
    </ScreenContent>
    <ActionBar note={note}>
      <Button block icon={<Send />} disabled={disabled} loading={sending} loadingLabel={t("silent.sending")} onClick={() => void send()}>{t("silent.submit")}</Button>
    </ActionBar>
    <ConfirmDialog open={dialog === "buang"} tone="danger" title={t("silent.discardTitle")} confirmLabel={t("silent.discard")} cancelLabel={t("silent.keepWriting")}
      onCancel={() => setDialog(null)} onConfirm={() => { saveDraft(questionId, { topic: "", body: "" }); setBody(""); setDialog(null); leave(); }} />
    <ConfirmDialog open={dialog === "ditutup"} title={t("silent.closed")} body={t("silent.closedDialogBody")}
      confirmLabel={t("silent.copy")} cancelLabel={t("ui.close")} onConfirm={() => void copyText()} onCancel={() => setDialog(null)} />
  </>;
}
