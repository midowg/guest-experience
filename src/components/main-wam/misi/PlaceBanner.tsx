"use client";

import { MapPin, MapPinOff } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { Banner } from "@/components/main-wam/ui";
import type { MissionItem } from "@/lib/main-wam/misi/missions";
import type { Place } from "./useMissionPlace";

/**
 * The location line of the camera and the check-in ("Lokasi aktif · 18 m dari Alun-alun Batu · di dalam
 * area misi", or why not). Words and a tone, never colour alone; the action asks again.
 */
export function PlaceBanner({ place, item, onCheck }: { place: Place; item: Pick<MissionItem, "placeName" | "hasPlace" | "radiusM">; onCheck: () => void }) {
  const t = useT();
  const name = item.placeName || t("misi.place.generic");
  const again = { label: t("misi.loc.recheck"), onClick: onCheck };
  switch (place.status) {
    case "idle": return <Banner tone="warning" icon={<MapPinOff />} title={t("misi.loc.off")} action={{ label: t("misi.loc.enable"), onClick: onCheck }}>{t("misi.loc.offNote")}</Banner>;
    case "reading": return <Banner tone="info" icon={<MapPin />} title={t("misi.loc.checking")} />;
    case "denied": return <Banner tone="error" icon={<MapPinOff />} title={t("misi.loc.denied")} action={again}>{t("misi.loc.deniedNote")}</Banner>;
    case "unsupported": return <Banner tone="error" icon={<MapPinOff />} title={t("misi.loc.unsupported")}>{t("misi.loc.unsupportedNote")}</Banner>;
    case "unavailable": return <Banner tone="warning" icon={<MapPinOff />} title={t("misi.loc.off")} action={again}>{t("misi.loc.offNote")}</Banner>;
    case "failed": return <Banner tone="error" icon={<MapPinOff />} action={again}>{place.message}</Banner>;
    case "ready": {
      const { answer } = place;
      if (answer.inside) {
        return <Banner tone="success" icon={<MapPin />} title={t("misi.loc.on")}>
          {answer.hasPlace && answer.distanceM !== null ? t("misi.loc.inside", { distance: answer.distanceM, place: name }) : t("misi.loc.insideNoPlace", { accuracy: answer.accuracyM })}
        </Banner>;
      }
      if (answer.reason === "terlalu-jauh") {
        return <Banner tone="warning" icon={<MapPin />} title={t("misi.loc.outside")} action={again}>
          {t("misi.loc.outsideNote", { distance: answer.distanceM ?? 0, place: name, radius: answer.radiusM })}
        </Banner>;
      }
      if (answer.reason === "tidak-akurat") return <Banner tone="warning" icon={<MapPin />} title={t("misi.loc.weak")} action={again}>{t("misi.loc.weakNote", { accuracy: answer.accuracyM })}</Banner>;
      if (answer.reason === "kedaluwarsa") return <Banner tone="warning" icon={<MapPin />} title={t("misi.loc.stale")} action={again}>{t("misi.loc.staleNote")}</Banner>;
      return <Banner tone="warning" icon={<MapPinOff />} title={t("misi.loc.off")} action={again}>{t("misi.loc.offNote")}</Banner>;
    }
  }
}
