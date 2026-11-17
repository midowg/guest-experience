import { after, NextResponse } from "next/server";
import { handleStravaEvent, stravaConfig, webhookToken, type StravaEvent } from "@/lib/server/wellbeing/strava";

export const dynamic = "force-dynamic";

/** GET: Strava checks the webhook when it is made (Admin WLM → Pengaturan → Strava): echo its challenge, with our token. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const config = stravaConfig();
  if (!config || query.get("hub.mode") !== "subscribe" || query.get("hub.verify_token") !== webhookToken(config.clientSecret)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ "hub.challenge": query.get("hub.challenge") ?? "" });
}

/**
 * POST: one event (an activity made, changed or deleted; access removed). Strava wants an answer
 * within two seconds: it is answered at once and handled after (handleStravaEvent trusts nothing in it).
 */
export async function POST(request: Request) {
  let event: StravaEvent | null = null;
  try { event = (await request.json()) as StravaEvent; } catch { /* not JSON: nothing to do */ }
  if (event && typeof event === "object") {
    const received = event;
    after(async () => {
      try { await handleStravaEvent(received); }
      catch (error) { console.error("Strava event failed", received.object_type, received.aspect_type, error instanceof Error ? error.message : error); }
    });
  }
  return NextResponse.json({ ok: true });
}
