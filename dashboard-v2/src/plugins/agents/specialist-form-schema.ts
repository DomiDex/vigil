import { z } from "zod";

export const TRIGGER_EVENT_OPTIONS = [
  "new_commit",
  "file_change",
  "action_executed",
] as const;

export const specialistFormSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .regex(/^[a-z0-9-]+$/, "Lowercase alphanumeric and hyphens only"),
  class: z.enum(["deterministic", "analytical"]),
  description: z.string().min(1, "Description is required"),
  model: z.string().optional(),
  triggerEvents: z.array(z.string()).min(1, "At least one trigger event required"),
  watchPatterns: z.array(z.string()).optional(),
  systemPrompt: z.string().optional(),
  cooldownSeconds: z.number().int().min(0).optional(),
  severityThreshold: z.enum(["info", "warning", "critical"]).optional(),
});

export type SpecialistFormData = z.infer<typeof specialistFormSchema>;
