import { z } from "zod";

/**
 * Inbound channel message — matches Kairos's
 * ChannelMessageNotificationSchema pattern.
 *
 * MCP servers send this notification to push messages into Vigil's pipeline.
 */
export const ChannelMessageSchema = z.object({
  method: z.literal("notifications/vigil/channel"),
  params: z.object({
    content: z.string(),
    // Opaque passthrough — thread_id, user, platform metadata.
    // Rendered as attributes on the <channel> tag.
    meta: z.record(z.string(), z.string()).optional(),
  }),
});
export type ChannelMessage = z.infer<typeof ChannelMessageSchema>;

/**
 * Permission reply from a channel server.
 * Server parses the user's reply and emits {request_id, behavior}.
 */
export const ChannelPermissionSchema = z.object({
  method: z.literal("notifications/vigil/channel/permission"),
  params: z.object({
    request_id: z.string(),
    behavior: z.enum(["allow", "deny"]),
  }),
});
export type ChannelPermission = z.infer<typeof ChannelPermissionSchema>;

/**
 * Channel server capability declaration.
 * Server must expose this in capabilities to be eligible.
 */
export interface ChannelCapability {
  "vigil/channel": Record<string, never>;
  "vigil/channel/permission"?: Record<string, never>;
}

/**
 * Registered channel entry — tracks an MCP server that can push messages.
 */
export interface ChannelEntry {
  kind: "plugin" | "server";
  name: string;
  serverUrl: string;
  /** Loaded via --dangerously-load-development-channels */
  dev?: boolean;
  capabilities: ChannelCapability;
}

/**
 * Wrap a channel message in XML tags for LLM consumption.
 * The model sees where the message came from and decides how to respond.
 */
export function wrapChannelMessage(source: string, content: string, meta?: Record<string, string>): string {
  const attrs = meta
    ? Object.entries(meta)
        .map(([k, v]) => ` ${escapeXmlAttr(k)}="${escapeXmlAttr(v)}"`)
        .join("")
    : "";

  return `<channel source="${escapeXmlAttr(source)}"${attrs}>\n${content}\n</channel>`;
}

function escapeXmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
