import type { ReactNode } from "react";
import { PageHeader, PageTabs, type PageTab } from "@/components/console";
import { wamAdminPath } from "@/lib/routes";
import { wamCrumbs, wamSection } from "../sections";

export type AccountsTab = "akun" | "peran" | "reset";

/** The tabs of Akun dan peran; Permintaan reset keeps its own address and shows how many wait. */
export function accountTabs(waiting: number | null): PageTab[] {
  return [
    { key: "akun", label: "Akun", href: wamAdminPath.accounts },
    { key: "peran", label: "Peran", href: wamAdminPath.roles },
    { key: "reset", label: "Permintaan reset", href: wamAdminPath.resetRequests, badge: waiting ? String(waiting) : undefined, badgeLabel: "permintaan reset menunggu" },
  ];
}

const crumbsOf: Record<AccountsTab, () => ReturnType<typeof wamCrumbs>> = {
  akun: () => wamCrumbs("akun"),
  peran: () => wamCrumbs("akun", "Peran"),
  reset: () => wamCrumbs("reset"),
};

/**
 * The top of every Akun dan peran tab: the breadcrumb, "Akun dan peran", how many have an account
 * and signed in (`subtitle`), the actions, and the tabs.
 */
export function AccountsHeader({ tab, subtitle, actions, waiting }: { tab: AccountsTab; subtitle?: ReactNode; actions?: ReactNode; waiting: number | null }) {
  return <>
    <PageHeader crumbs={crumbsOf[tab]()} title={wamSection("akun").label} subtitle={subtitle} actions={actions} />
    <PageTabs label="Bagian akun dan peran" current={tab} tabs={accountTabs(waiting)} />
  </>;
}
