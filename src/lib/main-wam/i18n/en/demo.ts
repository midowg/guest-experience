import type { idDemo } from "../id/demo";

export const enDemo: Record<keyof typeof idDemo, string> = {
  "demo.banner": "Demo mode · sample data",
  "demo.title": "Demo mode",
  "demo.hint": "The data on these screens is sample data. View Main WAM as another role; actions here are not saved.",
  "demo.switchLabel": "View as",
  "demo.role.peserta": "Participant",
  "demo.role.panitia": "Committee",
  "demo.role.bod": "BOD",
  "demo.switched": "Now viewing as {role}",
  "demo.switchFailed": "The choice could not be saved on this device",
};
