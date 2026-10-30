"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { CreateEventDialog } from "@/components/admin/events/CreateEventDialog";
import type { EventRecord } from "@/lib/types";

export function DevCreateEvent({ events }: { events: EventRecord[] }) {
  const [open, setOpen] = useState(true);
  return <>{!open && <Button type="button" onClick={() => setOpen(true)}>Buat acara</Button>}{open && <CreateEventDialog events={events} templates={["kunjungan-klien", "trip-klien", "handbook-trip"]} onClose={() => setOpen(false)} />}</>;
}
