import type { Viewport } from "next";
import { cookies } from "next/headers";
import { copies } from "@/lib/hr/copy";
import { asLang, LANG_COOKIE } from "@/lib/hr/lang";
import { HrForgot } from "@/components/hr/HrAuth";

/** The status bar takes the blue of the page top. */
export const viewport: Viewport = { themeColor: "#1551A0" };
export async function generateMetadata() {
  return { title: copies[asLang((await cookies()).get(LANG_COOKIE)?.value)].auth.forgotTitle };
}

/** Lupa password: a request to reset the account to the first password (the same requests as WAM's). */
export default function HrForgotPage() {
  return <HrForgot />;
}
