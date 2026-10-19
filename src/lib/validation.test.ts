import { describe, expect, it } from 'vitest';
import { eventSchema, rsvpSchema, feedbackSchema } from './validation';
import { createSeedEvent } from './seed-event';
import { formatDate, formatTime, toJakartaInput, fromJakartaInput } from './format';
const rsvp = { name: 'Tamu Pengujian', organization: 'Organisasi Pengujian', attendance: 'yes', phone: '', email: '', has_allergy: false, allergy_details: '', consent: true, website: '', idempotency_key: 'f0d26d64-2ab8-4d7a-80b5-328a132ea2cc' };
describe('RSVP', () => {
  it('accepts optional contacts', () => expect(rsvpSchema.safeParse(rsvp).success).toBe(true));
  it('requires allergy details if attending with an allergy', () => expect(rsvpSchema.safeParse({...rsvp, has_allergy:true}).success).toBe(false));
  it('discards irrelevant allergy data for non-attendees', () => expect(rsvpSchema.parse({...rsvp, attendance:'no', has_allergy:true, allergy_details:'stale'}).allergy_details).toBe(''));
  it('requires consent and rejects honeypot', () => { expect(rsvpSchema.safeParse({...rsvp, consent:false}).success).toBe(false); expect(rsvpSchema.safeParse({...rsvp, website:'spam'}).success).toBe(false); });
});
describe('event publication', () => {
  it('accepts source draft', () => expect(eventSchema.safeParse(createSeedEvent()).success).toBe(true));
  it('blocks enabled survey without questions', () => expect(eventSchema.safeParse({...createSeedEvent(), status:'published', feedback_enabled:true}).success).toBe(false));
  it('requires manual fields only for a published manual location', () => {
    const event = { ...createSeedEvent(), status: 'published' as const, venue_name: '', address: '', location_url: '' };
    const manual = eventSchema.safeParse(event);
    expect(manual.success).toBe(false);
    if (!manual.success) expect(manual.error.issues.map(issue => issue.path.join('.'))).toEqual(expect.arrayContaining(['venue_name', 'address', 'location_url']));
    const embed = { ...event, location_display: 'embed' as const, location_embed_url: 'https://www.google.com/maps/embed?pb=!1m18' };
    expect(eventSchema.safeParse(embed).success).toBe(true);
    expect(eventSchema.safeParse({ ...embed, location_embed_url: '' }).success).toBe(false);
    expect(eventSchema.safeParse({ ...embed, status: 'draft' as const, location_embed_url: '' }).success).toBe(false);
  });
  it('preserves explicit manual mode with a saved embed and infers legacy documents', () => {
    const event = { ...createSeedEvent(), location_embed_url: 'https://www.google.com/maps/embed?pb=!1m18' };
    expect(eventSchema.parse(event).location_display).toBe('manual');
    const legacy = { ...event } as Partial<typeof event>;
    delete legacy.location_display;
    expect(eventSchema.parse(legacy).location_display).toBe('embed');
  });
  it('blocks unsafe URL schemes and duplicate sections', () => { expect(eventSchema.safeParse({...createSeedEvent(), location_url:'javascript:alert(1)'}).success).toBe(false); const e=createSeedEvent(); e.sections.push(e.sections[0]); expect(eventSchema.safeParse(e).success).toBe(false); });
});
describe('invitation mode', () => {
  it('defaults older event documents to open', () => {
    const legacy = { ...createSeedEvent() } as Partial<ReturnType<typeof createSeedEvent>>;
    delete legacy.invitation_mode;
    expect(eventSchema.parse(legacy).invitation_mode).toBe('open');
  });
  it('accepts personal mode and rejects unknown modes', () => {
    expect(eventSchema.parse({ ...createSeedEvent(), invitation_mode: 'personal' }).invitation_mode).toBe('personal');
    expect(eventSchema.safeParse({ ...createSeedEvent(), invitation_mode: 'private' }).success).toBe(false);
  });
});

describe('PIC contact', () => {
  it('keeps older events valid without a contact field', () => {
    const legacy = { ...createSeedEvent() } as Partial<ReturnType<typeof createSeedEvent>>;
    delete legacy.contact;
    expect(eventSchema.parse(legacy).contact).toEqual({ name: '', phone: '', channel: 'whatsapp', heading: '', description: '', role: '', organization: '' });
  });
  it('accepts an empty contact, local 08, and older +62 contacts for either channel', () => {
    expect(eventSchema.safeParse(createSeedEvent()).success).toBe(true);
    for (const channel of ['whatsapp', 'phone'] as const) for (const phone of ['0812 3456 7890', '+62 812 3456 7890', '6281234567890']) expect(eventSchema.safeParse({ ...createSeedEvent(), contact: { name: 'Panitia', phone, channel } }).success).toBe(true);
  });
  it('requires the name and number together and rejects invalid numbers', () => {
    for (const contact of [
      { name: 'Panitia', phone: '', channel: 'phone' },
      { name: '', phone: '+62 812 3456 7890', channel: 'phone' },
      { name: 'Panitia', phone: '071234567890', channel: 'whatsapp' },
      { name: 'Panitia', phone: '+62;alert(1)', channel: 'phone' },
    ]) expect(eventSchema.safeParse({ ...createSeedEvent(), contact }).success).toBe(false);
  });
});

describe('optional guide content', () => {
  it('defaults new fields on an older document without changing its sections', () => {
    const legacy = { ...createSeedEvent(), contact: { name: 'Raja', phone: '0811 2831 929', channel: 'whatsapp' } } as Partial<ReturnType<typeof createSeedEvent>>;
    delete legacy.team_image;
    delete legacy.review_heading;
    delete legacy.review_description;
    delete legacy.review_button_label;
    delete legacy.feedback_description;
    legacy.sections = legacy.sections?.filter(section => section.key !== 'team');
    const parsed = eventSchema.parse(legacy);
    expect(parsed.contact).toMatchObject({ heading: '', description: '', role: '', organization: '' });
    expect(parsed.team_image).toEqual({ url: '', alt: '', srcset: [] });
    expect(parsed.sections.some(section => section.key === 'team')).toBe(false);
    expect(parsed.review_description).toBe('');
  });
  it('accepts custom descriptions and a team photo with alt text', () => {
    const event = createSeedEvent();
    event.contact = { ...event.contact, heading: 'Any questions?', role: 'Hospitality Specialist', organization: 'Werkudara Group' };
    event.review_description = 'Bagikan pengalaman Anda.';
    event.team_image = { url: 'https://example.test/team.jpg', alt: 'Tim Werkudara', srcset: [] };
    expect(eventSchema.safeParse(event).success).toBe(true);
    expect(eventSchema.safeParse({ ...event, team_image: { ...event.team_image, alt: '' } }).success).toBe(false);
    expect(eventSchema.safeParse({ ...event, contact: { ...event.contact, description: 'a'.repeat(1001) } }).success).toBe(false);
    expect(eventSchema.safeParse({ ...event, team_image: { ...event.team_image, url: 'javascript:alert(1)' } }).success).toBe(false);
    expect(eventSchema.safeParse({ ...event, team_image: { url: '', alt: '', srcset: [{ width: 100, url: 'https://example.test/x.jpg' }] } }).success).toBe(false);
  });
});

describe('URL fields never throw on partial input', () => {
  // Typing an address a character at a time must mark the field, not crash the editor.
  const partials = ['h', 'ht', 'http', 'https', 'https:', 'https:/', 'https://', 'contoh.test', '://x', 'https://', ' '];
  it('reports malformed gallery URLs as validation errors', () => {
    for (const url of partials) {
      const parse = () => eventSchema.safeParse({ ...createSeedEvent(), gallery: [{ id: 'b1d26d64-2ab8-4d7a-80b5-328a132ea2cc', url, alt: 'Foto', caption: '', sort_order: 0, srcset: [] }] });
      expect(parse).not.toThrow();
      expect(parse().success).toBe(false);
    }
  });
  it('reports malformed optional URLs as validation errors', () => {
    for (const key of ['location_url', 'review_url', 'venue_image_url'] as const) {
      for (const url of partials.filter(value => value.trim())) {
        const parse = () => eventSchema.safeParse({ ...createSeedEvent(), [key]: url });
        expect(parse).not.toThrow();
        expect(parse().success).toBe(false);
      }
      expect(eventSchema.safeParse({ ...createSeedEvent(), [key]: '' }).success).toBe(true);
    }
  });
});

describe('hero backdrop', () => {
  const hero = { url: 'https://example.test/latar.jpg', alt: '', srcset: [{ width: 1024, url: 'https://example.test/latar-1024.webp' }], focus: 'center', text_position: 'left' };
  it('accepts a backdrop with sizes', () => expect(eventSchema.safeParse({ ...createSeedEvent(), hero }).success).toBe(true));
  // The description field was removed from the editor, so a photo without one is normal.
  it('accepts a backdrop with no description', () => expect(eventSchema.safeParse({ ...createSeedEvent(), hero: { ...hero, alt: '' } }).success).toBe(true));
  it('accepts a description when one is supplied', () => expect(eventSchema.safeParse({ ...createSeedEvent(), hero: { ...hero, alt: 'Halaman depan kantor' } }).success).toBe(true));
  it('accepts both text positions and rejects anything else', () => {
    for (const text_position of ['left', 'center']) expect(eventSchema.safeParse({ ...createSeedEvent(), hero: { ...hero, text_position } }).success).toBe(true);
    expect(eventSchema.safeParse({ ...createSeedEvent(), hero: { ...hero, text_position: 'bottom-left' } }).success).toBe(false);
    expect(eventSchema.safeParse({ ...createSeedEvent(), hero: { ...hero, focus: 'sideways' } }).success).toBe(false);
  });
  it('rejects non-HTTPS sizes and sizes without a backdrop', () => {
    expect(eventSchema.safeParse({ ...createSeedEvent(), hero: { ...hero, srcset: [{ width: 1024, url: 'http://example.test/x.webp' }] } }).success).toBe(false);
    expect(eventSchema.safeParse({ ...createSeedEvent(), hero: { ...hero, url: '' } }).success).toBe(false);
  });
  it('accepts an event with no backdrop at all', () => expect(eventSchema.safeParse(createSeedEvent()).success).toBe(true));
});

describe('gallery', () => {
  const image = { id: 'b1d26d64-2ab8-4d7a-80b5-328a132ea2cc', url: 'https://example.test/foto.jpg', alt: 'Pintu masuk kantor', caption: '', sort_order: 0, srcset: [] };
  it('accepts an approved HTTPS image with a description', () => expect(eventSchema.safeParse({ ...createSeedEvent(), gallery: [image] }).success).toBe(true));
  // A venue photo without a description is decorative, which is a legitimate choice.
  it('accepts an image without a description', () => expect(eventSchema.safeParse({ ...createSeedEvent(), gallery: [{ ...image, alt: '' }] }).success).toBe(true));
  it('rejects non-HTTPS and script URLs', () => {
    for (const url of ['http://example.test/foto.jpg', 'javascript:alert(1)']) {
      expect(eventSchema.safeParse({ ...createSeedEvent(), gallery: [{ ...image, url }] }).success).toBe(false);
    }
  });
  it('rejects duplicated image ids', () => expect(eventSchema.safeParse({ ...createSeedEvent(), gallery: [image, { ...image, sort_order: 1 }] }).success).toBe(false));
});

describe('WIB dates', () => {
  it('uses confirmed Monday date', () => expect(formatDate(createSeedEvent().starts_at)).toContain('Senin'));
  it('shows arrival 18.00 WIB', () => expect(formatTime(createSeedEvent().starts_at)).toBe('18.00'));
  it('round trips local input without OS timezone dependence', () => expect(toJakartaInput(fromJakartaInput('2026-10-12T18:00'))).toBe('2026-10-12T18:00'));
});
it('rejects duplicated feedback questions', () => expect(feedbackSchema.safeParse({idempotency_key:rsvp.idempotency_key, website:'', answers:[{question_id:rsvp.idempotency_key,value:'1'},{question_id:rsvp.idempotency_key,value:'2'}]}).success).toBe(false));

describe('journey content', () => {
  it('fills kind, audience, theme, phase, and content defaults for an older document', () => {
    const legacy = { ...createSeedEvent() } as Partial<ReturnType<typeof createSeedEvent>>;
    for (const key of ['event_kind', 'audience', 'theme', 'phase_override', 'experience', 'route', 'day_note', 'after'] as const) delete legacy[key];
    legacy.sections = legacy.sections?.filter(section => section.key !== 'experience');
    const parsed = eventSchema.parse(legacy);
    expect(parsed).toMatchObject({ event_kind: 'acara', audience: 'external', theme: { key: 'werkudara', corners: 'square' }, phase_override: 'auto', day_note: '' });
    expect(parsed.experience).toEqual({ title: '', story: '', image: { url: '', alt: '', srcset: [] }, moments: [] });
    expect(parsed.route.steps).toEqual([]);
    expect(parsed.after.collaboration.enabled).toBe(false);
  });
  it('accepts a full journey and rejects unknown themes, icons, and too many items', () => {
    const event = createSeedEvent();
    event.theme = { key: 'gala', corners: 'soft' };
    event.experience.moments = [{ icon: 'coffee', title: 'Sambutan', description: '' }];
    event.route.steps = [{ title: 'Belok kiri', description: '', image: { url: 'https://example.test/turn.jpg', alt: 'Titik belok', srcset: [] } }];
    expect(eventSchema.safeParse(event).success).toBe(true);
    expect(eventSchema.safeParse({ ...event, theme: { key: 'neon', corners: 'square' } }).success).toBe(false);
    expect(eventSchema.safeParse({ ...event, experience: { ...event.experience, moments: [{ icon: 'rocket', title: 'X', description: '' }] } }).success).toBe(false);
    expect(eventSchema.safeParse({ ...event, route: { ...event.route, steps: Array.from({ length: 7 }, () => event.route.steps[0]) } }).success).toBe(false);
  });
  it('requires a description for every journey photo', () => {
    const event = createSeedEvent();
    event.route.steps = [{ title: 'Belok kiri', description: '', image: { url: 'https://example.test/turn.jpg', alt: '', srcset: [] } }];
    const result = eventSchema.safeParse(event);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map(issue => issue.path.join('.'))).toContain('route.steps.0.image.alt');
    expect(eventSchema.safeParse({ ...createSeedEvent(), after: { ...createSeedEvent().after, image: { url: 'https://example.test/a.jpg', alt: '', srcset: [] } } }).success).toBe(false);
  });
});
