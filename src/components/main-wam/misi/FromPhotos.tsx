"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, ScanSearch } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { Banner, Button, Pill } from "@/components/main-wam/ui";
import { misiDetectApi } from "@/lib/main-wam/misi/detect-routes";
import type { FromPhoto, MisiView } from "@/lib/main-wam/misi/missions";
import { mainWamApi } from "@/lib/routes";
import { AutoSwitch } from "./AutoSwitch";
import { useNum } from "./MisiParts";
import { errorText, misiRequest } from "./request";
import page from "./misi.module.css";
import css from "./misi-from.module.css";

/**
 * "Dari fotomu" on the Misi page (docs/main-wam/KONTRAK.md §13): my Momen photos that meet a mission. One that was sent by itself shows where it
 * stands and "Tarik" while nobody has decided; one that is only suggested has "Ajukan" and "Abaikan". Below: my switch "Deteksi misi
 * otomatis" and "Periksa fotoku" (the newest photos that were never looked at, at most 30). Mode demo (`view.sample`) changes nothing on the server.
 */
export function FromPhotos({ view }: { view: MisiView }) {
  const t = useT();
  const num = useNum();
  const router = useRouter();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const key = (row: FromPhoto) => `${row.photoId}:${row.missionId}`;
  const rows = (view.fromPhotos ?? []).filter(row => !gone.has(key(row)));

  async function run(row: FromPhoto, work: () => Promise<unknown>, after: () => void) {
    setBusy(key(row)); setProblem(null);
    try { if (!view.sample) await work(); after(); if (!view.sample) router.refresh(); }
    catch (error) { setProblem(errorText(error)); }
    finally { setBusy(null); }
  }
  const takeBack = (row: FromPhoto) => run(row, () => misiRequest(misiDetectApi.takeBack(row.missionId), { method: "DELETE" }), () => setGone(current => new Set(current).add(key(row))));
  const submit = (row: FromPhoto) => run(row, () => misiRequest(misiDetectApi.submit(row.missionId), { method: "POST", json: { photoId: row.photoId } }), () => setSent(current => new Set(current).add(key(row))));
  const dismiss = (row: FromPhoto) => run(row, () => misiRequest(misiDetectApi.submit(row.missionId), { method: "DELETE", json: { photoId: row.photoId } }), () => setGone(current => new Set(current).add(key(row))));

  async function check() {
    if (view.sample) { setReport(t("misi.from.checked", { n: 12, m: 2 })); return; }
    setChecking(true); setProblem(null); setReport(null);
    try {
      const answer = await misiRequest<{ checked: number; results: unknown[] }>(misiDetectApi.checkMine, { method: "POST" });
      const { checked, results } = answer.data;
      setReport(!checked ? t("misi.from.checkedNone") : results.length ? t("misi.from.checked", { n: checked, m: results.length }) : t("misi.from.checkedNoMatch", { n: checked }));
      router.refresh();
    } catch (error) { setProblem(errorText(error) || t("misi.from.checkFailed")); }
    finally { setChecking(false); }
  }

  const stateWord = (row: FromPhoto, locallySent: boolean) => {
    if (locallySent) return t("misi.row.review");
    return row.state === "done" ? t("misi.row.doneSr") : row.state === "pending" ? t("misi.row.pending") : row.state === "review" ? t("misi.row.review") : row.state === "rejected" ? t("misi.status.rejected") : "";
  };

  const title = t("misi.from.title", { n: rows.length });
  const split = title.indexOf(" · ") < 0 ? title.length : title.indexOf(" · ");
  return <section aria-labelledby="misi-from" className={page.section}>
    <div className={page.sectionHead}>
      <h2 id="misi-from" className={page.secTitle}><b>{title.slice(0, split)}</b>{title.slice(split)}</h2>
    </div>
    <p className={css.lead}>{t("misi.from.lead")}</p>
    {problem && <Banner tone="error">{problem}</Banner>}
    {rows.length > 0
      ? <ul className={page.rows}>
        {rows.map(row => {
          const mine = sent.has(key(row));
          const asSuggestion = row.outcome === "saran" && !mine;
          return <li key={key(row)} className={css.item} data-kind={asSuggestion ? "saran" : "diajukan"}>
            {/* eslint-disable-next-line @next/next/no-img-element -- my own Momen photo (an API address) or the demo picture */}
            <img className={css.thumb} src={row.thumb ?? mainWamApi.photoFile(row.photoId, "kecil")} alt={t("misi.from.photoAlt", { title: row.title })} loading="lazy" />
            <span className={css.text}>
              <b>{row.title}</b>
              <span className={css.pills}>
                <Pill tone={asSuggestion ? "neutral" : "primary"}>{asSuggestion ? t("misi.from.suggested") : mine ? t("misi.from.sentByYou") : t("misi.from.sent")}</Pill>
                <Pill tone={row.status === "cocok" ? "success" : "warning"}>{row.status === "cocok" ? t("misi.from.sure") : t("misi.from.maybe")}</Pill>
              </span>
              {!asSuggestion && <small>{stateWord(row, mine)}</small>}
            </span>
            <span className={css.points}>+{num(row.points)}</span>
            <span className={css.actions}>
              {asSuggestion
                ? <>
                  <Button size="m" loading={busy === key(row)} onClick={() => void submit(row)}>{t("misi.auto.submit")}</Button>
                  <Button size="m" variant="secondary" disabled={busy === key(row)} onClick={() => void dismiss(row)}>{t("misi.from.dismiss")}</Button>
                </>
                : (row.canTakeBack || mine) && <Button size="m" variant="secondary" loading={busy === key(row)} onClick={() => void takeBack(row)}>{t("misi.auto.takeBack")}</Button>}
            </span>
          </li>;
        })}
      </ul>
      : <div className={css.empty}>
        <ImageIcon aria-hidden />
        <p><b>{t("misi.from.empty")}</b><span>{t("misi.from.emptyHint")}</span></p>
      </div>}
    <div className={css.tools}>
      <AutoSwitch initial={view.autoDetect ?? true} saved={view.autoDetectSaved ?? false} sample={view.sample} />
      <Button variant="secondary" icon={<ScanSearch />} loading={checking} loadingLabel={t("misi.from.checking")} onClick={() => void check()}>{t("misi.from.check")}</Button>
      {report && <p className={css.report} role="status">{report}</p>}
    </div>
  </section>;
}
