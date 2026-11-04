"use client";

import { EventPagesMenu } from "@/components/admin/shared/EventPagesMenu";
import { praWamPath } from "@/lib/routes";
import { wamGroups, type WamSectionKey } from "./sections";

/**
 * Admin WAM's sections behind the same grouped dropdown as an event's pages, with the way into
 * the app itself beside it. `badges` puts a count next to a section (open reset requests).
 */
export function WamNav({ current, badges = {} }: { current: WamSectionKey; badges?: Partial<Record<WamSectionKey, string>> }) {
  return <EventPagesMenu<WamSectionKey> label="Bagian admin WAM" current={current} publicHref={praWamPath.home} publicLabel="Buka aplikasi WAM"
    groups={wamGroups().map(group => ({ label: group.label, pages: group.sections.map(section => ({ tab: section.key, label: section.label, href: section.href, icon: section.icon, badge: badges[section.key] })) }))} />;
}
