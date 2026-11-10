import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Booking Kantor: the office's booking app, for people signed in only. */
export const metadata: Metadata = { title: { default: "Booking Kantor", template: "%s · Booking Kantor" }, applicationName: "Booking Kantor", robots: { index: false } };

export default function BookingLayout({ children }: { children: ReactNode }) {
  return children;
}
