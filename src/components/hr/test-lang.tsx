import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import type { Lang } from "@/lib/hr/lang";
import { LangProvider } from "./lang";

/** Tests only: a WG People screen drawn in one language (without a provider it is English, the default). */
export const renderIn = (lang: Lang, ui: ReactElement, options?: RenderOptions) =>
  render(ui, { ...options, wrapper: ({ children }: { children: ReactNode }) => <LangProvider initial={lang}>{children}</LangProvider> });
