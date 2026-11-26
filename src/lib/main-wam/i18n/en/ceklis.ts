import type { idCeklis } from "../id/ceklis";

export const enCeklis: Record<keyof typeof idCeklis, string> = {
  "ceklis.heading": "Checklist",
  "ceklis.progress": "Checklist · {done} of {total}",
  "ceklis.progressSr": "Checklist, {done} of {total} ticked",
  "ceklis.all": "Agree to all",
  "ceklis.allBusy": "Ticking…",
  "ceklis.ready": "All set",
  "ceklis.reminder": "A reminder from the committee, ticking is not required.",
  "ceklis.saveFailed": "Not saved. Try again.",
  "ceklis.photoOf": "Photo of {text}",
  "ceklis.chip": "Checklist {n}",
  "ceklis.tabPrep": "Preparation",
  "ceklis.homeReminder": "Checklist not complete · {done} of {total}",
  "ceklis.homeReminderOpen": "Open checklist",
  "srv.ceklis.itemNotFound": "Item not found. Reload the checklist.",
  "srv.ceklis.noChecklist": "This agenda has no checklist.",
};
