import { redirect } from "next/navigation";
import { superAdminPath } from "@/lib/routes";

/** Visibilitas acara now lives with the templates, per kind of event; older links still arrive there. */
export default function SuperVisibilityPage() {
  redirect(superAdminPath.templates);
}
