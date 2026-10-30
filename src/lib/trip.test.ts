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

describe("trip parts around the rest of the platform", () => {
  it("dials a landline written with (0)", () => {
    expect(dialNumber("+62 (0)274 586688")).toBe("0274586688");
  });
  it("tells an English reader that trip details are Indonesian only", async () => {
    const { localizeEvent } = await import("./wording/localize");
    expect(localizeEvent(smTdnYogyakarta(), "en").fallback).toBe(true);
  });
  it("keeps a started transport leg so the schema can ask for its carrier", () => {
    const event = smTdnYogyakarta();
    event.trip.transport.legs = [{ ...event.trip.transport.legs[0], carrier: "", number: "", from: "", to: "", departs: "", arrives: "" }];
    const prepared = prepareEvent(event);
    expect(prepared.trip.transport.legs).toHaveLength(1);
    expect(eventSchema.safeParse(prepared).error?.issues[0].path).toEqual(["trip", "transport", "legs", 0, "carrier"]);
  });
  it("leaves trip parts out of the notes of events that are not a Program", async () => {
    const { hiddenSectionReasons } = await import("@/components/admin/editor/editor-model");
    expect(hiddenSectionReasons(createSeedEvent()).join(" ")).not.toMatch(/Transportasi|Hotel|Do & don't|Kontak bantuan/);
    const empty = { ...smTdnYogyakarta(), trip: emptyTrip() };
    expect(hiddenSectionReasons(empty).join(" ")).toMatch(/Hotel masih kosong \(isi nama hotel\)/);
  });
});

describe("pictures in the handbook", () => {
  const picture = (n: number) => ({ url: `https://example.test/${n}.webp`, alt: `Gambar ${n}`, srcset: [] });
  it("keeps day covers, card pictures and place photos through saving", () => {
    const event = smTdnYogyakarta();
    const first = event.agenda[2].id;
    event.trip.day_covers = [{ day: "2026-11-05", image: picture(1) }];
    event.prepare.items[2].images = [picture(2), { url: "", alt: "", srcset: [] }];
    event.agenda_details[first] = { ...event.agenda_details[first], photo: picture(3) };
    const parsed = eventSchema.parse(prepareEvent(event));
    expect(parsed.trip.day_covers).toEqual([{ day: "2026-11-05", image: picture(1) }]);
    expect(parsed.prepare.items[2].images).toEqual([picture(2)]);
    expect(parsed.agenda_details[first].photo).toEqual(picture(3));
  });
  it("asks for a description of every picture", () => {
    const event = smTdnYogyakarta();
    event.trip.day_covers = [{ day: "2026-11-05", image: { ...picture(1), alt: "" } }];
    expect(eventSchema.safeParse(event).error?.issues[0].path).toEqual(["trip", "day_covers", 0, "image", "alt"]);
  });
  it("drops an empty place photo instead of storing it", () => {
    const event = smTdnYogyakarta();
    const first = event.agenda[2].id;
    event.agenda_details[first] = { ...event.agenda_details[first], photo: { url: "", alt: "", srcset: [] } };
    expect(prepareEvent(event).agenda_details[first]).not.toHaveProperty("photo");
  });
});

describe("photo beside the introduction", () => {
  it("is kept on save and needs a description", () => {
    const event = smTdnYogyakarta();
    event.about_image = { url: "https://example.test/tugu.webp", alt: "Tugu", srcset: [] };
    expect(eventSchema.parse(prepareEvent(event)).about_image?.url).toBe("https://example.test/tugu.webp");
    event.about_image = { ...event.about_image, alt: "" };
    expect(eventSchema.safeParse(event).error?.issues[0].path).toEqual(["about_image", "alt"]);
  });
});
