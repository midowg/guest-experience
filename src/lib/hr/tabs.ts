import { HR_PATH, hrPath } from "@/lib/routes";

/*
 * WG People's bottom menu (21 Nov 2026): five places, like a phone app (Tim, the team's cuti and
 * dinas, joined the same day). Each has its own address
 * (a reload or a shared link opens the same place), but moving between them only swaps what is shown;
 * nothing is fetched again. Pure, so it is tested without a browser.
 */
export const HR_TABS = ["beranda", "riwayat", "tim", "pengajuan", "profil"] as const;
export type HrTab = (typeof HR_TABS)[number];

export const hrTabPaths: Record<HrTab, string> = { beranda: hrPath.home, riwayat: hrPath.history, tim: hrPath.team, pengajuan: hrPath.requests, profil: hrPath.profile };
export const hrTabLabels: Record<HrTab, string> = { beranda: "Beranda", riwayat: "Riwayat", tim: "Tim", pengajuan: "Pengajuan", profil: "Profil" };
/** The places with an address of their own under /hr (Beranda is /hr itself). */
export const HR_SUB_TABS = ["riwayat", "tim", "pengajuan", "profil"] as const satisfies readonly HrTab[];

/** Which place an address shows; anything else (the home, a preview page) is Beranda. */
export function tabOf(path: string | null | undefined): HrTab {
  const rest = path?.startsWith(`${HR_PATH}/`) ? path.slice(HR_PATH.length + 1).split(/[/?#]/)[0] : "";
  return (HR_SUB_TABS as readonly string[]).includes(rest) ? rest as HrTab : "beranda";
}
