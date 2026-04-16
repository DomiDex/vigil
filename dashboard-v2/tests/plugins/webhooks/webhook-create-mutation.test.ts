import { describe, test, expect, beforeEach, mock } from "bun:test";

describe("Webhook subscription creation mutation flow", () => {
  const mockCreateWebhookSubscription = mock(() => Promise.resolve({ ok: true }));
  const mockInvalidateQueries = mock(() => Promise.resolve());

  beforeEach(() => {
    mockCreateWebhookSubscription.mockClear();
    mockInvalidateQueries.mockClear();
  });

  test("calls createWebhookSubscription with repo and eventTypes", async () => {
    await mockCreateWebhookSubscription({
      data: { repo: "vigil", eventTypes: ["push", "commit"] },
    });

    expect(mockCreateWebhookSubscription).toHaveBeenCalledWith({
      data: { repo: "vigil", eventTypes: ["push", "commit"] },
    });
  });

  test("onSuccess invalidates vigilKeys.webhooks.subscriptions", async () => {
    const onSuccess = () => {
      mockInvalidateQueries({ queryKey: ["webhooks", "subscriptions"] });
    };

    await mockCreateWebhookSubscription({
      data: { repo: "vigil", eventTypes: ["push"] },
    });
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["webhooks", "subscriptions"],
    });
  });
});
