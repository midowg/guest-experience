import { Loading } from "@/components/ui";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";

/** Any Admin WAM 2026 page without its own loading (Ringkasan, Kuis live) while it is read. */
export default function WamAcaraLoading() { return <Loading label={`Memuat ${WAM_EVENT_ADMIN_LABEL}`} />; }
