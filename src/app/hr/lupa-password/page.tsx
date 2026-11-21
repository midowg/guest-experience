import type { Viewport } from "next";
import { HrForgot } from "@/components/hr/HrAuth";

/** The status bar takes the blue of the page top. */
export const viewport: Viewport = { themeColor: "#1551A0" };
export const metadata = { title: "Lupa password" };

/** Lupa password: a request to reset the account to the first password (the same requests as WAM's). */
export default function HrForgotPage() {
  return <HrForgot />;
}
