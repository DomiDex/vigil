import { z } from "zod";

export const FindingSchema = z.object({
  severity: z.enum(["info", "warning", "critical"]),
  title: z.string(),
  detail: z.string(),
  file: z.string().nullable().optional(),
  line: z.number().nullable().optional(),
  suggestion: z.string().nullable().optional(),
});

export const SpecialistResponseSchema = z.object({
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  skippedReason: z.string().nullable().optional(),
});
