"use client";

import { useMemo } from "react";
import type { CmsView, LrContent } from "@/lib/leadership-reset/form";
import { cmsApi, formApi } from "./api";

import { Cms } from "./Cms";
import { ReflectionForm } from "./ReflectionForm";

/** The screens wired to the real APIs (a server page cannot hand functions to the browser). */
export function LiveReflectionForm(props: { content: LrContent; isOpen: boolean; now: string }) {
  return <ReflectionForm {...props} api={formApi} />;
}
export function LiveCms({ cmsKey, initial }: { cmsKey: string; initial: CmsView }) {
  const api = useMemo(() => cmsApi(cmsKey), [cmsKey]);
  return <Cms cmsKey={cmsKey} initial={initial} api={api} />;
}
