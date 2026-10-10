import { z } from "zod";
import { eventSchema, photoFrameSchema } from "./validation";

export const heroPreviewSchema = z.object(eventSchema.shape).pick({
  hero: true, title: true, subtitle: true, greeting: true, starts_at: true, ends_at: true,
  timezone: true, venue_name: true, address: true, sections: true, rsvp_enabled: true,
  feedback_enabled: true, feedback_questions: true,
}).extend({
  title: z.string().max(180),
  starts_at: z.union([z.literal(""), z.iso.datetime({ offset: true })]),
});
export type HeroPreviewEvent = Omit<z.infer<typeof heroPreviewSchema>, "timezone"> & { timezone: string };
export const previewUpdateSchema = z.object({ type: z.literal("hero:update"), event: heroPreviewSchema, editing: z.boolean() });
export const frameChangeSchema = z.object({ type: z.literal("hero:frame"), device: z.enum(["mobile", "desktop"]), frame: photoFrameSchema });
