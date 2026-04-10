import * as z from "zod";

/**
 * Message status labels (Kairos BriefTool pattern).
 * Downstream routing uses these for channel filtering.
 *
 * - 'normal': responding to a detected event
 * - 'proactive': surfacing something unsolicited (risk, pattern, insight)
 * - 'scheduled': triggered by a cron/scheduled task
 * - 'alert': high-priority, needs immediate attention
 */
export const MessageStatus = z.enum(["normal", "proactive", "scheduled", "alert"]);
export type MessageStatus = z.infer<typeof MessageStatus>;

/**
 * Attachment metadata — resolved at send time.
 */
export const AttachmentSchema = z.object({
  path: z.string(),
  size: z.number(),
  isImage: z.boolean(),
  mimeType: z.string().optional(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

/**
 * Core message schema — the structured unit of Vigil output.
 * Every notification, alert, and insight flows through this.
 */
export const VigilMessageSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  source: z.object({
    repo: z.string(),
    branch: z.string().optional(),
    event: z.string().optional(),
    agent: z.string().optional(),
  }),
  status: MessageStatus,
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  message: z.string(),
  attachments: z.array(AttachmentSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type VigilMessage = z.infer<typeof VigilMessageSchema>;

/**
 * Create a VigilMessage with sensible defaults filled in.
 */
export function createMessage(
  partial: Pick<VigilMessage, "source" | "status" | "message"> & Partial<VigilMessage>,
): VigilMessage {
  return VigilMessageSchema.parse({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    severity: "info",
    attachments: [],
    metadata: {},
    ...partial,
  });
}
