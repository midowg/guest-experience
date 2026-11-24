"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Hourglass, MapPin } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { ScreenContent } from "@/components/main-wam/shell";
import { Banner, Button, EmptyState, EyebrowLabel } from "@/components/main-wam/ui";
import { DEMO_WRITE_MESSAGE } from "@/lib/main-wam/demo";
import type { MissionItem } from "@/lib/main-wam/misi/missions";
import { mainWamApi, mainWamPath } from "@/lib/routes";
import { useNum } from "./MisiParts";
import { PlaceBanner } from "./PlaceBanner";
import { currentFix, useMissionPlace } from "./useMissionPlace";
import { errorText, misiRequest } from "./request";
import css from "./misi.module.css";

/**
 * A check-in mission: where the person stands, judged by the server against the mission's area (the
 * coordinates never reach the phone), and one button that stays locked until they are inside. The
 * position is read again at the tap and judged again; nothing here trusts the first reading.
 */
export function MissionCheckIn({ item, demo = false }: { item: MissionItem; demo?: boolean }) {
  const t = useT();
  const num = useNum();
  const router = useRouter();
  const { place, check } = useMissionPlace(item.id, "checkin", { demo, hasPlace: item.hasPlace, radiusM: item.radiusM });
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<"disetujui" | "menunggu" | null>(null);
  const inside = place.status === "ready" && place.answer.inside;

  async function checkIn() {
    if (working) return;
    if (demo) { setProblem(DEMO_WRITE_MESSAGE); return; }
    setWorking(true); setProblem(null);
    try {
      const position = await currentFix();
      const done = await misiRequest<{ status: "disetujui" | "menunggu" }>(mainWamApi.missionCheckIn(item.id), { method: "POST", json: { position } });
      setResult(done.data.status);
      router.refresh();
    } catch (error) {
      setProblem(error instanceof Error && !("status" in error) ? t("misi.loc.offNote") : errorText(error));
      void check();
    } finally { setWorking(false); }
  }

  if (result) {
    const approved = result === "disetujui";
    return <ScreenContent>
      <EmptyState icon={approved ? <CheckCircle2 /> : <Hourglass />} title={approved ? t("misi.checkin.doneTitle") : t("misi.cam.pendingTitle")}
        action={<Button block href={mainWamPath.missions}>{t("misi.cam.backToMissions")}</Button>}>
        {approved ? t("misi.checkin.doneBody", { points: num(item.points) }) : t("misi.cam.pendingBody")}
      </EmptyState>
    </ScreenContent>;
  }

  return <ScreenContent>
    <div className={css.head}>
      <div className={css.headText}>
        <EyebrowLabel tone="gold">{t("misi.sheet.points", { points: num(item.points) })}</EyebrowLabel>
        <h2 className={css.headTitle}>{item.title}</h2>
      </div>
    </div>
    <PlaceBanner place={place} item={item} onCheck={() => void check()} />
    {problem && <Banner tone="error">{problem}</Banner>}
    <Button block size="l" icon={<MapPin />} disabled={!inside} loading={working} loadingLabel={t("misi.checkin.working")} onClick={() => void checkIn()}>
      {t("misi.checkin.button", { points: num(item.points) })}
    </Button>
  </ScreenContent>;
}
