"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { mockApi, sampleMe, type MockOptions } from "@/components/wellbeing/mock-api";
import { WellbeingApp } from "@/components/wellbeing/WellbeingApp";
import { WellbeingLogin } from "@/components/wellbeing/WellbeingLogin";

const BASE = "/dev-preview/wellbeing";

/** The dev preview's client half: the sample API lives here, for the whole visit. */
export function WellbeingPreview({ options, login }: { options: Omit<MockOptions, "onSignOut">; login: boolean }) {
  const router = useRouter();
  const [api] = useState(() => mockApi({ ...options, onSignOut: () => router.push(`${BASE}?masuk=1`) }));
  if (login) return <WellbeingLogin next={null} />;
  return <WellbeingApp me={sampleMe} api={api} basePath={BASE} />;
}
