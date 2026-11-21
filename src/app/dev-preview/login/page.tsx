import { notFound } from "next/navigation";
import { LoginScreen } from "@/components/admin/shared/LoginScreen";

export const dynamic = "force-dynamic";

/** Masuk admin in both looks, without a session or the setting: ?tampilan=kartu|lampu. Signing in is refused here. */
export default async function DevLogin({ searchParams }: { searchParams: Promise<{ tampilan?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <LoginScreen style={(await searchParams).tampilan === "lampu" ? "lampu" : "kartu"} configured next="/admin" expired={false} />;
}
