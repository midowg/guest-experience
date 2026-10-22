import "server-only";
import type { PosterDesign } from "@/lib/poster";
import type { PosterDesignInput } from "@/lib/validation";
import { createPrivilegedClient } from "./supabase/admin";
import { databaseError } from "./http";
import { ServiceError } from "./config";

const MIGRATION = "202610220002_poster_designs.sql";
const columns = "id,name,description,template,created_at";
const notMigrated = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205"].includes(error.code ?? "") || /poster_designs/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Pustaka desain poster menunggu migrasi ${MIGRATION}.`);

/** Saved Studio Poster designs, newest first. Empty before the migration. */
export async function listPosterDesigns(): Promise<{ designs: PosterDesign[]; migrated: boolean }> {
  const { data, error } = await createPrivilegedClient().from("poster_designs").select(columns).order("created_at", { ascending: false }).limit(200);
  if (error) { if (notMigrated(error)) return { designs: [], migrated: false }; databaseError(error); }
  return { designs: (data ?? []) as PosterDesign[], migrated: true };
}

export async function createPosterDesign(input: PosterDesignInput): Promise<PosterDesign> {
  const { data, error } = await createPrivilegedClient().from("poster_designs").insert(input).select(columns).single();
  if (error) { if (notMigrated(error)) throw waiting(); databaseError(error); }
  return data as PosterDesign;
}

/** Events keep their own copy, so removing a design changes no poster already set up. */
export async function deletePosterDesign(id: string): Promise<void> {
  const { error } = await createPrivilegedClient().from("poster_designs").delete().eq("id", id);
  if (error) { if (notMigrated(error)) throw waiting(); databaseError(error); }
}
