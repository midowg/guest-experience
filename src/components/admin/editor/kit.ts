import type { ReactNode } from "react";
import type { AdminModule } from "@/lib/admin-modules";
import type { EventRecord } from "@/lib/types";

/** Changes one field of the draft; the editor tracks which block became unsaved. */
export type Update = <K extends keyof EventRecord>(key: K, value: EventRecord[K]) => void;

export type ControlOptions = { multiline?: boolean; hint?: string; type?: "text" | "url" | "datetime-local"; maxLength?: number; suggestions?: string[] };
/** A labelled input or textarea whose id is the field path, with example text and chips from suggestions.ts. */
export type Control = (name: string, label: string, value: string, onChange: (value: string) => void, options?: ControlOptions) => ReactNode;

export type TextKey = "title" | "slug" | "subtitle" | "organizer" | "greeting" | "introduction" | "closing" | "venue_name" | "address" | "location_url" | "arrival_notes" | "review_url" | "review_heading" | "review_description" | "review_button_label" | "feedback_description" | "venue_image_url" | "venue_image_alt" | "venue_image_credit";
export type TimeKey = "starts_at" | "ends_at" | "rsvp_closes_at" | "feedback_opens_at";
export type BooleanKey = "rsvp_enabled" | "feedback_enabled" | "review_enabled";
export type Choices = <T extends string>(name: string, legend: string, options: { value: T; label: string }[], current: T, onPick: (value: T) => void, describe?: (value: T) => string | undefined) => ReactNode;

/**
 * Everything a block's form needs, built once by EventEditor. A new block takes `{ kit }`, reads
 * `kit.event`, and writes through `kit.update`, so it never holds its own copy of the draft.
 */
export type EditorKit = {
  event: EventRecord;
  update: Update;
  errors: Record<string, string[]>;
  control: Control;
  text: (key: TextKey, label: string, maxLength: number, multiline?: boolean, hint?: string) => ReactNode;
  time: (key: TimeKey, label: string, hint?: string) => ReactNode;
  toggle: (key: BooleanKey, label: string) => ReactNode;
  choices: Choices;
  /** "WIB", "WITA" or "WIT" for the event's zone. */
  tz: string;
  /** A module the super admin switched off and this event does not use. */
  unavailable: (key: AdminModule) => boolean;
  sectionUnavailable: (key: string) => boolean;
};
