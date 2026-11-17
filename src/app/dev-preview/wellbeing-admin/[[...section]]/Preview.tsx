"use client";

import { useState } from "react";
import { installAdminMock } from "@/components/wellbeing-admin/preview-mock";
import { WellbeingAdmin } from "@/components/wellbeing-admin/WellbeingAdmin";

/** The preview's client half: the sample answers are in place before the first request. */
export function AdminPreview({ notReady }: { notReady: boolean }) {
  useState(() => { installAdminMock({ notReady }); return true; });
  return <WellbeingAdmin person={{ name: "Admin (pratinjau)", sub: "Wellbeing" }} basePath="/dev-preview/wellbeing-admin" />;
}
