export type EventStatus = "draft" | "published" | "archived";
export type InvitationMode = "open" | "personal";
export type SectionKey = "about" | "experience" | "agenda" | "location" | "prepare" | "rsvp" | "contact" | "feedback" | "team";
export type SectionConfig = { key: SectionKey; enabled: boolean };
export type AgendaItem = { id: string; starts_at: string; ends_at: string; title: string; description: string; sort_order: number };
export type DiscussionTopic = { title: string; description: string; en?: TextPair };
export type EventContact = { name: string; phone: string; channel: "whatsapp" | "phone"; heading: string; description: string; role: string; organization: string };
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
/** The form of the event. Audience is a separate choice: an internal event can take any form. */
export type EventKind = "kunjungan" | "acara" | "program";
export type EventAudience = "external" | "internal";
export type ThemeKey = "werkudara" | "nenek" | "gala" | "khidmat" | "segar";
export type EventTheme = { key: ThemeKey; corners: "square" | "soft" };
export type EventPhase = "before" | "day" | "after";
export type PhaseOverride = "auto" | EventPhase;
export type PlainImage = { url: string; alt: string; srcset: ImageSource[] };
export type MomentIcon = "coffee" | "utensils" | "gift" | "users" | "camera" | "music" | "map" | "sparkles" | "presentation" | "heart";
/** English version of a title/description pair; empty means "show the Indonesian text". */
export type TextPair = { title: string; description: string };
export type ExperienceMoment = { icon: MomentIcon; title: string; description: string; en?: TextPair };
/** Hospitality's story for the guest to read; never a form the guest fills in. */
export type EventExperienceContent = { title: string; story: string; image: PlainImage; moments: ExperienceMoment[] };
export type PrepareIcon = "shirt" | "backpack" | "gift" | "id-card" | "umbrella" | "sun" | "footprints" | "utensils" | "camera" | "pill" | "package" | "info";
/** One free-form card: dress code, what to bring, what the organiser provides, or anything else. */
export type PrepareItem = { icon: PrepareIcon; title: string; description: string; list: string[]; en?: TextPair & { list: string[] } };
export type PrepareContent = { title: string; intro: string; items: PrepareItem[] };
export type EventLanguage = "id" | "en" | "id_en";
/** English text for single fields. Agenda rows live in their own table, so they are keyed by id here. */
export type EnglishContent = {
  title: string; subtitle: string; greeting: string; introduction: string; closing: string; arrival_notes: string; day_note: string;
  experience_title: string; experience_story: string; prepare_title: string; prepare_intro: string; after_title: string; after_message: string;
  contact_heading: string; contact_description: string; feedback_description: string; review_heading: string; review_description: string; review_button_label: string;
  agenda: Record<string, TextPair>;
};
export type EventTranslations = { en: EnglishContent };
/**
 * Optional depth for one agenda item (Program, Trip klien): a teaser that opens a "Did you know?"
 * box, a longer story, where it happens, and the presentation page. Keyed by agenda id, because
 * agenda rows live in their own table.
 */
export type AgendaDetail = { teaser: string; did_you_know: string; more_story: string; place: string; pdf_page: number | null };
export type EmergencyContact = { name: string; phone: string; hospital: string; hospital_address: string; hospital_maps_url: string };
export type RouteStep = { title: string; description: string; image: PlainImage };
export type RouteGuide = { map_image: PlainImage; steps: RouteStep[] };
export type AfterContent = {
  title: string; message: string; image: PlainImage;
  collaboration: { enabled: boolean; title: string; description: string; button_label: string };
};
export type EventRecord = {
  id: string; slug: string; status: EventStatus; title: string; subtitle: string;
  /** Short code for /AB23CD addresses; absent before migration 202610210004. */
  code?: string;
  organizer: string; greeting: string; introduction: string; closing: string;
  starts_at: string; ends_at: string | null; timezone: string;
  venue_name: string; address: string; location_url: string; location_embed_url: string; location_display: "manual" | "embed"; arrival_notes: string;
  review_url: string; review_enabled: boolean; review_heading: string; review_description: string; review_button_label: string; rsvp_enabled: boolean; rsvp_closes_at: string | null;
  invitation_mode: InvitationMode;
  feedback_enabled: boolean; feedback_opens_at: string | null; feedback_description: string;
  contact: EventContact; team_image: { url: string; alt: string; srcset: ImageSource[] };
  sections: SectionConfig[]; topics: DiscussionTopic[]; agenda: AgendaItem[];
  feedback_questions: FeedbackQuestion[];
  venue_image_url: string; venue_image_alt: string; venue_image_credit: string;
  hero: HeroImage; gallery: GalleryImage[];
  event_kind: EventKind; audience: EventAudience; theme: EventTheme; phase_override: PhaseOverride;
  experience: EventExperienceContent; route: RouteGuide; day_note: string; after: AfterContent; prepare: PrepareContent; language: EventLanguage; translations: EventTranslations; guest_estimate: number | null;
  agenda_details: Record<string, AgendaDetail>; presentation_pdf_url: string; emergency: EmergencyContact;
  created_at: string; updated_at: string;
};
export type Dietary = "vegetarian" | "allergy" | "other";
export type AccessNeed = "wheelchair" | "companion" | "sign_interpreter" | "other";
export type RsvpInput = {
  name: string; organization: string; attendance: "yes" | "no";
  phone: string; email: string; has_allergy: boolean; allergy_details: string;
  /** Since 202610200004; absent on answers read before that migration. */
  party_size?: number; companion_names?: string[]; dietary?: Dietary[]; dietary_other?: string;
  access?: AccessNeed[]; access_other?: string; photo_opt_out?: boolean; whatsapp_consent?: boolean;
  consent: boolean; website: string; idempotency_key: string;
};
export type RsvpRecord = Omit<RsvpInput, "website" | "consent" | "idempotency_key"> & { id: string; event_id: string; invitation_id?: string | null; created_at: string; updated_at?: string };
export type FeedbackInput = { idempotency_key: string; website: string; answers: { question_id: string; value: string }[] };
export type FeedbackRecord = { id: string; event_id: string; created_at: string; answers: { question_id: string; label: string; value: string }[] };
export type ApiResult<T = undefined> = { ok: true; data?: T; message: string } | { ok: false; message: string; fieldErrors?: Record<string, string[]> };
export type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number };
