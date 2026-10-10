export type EventStatus = "draft" | "published" | "archived";
export type SectionKey = "about" | "agenda" | "location" | "rsvp" | "feedback";
export type SectionConfig = { key: SectionKey; enabled: boolean };
export type AgendaItem = { id: string; starts_at: string; ends_at: string; title: string; description: string; sort_order: number };
export type DiscussionTopic = { title: string; description: string };
export type FeedbackQuestion = { id: string; label: string; kind: "rating" | "choice" | "text"; required: boolean; options: string[]; sort_order: number };
export type ImageSource = { width: number; url: string };
export type ImageFocus = "top" | "center" | "bottom";
/** Only left or centre: the four-corner grid was more choice than the layout needs. */
export type HeroTextPosition = "left" | "center";
/** Photos of the venue, shown under the map. `alt` is optional; `caption` describes it. */
export type GalleryImage = { id: string; url: string; alt: string; caption: string; sort_order: number; srcset: ImageSource[] };
export type PhotoFrame = { x: number; y: number; zoom: number };
export type HeroFraming = { mobile: PhotoFrame; desktop: PhotoFrame };
/** Optional framing preserves compatibility with previously saved invitations. */
export type HeroImage = { url: string; alt: string; srcset: ImageSource[]; focus: ImageFocus; text_position: HeroTextPosition; framing?: HeroFraming };
export type EventRecord = {
  id: string; slug: string; status: EventStatus; title: string; subtitle: string;
  organizer: string; greeting: string; introduction: string; closing: string;
  starts_at: string; ends_at: string | null; timezone: string;
  venue_name: string; address: string; location_url: string; location_embed_url: string; location_display: "manual" | "embed"; arrival_notes: string;
  review_url: string; review_enabled: boolean; rsvp_enabled: boolean; rsvp_closes_at: string | null;
  feedback_enabled: boolean; feedback_opens_at: string | null;
  sections: SectionConfig[]; topics: DiscussionTopic[]; agenda: AgendaItem[];
  feedback_questions: FeedbackQuestion[];
  venue_image_url: string; venue_image_alt: string; venue_image_credit: string;
  hero: HeroImage; gallery: GalleryImage[];
  created_at: string; updated_at: string;
};
export type RsvpInput = {
  name: string; organization: string; attendance: "yes" | "no";
  phone: string; email: string; has_allergy: boolean; allergy_details: string;
  consent: boolean; website: string; idempotency_key: string;
};
export type RsvpRecord = Omit<RsvpInput, "website" | "consent"> & { id: string; event_id: string; created_at: string };
export type FeedbackInput = { idempotency_key: string; website: string; answers: { question_id: string; value: string }[] };
export type FeedbackRecord = { id: string; event_id: string; created_at: string; answers: { question_id: string; label: string; value: string }[] };
export type ApiResult<T = undefined> = { ok: true; data?: T; message: string } | { ok: false; message: string; fieldErrors?: Record<string, string[]> };
export type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number };
