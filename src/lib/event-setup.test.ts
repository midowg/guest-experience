import { describe, expect, it } from "vitest";
import { createSeedEvent } from "./seed-event";
import { eventSchema } from "./validation";
import { buildEventFromSetup, copyEventWithSetup, createBlankEvent, setupSchema, setupTodo, slugify, type EventSetup } from "./event-setup";
import { eventTemplates } from "./event-templates";

let n = 0;
const ids = () => ({ id: "5e7a0c1e-0000-4000-8000-000000000001", now: "2026-10-20T03:00:00.000Z", uuid: () => `5e7a0c1e-0000-4000-8000-${String(++n).padStart(12, "0")}` });
const base: EventSetup = {
  template: "gala-dinner", title: "Malam Apresiasi 2026", starts_at: "2026-12-12T11:00:00.000Z", ends_at: "2026-12-12T15:00:00.000Z",
  timezone: "Asia/Jakarta", audience: "external", language: "id", invitation_mode: "personal", location: "other",
  venue_name: "Hotel Tentrem", address: "Jl. P. Mangkubumi 72A, Yogyakarta", location_url: "",
  greeting: "", introduction: "", closing: "", modules: ["about", "agenda", "location", "prepare", "rsvp", "contact", "feedback"],
  guest_estimate: 120, rsvp_closes_at: "2026-12-05T10:00:00.000Z", contact_name: "", contact_phone: "", pic_staff_id: "",
};

describe("buildEventFromSetup", () => {
  it("applies the template's kind, theme, sections and starting cards, but writes no sample sentences", () => {
    const event = buildEventFromSetup(base, ids());
    expect(event).toMatchObject({ event_kind: "acara", theme: { key: "gala" }, title: "Malam Apresiasi 2026", status: "draft", guest_estimate: 120, invitation_mode: "personal" });
    expect(event.greeting).toBe("");
    expect(event.introduction).toBe("");
    expect(event.topics).toEqual([]);
    expect(event.agenda).toEqual([]);
    expect(event.sections.filter(section => section.enabled).map(section => section.key)).toEqual(["about", "agenda", "location", "prepare", "rsvp", "contact", "feedback"]);
    expect(event.prepare.items.map(item => item.title)).toEqual(["Dress code"]);
    expect(event.feedback_enabled).toBe(true);
    expect(event.feedback_questions.map(question => question.kind)).toEqual(["rating", "text", "text"]);
    expect(event.slug).toMatch(/^malam-apresiasi-2026-5e7a0c1e$/);
    expect(eventSchema.safeParse(event).success).toBe(true);
  });

  it("keeps the sentences the admin chose, and the Werkudara office when picked", () => {
    const event = buildEventFromSetup({ ...base, greeting: "Dengan hormat", location: "werkudara", venue_name: "PT. Werkudara", address: "Jl. Bhinneka No. 09", location_url: "https://maps.app.goo.gl/x" }, ids());
    expect(event).toMatchObject({ greeting: "Dengan hormat", venue_name: "PT. Werkudara", location_url: "https://maps.app.goo.gl/x" });
  });

  it("never turns on the Google review for an internal event, and skips the survey when not chosen", () => {
    const event = buildEventFromSetup({ ...base, template: "nyadran", audience: "internal", modules: ["about", "rsvp"] }, ids());
    expect(event.review_enabled).toBe(false);
    expect(event.feedback_enabled).toBe(false);
    expect(event.feedback_questions).toEqual([]);
    expect(event.theme.key).toBe("khidmat");
  });

  it("gives every template a valid draft", () => {
    for (const template of eventTemplates) expect(eventSchema.safeParse(buildEventFromSetup({ ...base, template: template.key, modules: template.modules.filter(key => key !== "team") as EventSetup["modules"] }, ids())).success, template.key).toBe(true);
  });
});

describe("createBlankEvent", () => {
  it("carries none of the sample event's text", () => {
    const blank = createBlankEvent();
    const seed = createSeedEvent();
    for (const key of ["title", "subtitle", "organizer", "greeting", "introduction", "closing", "venue_name", "address"] as const) expect(blank[key], key).toBe("");
    expect(blank.topics).toEqual([]);
    expect(blank.agenda).toEqual([]);
    expect(seed.title).not.toBe("");
  });
});

describe("copyEventWithSetup", () => {
  it("moves the whole schedule to the new date and renews ids", () => {
    const source = createSeedEvent();
    source.translations.en.agenda = { [source.agenda[0].id]: { title: "Arrival", description: "" } };
    source.rsvp_closes_at = "2026-10-10T10:00:00+07:00";
    const week = 7 * 24 * 3600 * 1000;
    const startsAt = new Date(Date.parse(source.starts_at) + week).toISOString();
    const copy = copyEventWithSetup(source, { ...base, template: "blank", starts_at: startsAt, ends_at: null, rsvp_closes_at: null, modules: ["about", "agenda", "rsvp"] }, ids());
    expect(copy.title).toBe("Malam Apresiasi 2026");
    expect(copy.introduction).toBe(source.introduction);
    expect(Date.parse(copy.agenda[0].starts_at) - Date.parse(source.agenda[0].starts_at)).toBe(week);
    expect(Date.parse(copy.rsvp_closes_at!) - Date.parse(source.rsvp_closes_at)).toBe(week);
    expect(copy.agenda.every((item, index) => item.id !== source.agenda[index].id)).toBe(true);
    expect(copy.translations.en.agenda[copy.agenda[0].id]).toEqual({ title: "Arrival", description: "" });
    expect(eventSchema.safeParse(copy).success).toBe(true);
  });
});

describe("setupSchema", () => {
  it("rejects an end before the start and a PIC without a number", () => {
    const result = setupSchema.safeParse({ ...base, ends_at: "2026-12-12T10:00:00.000Z", contact_name: "Raja" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map(issue => issue.path.join("."))).toEqual(expect.arrayContaining(["ends_at", "contact_phone"]));
  });
});

describe("setupTodo and slugify", () => {
  it("lists what is still to write", () => {
    const todo = setupTodo({ ...base, language: "id_en" });
    expect(todo).toEqual(expect.arrayContaining(["Isi undangan (blok Identitas & undangan)", "Rundown: sesi dan jamnya", "Kartu persiapan: Dress code", "Kontak PIC", "Terjemahan English (blok Bahasa & terjemahan)"]));
    expect(setupTodo({ ...base, introduction: "Ada isi" })).not.toContain("Isi undangan (blok Identitas & undangan)");
  });
  it("makes readable slugs", () => {
    expect(slugify("Kunjungan PT Sinar Abadi — 2026!")).toBe("kunjungan-pt-sinar-abadi-2026");
    expect(slugify("¿¿")).toBe("acara");
  });
});

describe("copying activity details", () => {
  it("moves details to the copied sessions' new ids", () => {
    const source = createSeedEvent();
    source.agenda_details = { [source.agenda[1].id]: { teaser: "Cuplikan", did_you_know: "Fakta", more_story: "", place: "Pendopo", pdf_page: null } };
    const copy = copyEventWithSetup(source, { ...base, template: "blank", starts_at: source.starts_at, ends_at: null, rsvp_closes_at: null, modules: ["about", "agenda"] }, ids());
    expect(copy.agenda_details).toEqual({ [copy.agenda[1].id]: source.agenda_details[source.agenda[1].id] });
    expect(copy.agenda_details[source.agenda[1].id]).toBeUndefined();
  });
});

describe("a Kunjungan Kantor from its template", () => {
  const visit: EventSetup = { ...base, template: "kunjungan-klien", title: "Kunjungan PT Sinar Abadi", location: "werkudara", venue_name: "PT. Werkudara", address: "Jl. Bhinneka No. 09", location_url: "https://maps.app.goo.gl/x", modules: ["about", "agenda", "location", "team", "rsvp", "contact", "feedback"] };

  it("starts at the office with the route, the host's role and Werkudara as host; arrival points belong to Panduan lokasi", () => {
    const event = buildEventFromSetup(visit, ids());
    expect(event.event_kind).toBe("kunjungan");
    expect(event.organizer).toBe("Werkudara Group");
    expect(event.contact.role).toBe("Hospitality Specialist");
    expect(event.route.steps.map(step => step.title)).toEqual(["Lewat Jl. Pondok Raya", "Belok di Jl. Bhinneka", "Parkir di depan kantor"]);
    expect(event.route.points).toEqual([]);
    // Only the visit's own parts are on: no experience story, no preparation cards.
    expect(event.sections.filter(section => section.enabled).map(section => section.key).sort()).toEqual(["about", "agenda", "contact", "feedback", "location", "rsvp", "team"]);
    expect(eventSchema.safeParse(event).success).toBe(true);
  });

  it("leaves the office route out of a visit somewhere else", () => {
    const event = buildEventFromSetup({ ...visit, location: "other", venue_name: "Hotel Tentrem", address: "Jl. P. Mangkubumi 72A" }, ids());
    expect(event.route.steps).toEqual([]);
    expect(event.route.points).toEqual([]);
  });
});
