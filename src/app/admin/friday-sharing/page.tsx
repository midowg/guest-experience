import EventEditorPage from "../acara/[ref]/page";
import { fridaySharingParams } from "./current";

export const dynamic = "force-dynamic";

/** /admin/friday-sharing: the Friday Sharing editor, without an event code in the address. */
export default async function FridaySharingEditorPage() {
  return EventEditorPage({ params: fridaySharingParams() });
}
