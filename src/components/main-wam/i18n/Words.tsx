"use client";

import type { MessageKey, Vars } from "@/lib/main-wam/i18n";
import { useT } from "./LangProvider";

/**
 * A fixed text in the current language, for a server component that cannot call a hook:
 * `<Words k="ui.see" />`. For a text in an attribute (aria-label), use a client component with useT().
 */
export function Words({ k, vars }: { k: MessageKey; vars?: Vars }) {
  return <>{useT()(k, vars)}</>;
}
