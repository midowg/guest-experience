import type { idCeklis } from "../id/ceklis";

export const enCeklis: Record<keyof typeof idCeklis, string> = {
  "ceklis.heading": "Checklist",
  "ceklis.progress": "Checklist · {done} of {total}",
  "ceklis.progressSr": "Checklist, {done} of {total} ticked",
  "ceklis.all": "Agree to all",
  "ceklis.allBusy": "Ticking…",
  "ceklis.ready": "All set",
  "ceklis.required": "Must be complete before you check in at the next agenda.",
  "ceklis.reminder": "A reminder from the committee, ticking is not required.",
  "ceklis.saveFailed": "Not saved. Try again.",
  "ceklis.photoOf": "Photo of {text}",
  "ceklis.chip": "Checklist {n}",
  "ceklis.chipFirst": "Checklist first",
  "ceklis.tabPrep": "Preparation",
  "ceklis.homeReminder": "Checklist not complete · {done} of {total}",
  "ceklis.homeReminderOpen": "Open checklist",
  "absen.ceklisFirst": "Finish the checklist first",
  "absen.ceklisBody": "The checklist in {title} ({done}/{total}) must be complete before you check in.",
  "absen.ceklisOpen": "Open checklist",
};
