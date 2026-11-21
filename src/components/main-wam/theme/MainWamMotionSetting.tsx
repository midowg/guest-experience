"use client";

import { useState } from "react";
import { mainWamMotionCookie } from "@/lib/main-wam/appearance";
import { Switch } from "../ui/Switch";

/** Calms the app at once: the root's attribute cuts every animation (theme.module.css); the cookie keeps it for the next page. */
export function applyMainWamMotion(reduce: boolean) {
  document.cookie = mainWamMotionCookie(reduce, location.protocol === "https:");
  document.querySelectorAll("[data-main-wam]").forEach(node => {
    if (reduce) node.setAttribute("data-mw-reduce", ""); else node.removeAttribute("data-mw-reduce");
  });
}

/** Kurangi gerak (Pengaturan): a switch, kept on this device. Name it with `labelledBy` (the row's title). */
export function MainWamMotionSwitch({ initial, labelledBy }: { initial: boolean; labelledBy: string }) {
  const [reduce, setReduce] = useState(initial);
  return <Switch checked={reduce} labelledBy={labelledBy} onChange={next => { setReduce(next); applyMainWamMotion(next); }} />;
}
