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
  it('blocks unsafe URL schemes and duplicate sections', () => { expect(eventSchema.safeParse({...createSeedEvent(), location_url:'javascript:alert(1)'}).success).toBe(false); const e=createSeedEvent(); e.sections.push(e.sections[0]); expect(eventSchema.safeParse(e).success).toBe(false); });
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
