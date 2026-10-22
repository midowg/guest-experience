import { expect, it } from "vitest";
import { adminModuleKeys, withoutModules } from "./admin-modules";
import { buildEventFromSetup, setupSchema } from "./event-setup";
import { eventTemplates } from "./event-templates";
import { normalizeEvent } from "./hero-framing";
import { eventSchema } from "./validation";

it("builds a valid draft from every template, with and without disabled modules", () => {
  for (const template of eventTemplates) for (const disabled of [[], adminModuleKeys]) {
    const setup = setupSchema.parse({
      template: template.key, title: "Contoh", starts_at: "2026-11-07T04:30:00.000Z", ends_at: null, timezone: "Asia/Jakarta", audience: template.audience, language: "id", invitation_mode: "open",
      location: "later", venue_name: "", address: "", location_url: "", greeting: "", introduction: "", closing: "", modules: template.modules.filter(key => key !== "team"), guest_estimate: null, rsvp_closes_at: null, contact_name: "", contact_phone: "", pic_staff_id: "",
    });
    const draft = withoutModules(buildEventFromSetup(setup, { id: "10f3a511-2331-4000-8000-0000000000aa", uuid: () => crypto.randomUUID(), now: "2026-10-22T00:00:00.000Z" }), disabled);
    const parsed = eventSchema.safeParse(draft);
    expect(parsed.success, `${template.key}: ${JSON.stringify(parsed.error?.issues.slice(0, 2))}`).toBe(true);
    // What save_event returns goes through normalizeEvent: it must survive the round trip.
    expect(() => normalizeEvent(parsed.data as never)).not.toThrow();
  }
});
