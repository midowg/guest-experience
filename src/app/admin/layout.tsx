import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Admin acara", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// Authentication lives on protected pages, not this layout: login must remain reachable.
export default function AdminLayout({ children }: { children: ReactNode }) { return children; }
