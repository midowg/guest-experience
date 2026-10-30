import { describe, expect, it } from "vitest";
import { prepareEvent } from "@/components/admin/editor/editor-model";
import { visibleSections } from "@/components/guest/InvitationHero";
import { buildEventFromSetup, setupSchema } from "./event-setup";
import { templateOf } from "./event-templates";
import { smTdnYogyakarta } from "./fixtures/sm-tdn-yogyakarta";
import { normalizeEvent } from "./hero-framing";
import { createSeedEvent } from "./seed-event";
import { dialNumber, emptyTrip } from "./trip";
import { eventSchema } from "./validation";

describe("trip handbook parts", () => {
  it("keeps every trip field through validation (zod drops unknown keys)", () => {
    const event = smTdnYogyakarta();
    const parsed = eventSchema.parse(prepareEvent(event));
    expect(parsed.trip).toEqual(event.trip);
    expect(parsed.agenda_details).toEqual(event.agenda_details);
  });

  it("gives older documents an empty trip", () => {
    const older: Partial<ReturnType<typeof createSeedEvent>> = createSeedEvent();
    delete older.trip;
    expect(normalizeEvent(older as never).trip).toEqual(emptyTrip());
    expect(eventSchema.parse(older).trip).toEqual(emptyTrip());
  });

  it("drops blank rows and lines before saving", () => {
    const event = smTdnYogyakarta();
    event.trip.guidelines.dos = [" Bawa air minum ", "", "  "];
    event.trip.contacts.people = [...event.trip.contacts.people, { id: "kosong", role: "", name: "", phone: "" }];
    const prepared = prepareEvent(event);
    expect(prepared.trip.guidelines.dos).toEqual(["Bawa air minum"]);
    expect(prepared.trip.contacts.people.map(person => person.name)).not.toContain("");
  });

  it("rejects a contact without a name and repeated ids", () => {
    const event = smTdnYogyakarta();
    event.trip.contacts.people = [{ id: "a", role: "Hotel", name: "", phone: "0274-2920101" }];
    expect(eventSchema.safeParse(event).success).toBe(false);
    const twice = smTdnYogyakarta();
    twice.trip.transport.legs = [twice.trip.transport.legs[0], twice.trip.transport.legs[0]];
    expect(eventSchema.safeParse(twice).error?.issues[0].path).toEqual(["trip", "transport", "legs"]);
  });

  it("shows a trip part only on a Program, and only once it has content", () => {
    const event = smTdnYogyakarta();
    expect(visibleSections(event).map(section => section.key)).toEqual(["about", "transport", "stay", "agenda", "prepare", "guidelines", "contacts"]);
    expect(visibleSections({ ...event, event_kind: "acara" }).map(section => section.key)).toEqual(["about", "agenda", "prepare"]);
    expect(visibleSections({ ...event, trip: emptyTrip() }).map(section => section.key)).toEqual(["about", "agenda", "prepare"]);
  });

  it("starts the Handbook trip template in the handbook's order", () => {
    const template = templateOf("handbook-trip")!;
    const setup = setupSchema.parse({
      template: "handbook-trip", title: "SM RO Jakarta TDN Yogyakarta", starts_at: "2026-11-05T00:45:00.000Z", ends_at: "2026-11-08T09:40:00.000Z", timezone: "Asia/Jakarta", audience: "external", language: "id", invitation_mode: "open",
      location: "later", venue_name: "", address: "", location_url: "", greeting: "", introduction: "", closing: "", modules: template.modules, guest_estimate: null, rsvp_closes_at: null, contact_name: "", contact_phone: "", pic_staff_id: "",
    });
    const draft = buildEventFromSetup(setup, { id: "10f3a511-2331-4000-8000-0000000000ab", uuid: () => crypto.randomUUID(), now: "2026-10-30T00:00:00.000Z" });
    expect(draft.event_kind).toBe("program");
    expect(draft.theme.key).toBe("keraton");
    expect(draft.sections.filter(section => section.enabled).map(section => section.key)).toEqual(["about", "transport", "stay", "agenda", "prepare", "guidelines", "contacts", "feedback"]);
    expect(draft.prepare.items.map(item => item.title)).toEqual(["Panduan busana", "Perlengkapan pribadi", "Perlengkapan acara & oleh-oleh"]);
  });

  it("dials landlines and mobile numbers as written", () => {
    expect(dialNumber("0274-2920101")).toBe("02742920101");
    expect(dialNumber("(0274) 586688")).toBe("0274586688");
    expect(dialNumber("+62 811 2546 096")).toBe("08112546096");
  });
});
