import { notFound } from "next/navigation";
import { EditorOptions } from "./EditorOptions";

export const dynamic = "force-dynamic";

/** Three directions for the event editor (A tiga kolom, B pratinjau besar, C editor tema), sample data: ?opsi=a|b|c. */
export default async function DevEditorOptions({ searchParams }: { searchParams: Promise<{ opsi?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const opsi = (await searchParams).opsi;
  return <EditorOptions initial={opsi === "a" || opsi === "b" || opsi === "c" ? opsi : "d"} />;
}
