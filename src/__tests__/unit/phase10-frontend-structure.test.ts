// src/__tests__/unit/phase10-frontend-structure.test.ts
import { describe, test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_V2 = join(import.meta.dir, "../../../dashboard-v2");

async function readSource(relativePath: string): Promise<string> {
  const fullPath = join(DASHBOARD_V2, relativePath);
  const file = Bun.file(fullPath);
  if (!(await file.exists())) return "";
  return file.text();
}

describe("Phase 10: WebhookEvent and WebhookEventDetail types", () => {
  test("types/api.ts defines WebhookEvent interface", async () => {
    const source = await readSource("src/types/api.ts");
    expect(source).toContain("export interface WebhookEvent");
  });

  test("types/api.ts defines WebhookEventDetail interface", async () => {
    const source = await readSource("src/types/api.ts");
    expect(source).toContain("export interface WebhookEventDetail");
  });

  test("WebhookEventDetail has payload field", async () => {
    const source = await readSource("src/types/api.ts");
    const detailBlock = source.split("WebhookEventDetail")[1]?.split("export")[0] ?? "";
    expect(detailBlock).toContain("payload:");
  });

  test("types/api.ts defines ChannelPermissions interface", async () => {
    const source = await readSource("src/types/api.ts");
    expect(source).toContain("export interface ChannelPermissions");
  });

  test("ChannelPermissions has all 5 boolean fields", async () => {
    const source = await readSource("src/types/api.ts");
    const permBlock = source.split("ChannelPermissions")[1]?.split("export")[0] ?? "";
    expect(permBlock).toContain("read:");
    expect(permBlock).toContain("write:");
    expect(permBlock).toContain("execute:");
    expect(permBlock).toContain("admin:");
    expect(permBlock).toContain("subscribe:");
  });
});

describe("Phase 10: server function wrappers", () => {
  test("functions.ts exports testChannel", async () => {
    const source = await readSource("src/server/functions.ts");
    expect(source).toContain("testChannel");
    expect(source).toContain("/test");
    expect(source).toContain("POST");
  });

  test("functions.ts exports getWebhookEventDetail", async () => {
    const source = await readSource("src/server/functions.ts");
    expect(source).toContain("getWebhookEventDetail");
    expect(source).toContain("/api/webhooks/events/");
  });

  test("functions.ts exports updateChannelPermissions", async () => {
    const source = await readSource("src/server/functions.ts");
    expect(source).toContain("updateChannelPermissions");
    expect(source).toContain("PATCH");
    expect(source).toContain("/permissions");
  });
});

describe("Phase 10: query key — webhooks.eventDetail(id)", () => {
  test("query-keys.ts defines webhooks.eventDetail function", async () => {
    const source = await readSource("src/lib/query-keys.ts");
    expect(source).toContain("eventDetail:");
  });

  test("eventDetail returns tuple with webhooks, events, and id", async () => {
    const source = await readSource("src/lib/query-keys.ts");
    expect(source).toMatch(/eventDetail.*=>.*\[.*"webhooks".*"events".*\]/);
  });
});

describe("Phase 10: ChannelsPage.tsx — test button", () => {
  test("imports testChannel from functions", async () => {
    const source = await readSource("src/plugins/channels/ChannelsPage.tsx");
    expect(source).toContain("testChannel");
  });

  test("imports Send icon from lucide-react", async () => {
    const source = await readSource("src/plugins/channels/ChannelsPage.tsx");
    expect(source).toContain("Send");
    expect(source).toContain("lucide-react");
  });

  test("imports toast from sonner", async () => {
    const source = await readSource("src/plugins/channels/ChannelsPage.tsx");
    expect(source).toContain("toast");
    expect(source).toContain("sonner");
  });

  test("uses useMutation for test action", async () => {
    const source = await readSource("src/plugins/channels/ChannelsPage.tsx");
    expect(source).toContain("useMutation");
    expect(source).toContain("testChannel");
  });

  test("disables test button for inactive channels", async () => {
    const source = await readSource("src/plugins/channels/ChannelsPage.tsx");
    expect(source).toContain("inactive");
    expect(source).toContain("disabled");
  });

  test("shows success toast on test completion", async () => {
    const source = await readSource("src/plugins/channels/ChannelsPage.tsx");
    expect(source).toContain("toast.success");
  });

  test("shows error toast on test failure", async () => {
    const source = await readSource("src/plugins/channels/ChannelsPage.tsx");
    expect(source).toContain("toast.error");
  });
});

describe("Phase 10: ChannelsPage.tsx — permissions button", () => {
  test("imports ChannelPermissionSheet", async () => {
    const source = await readSource("src/plugins/channels/ChannelsPage.tsx");
    expect(source).toContain("ChannelPermissionSheet");
  });

  test("has state for selected channel (permSheetChannel)", async () => {
    const source = await readSource("src/plugins/channels/ChannelsPage.tsx");
    expect(source).toContain("permSheetChannel");
  });

  test("imports Shield icon", async () => {
    const source = await readSource("src/plugins/channels/ChannelsPage.tsx");
    expect(source).toContain("Shield");
  });
});

describe("Phase 10: ChannelPermissionSheet.tsx", () => {
  test("file exists", () => {
    const filePath = join(DASHBOARD_V2, "src/plugins/channels/ChannelPermissionSheet.tsx");
    expect(existsSync(filePath)).toBe(true);
  });

  test("imports Sheet components from shadcn", async () => {
    const source = await readSource("src/plugins/channels/ChannelPermissionSheet.tsx");
    expect(source).toContain("Sheet");
    expect(source).toContain("SheetContent");
    expect(source).toContain("SheetHeader");
    expect(source).toContain("SheetTitle");
    expect(source).toContain("SheetFooter");
  });

  test("imports Switch component from shadcn", async () => {
    const source = await readSource("src/plugins/channels/ChannelPermissionSheet.tsx");
    expect(source).toContain("Switch");
  });

  test("imports Label component from shadcn", async () => {
    const source = await readSource("src/plugins/channels/ChannelPermissionSheet.tsx");
    expect(source).toContain("Label");
  });

  test("defines all 5 permission keys", async () => {
    const source = await readSource("src/plugins/channels/ChannelPermissionSheet.tsx");
    expect(source).toContain('"read"');
    expect(source).toContain('"write"');
    expect(source).toContain('"execute"');
    expect(source).toContain('"admin"');
    expect(source).toContain('"subscribe"');
  });

  test("uses useQuery with enabled: open for lazy permissions fetch", async () => {
    const source = await readSource("src/plugins/channels/ChannelPermissionSheet.tsx");
    expect(source).toContain("useQuery");
    expect(source).toContain("enabled:");
  });

  test("uses useMutation for save", async () => {
    const source = await readSource("src/plugins/channels/ChannelPermissionSheet.tsx");
    expect(source).toContain("useMutation");
    expect(source).toContain("updateChannelPermissions");
  });

  test("calls onOpenChange(false) on successful save", async () => {
    const source = await readSource("src/plugins/channels/ChannelPermissionSheet.tsx");
    expect(source).toContain("onOpenChange");
    expect(source).toContain("false");
  });

  test("invalidates queries on successful save", async () => {
    const source = await readSource("src/plugins/channels/ChannelPermissionSheet.tsx");
    expect(source).toContain("invalidateQueries");
  });

  test("shows success toast on save", async () => {
    const source = await readSource("src/plugins/channels/ChannelPermissionSheet.tsx");
    expect(source).toContain("toast.success");
  });

  test("shows loading skeleton while permissions fetch", async () => {
    const source = await readSource("src/plugins/channels/ChannelPermissionSheet.tsx");
    expect(source).toContain("Skeleton");
  });
});

describe("Phase 10: WebhooksPage.tsx — expandable event payload", () => {
  test("has expandedId state for single-selection toggle", async () => {
    const source = await readSource("src/plugins/webhooks/WebhooksPage.tsx");
    expect(source).toContain("expandedId");
    expect(source).toContain("setExpandedId");
    expect(source).toContain("useState");
  });

  test("uses useQuery with enabled for lazy payload fetch", async () => {
    const source = await readSource("src/plugins/webhooks/WebhooksPage.tsx");
    expect(source).toContain("useQuery");
    expect(source).toContain("enabled:");
    expect(source).toContain("expandedId");
  });

  test("imports getWebhookEventDetail from functions", async () => {
    const source = await readSource("src/plugins/webhooks/WebhooksPage.tsx");
    expect(source).toContain("getWebhookEventDetail");
  });

  test("imports vigilKeys for eventDetail query key", async () => {
    const source = await readSource("src/plugins/webhooks/WebhooksPage.tsx");
    expect(source).toContain("vigilKeys");
    expect(source).toContain("eventDetail");
  });

  test("contains 'Payload unavailable' error fallback", async () => {
    const source = await readSource("src/plugins/webhooks/WebhooksPage.tsx");
    expect(source).toContain("Payload unavailable");
  });

  test("uses <pre> block for JSON display", async () => {
    const source = await readSource("src/plugins/webhooks/WebhooksPage.tsx");
    expect(source).toContain("<pre");
    expect(source).toContain("bg-muted");
  });

  test("contains formatPayload helper or import", async () => {
    const source = await readSource("src/plugins/webhooks/WebhooksPage.tsx");
    expect(source).toContain("formatPayload");
  });

  test("imports Skeleton for loading state", async () => {
    const source = await readSource("src/plugins/webhooks/WebhooksPage.tsx");
    expect(source).toContain("Skeleton");
  });
});
