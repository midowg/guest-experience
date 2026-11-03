"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PRA_WAM_PATH } from "@/lib/routes";
import styles from "./pra-wam.module.css";

/**
 * Makes WAM move like an app: a tap on any link to another WAM page changes the screen in place
 * (client navigation) instead of loading a whole new page, and the pages behind visible links
 * are fetched ahead. Links to files and APIs (documents, QR PDF), new tabs, downloads and
 * modified clicks keep the browser's own behaviour. While the next screen loads, the current one
 * stays with a thin bar at the top, as in an app, instead of a full loading screen.
 */
export function WamNavigator() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [going, setGoing] = useState(false);
  // The new screen has arrived: hide the bar.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the route change itself
  useEffect(() => { setGoing(false); }, [pathname, search]);
  useEffect(() => {
    const inApp = (anchor: HTMLAnchorElement) => {
      if (anchor.target && anchor.target !== "_self") return null;
      if (anchor.hasAttribute("download")) return null;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return null;
      if (url.pathname !== PRA_WAM_PATH && !url.pathname.startsWith(`${PRA_WAM_PATH}/`)) return null;
      if (/\.[a-z0-9]+$/i.test(url.pathname)) return null; // sw.js, icons, manifest
      return url;
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const url = inApp(anchor);
      if (!url) return;
      event.preventDefault();
      const here = `${window.location.pathname}${window.location.search}`;
      const there = `${url.pathname}${url.search}${url.hash}`;
      if (there !== here) { setGoing(true); router.push(there); }
    };
    // Fetch the pages behind the menu and other visible links ahead of the tap.
    const seen = new Set<string>();
    const prefetch = () => {
      for (const anchor of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        const url = inApp(anchor);
        if (!url) continue;
        const target = `${url.pathname}${url.search}`;
        if (seen.has(target)) continue;
        seen.add(target);
        router.prefetch(target);
      }
    };
    document.addEventListener("click", onClick);
    const idle = window.setTimeout(prefetch, 300);
    const observer = new MutationObserver(() => { window.clearTimeout(idle); window.setTimeout(prefetch, 300); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { document.removeEventListener("click", onClick); window.clearTimeout(idle); observer.disconnect(); };
  }, [router]);
  return going ? <div className={styles.progress} role="progressbar" aria-label="Memuat halaman" /> : null;
}
