"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleCheck, Info, Lock } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { DEMO_CEKLIS_COOKIE } from "@/lib/main-wam/ceklis/sample";
import type { ChecklistItemView } from "@/lib/main-wam/ceklis/ceklis";
import { mainWamApi } from "@/lib/routes";
import { failText, mwRequest } from "../request";
import css from "./ceklis.module.css";

type Answer = { checked: string[]; progress: { done: number; total: number; complete: boolean } };

/** How long after the last tick the screens behind (Agenda's chips, Absen's lock) are read again. */
const REFRESH_AFTER_MS = 700;

/** Mode demo: the ticked sample items, kept in a cookie of this device for a day. */
function writeDemoTicks(ids: ReadonlySet<string>) {
  document.cookie = `${DEMO_CEKLIS_COOKIE}=${[...ids].join(",")}; Path=/; Max-Age=86400; SameSite=Lax`;
}

/**
 * The checklist of an agenda (Persiapan berangkat: jaket, perlengkapan ibadah, ...): the progress, a
 * line saying whether it is required before absen, each item with its photo and note and a check, and
 * "Setuju semua". A tick shows at once and is sent in the background (a refusal puts it back and says
 * so in the sheet, not in a toast: a toast would be behind the open sheet). Mode demo's sample items
 * cannot be saved (every write is refused there), so their ticks live in a cookie of this device,
 * which the server reads for the lock on Absen.
 */
export function Checklist({ sessionId, items, required, sample = false }: { sessionId: string; items: ChecklistItemView[]; required: boolean; sample?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [checked, setChecked] = useState(() => new Set(items.filter(item => item.checked).map(item => item.id)));
  const [problem, setProblem] = useState("");
  const [busyAll, setBusyAll] = useState(false);
  const inFlight = useRef(0);
  const refresh = useRef<number | undefined>(undefined);

  // The server's own answer wins when nothing is on its way (after a refresh, or another device).
  const serverKey = useMemo(() => items.map(item => `${item.id}:${item.checked ? 1 : 0}`).join(","), [items]);
  useEffect(() => {
    if (inFlight.current === 0) setChecked(new Set(items.filter(item => item.checked).map(item => item.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serverKey stands for items
  }, [serverKey]);
  useEffect(() => () => window.clearTimeout(refresh.current), []);

  const done = items.filter(item => checked.has(item.id)).length;
  const total = items.length;
  const complete = done === total;

  const later = () => { window.clearTimeout(refresh.current); refresh.current = window.setTimeout(() => router.refresh(), REFRESH_AFTER_MS); };
  const keepDemo = (ids: Set<string>) => { writeDemoTicks(ids); later(); };

  async function send(next: Set<string>, body: { itemId: string; checked: boolean } | { all: true }, before: Set<string>) {
    setProblem("");
    setChecked(next);
    if (sample) { keepDemo(next); return; }
    inFlight.current += 1;
    try {
      const { data } = await mwRequest<Answer>(mainWamApi.checklist(sessionId), { method: "POST", json: body });
      if (inFlight.current === 1) setChecked(new Set(data.checked));
      later();
    } catch (error) {
      setChecked(before);
      setProblem(`${t("ceklis.saveFailed")} ${failText(error)}`);
    } finally { inFlight.current -= 1; }
  }

  const toggle = (id: string) => {
    const next = new Set(checked);
    const on = !next.has(id);
    if (on) next.add(id); else next.delete(id);
    void send(next, { itemId: id, checked: on }, checked);
  };
  const all = async () => {
    setBusyAll(true);
    await send(new Set(items.map(item => item.id)), { all: true }, checked);
    setBusyAll(false);
  };

  return <section className={css.box} aria-labelledby={`ceklis-${sessionId}`}>
    <div className={css.head}>
      <h3 id={`ceklis-${sessionId}`} className={css.cap}>{t("ceklis.progress", { done, total })}</h3>
      {!complete && <button type="button" className={css.all} disabled={busyAll} onClick={() => void all()}>{busyAll ? t("ceklis.allBusy") : t("ceklis.all")}</button>}
    </div>
    <span className={css.bar} role="progressbar" aria-label={t("ceklis.progressSr", { done, total })} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <span className={css.barFill} style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
    </span>
    <p className={css.rule}>{required ? <Lock aria-hidden /> : <Info aria-hidden />}<span>{required ? t("ceklis.required") : t("ceklis.reminder")}</span></p>
    <ul className={css.list}>
      {items.map(item => {
        const on = checked.has(item.id);
        return <li key={item.id}>
          <label className={css.item} data-on={on || undefined}>
            <input type="checkbox" className={css.input} checked={on} onChange={() => toggle(item.id)} />
            {item.photoVersion && /* eslint-disable-next-line @next/next/no-img-element -- a private storage address behind a redirect */
              <img className={css.photo} src={mainWamApi.checklistPhoto(item.id, item.photoVersion)} alt="" loading="lazy" decoding="async" width={64} height={64} />}
            <span className={css.text}>
              <span className={css.title}>{item.text}</span>
              {item.note && <span className={css.note}>{item.note}</span>}
            </span>
            <span className={css.mark} aria-hidden>{on && <Check />}</span>
          </label>
        </li>;
      })}
    </ul>
    {problem && <p className={css.problem} role="alert">{problem}</p>}
    {complete && <p className={css.ready} role="status"><CircleCheck aria-hidden />{t("ceklis.ready")}</p>}
  </section>;
}
