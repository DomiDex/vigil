import type { PushBackend, PushNotification } from "../channels/push.ts";

/**
 * ntfy.sh push backend — zero-config, self-hostable push notifications.
 * User subscribes to a topic on their phone, Vigil publishes to it.
 *
 * Setup: `vigil config set push.ntfy.topic my-vigil-alerts`
 * Phone: Install ntfy app → subscribe to "my-vigil-alerts"
 */
export class NtfyBackend implements PushBackend {
  name = "ntfy";

  constructor(
    private topic: string,
    private serverUrl: string = "https://ntfy.sh",
    private token?: string,
  ) {}

  async send(notification: PushNotification): Promise<boolean> {
    const priorityMap = { low: 2, default: 3, high: 4, urgent: 5 };
    const url = `${this.serverUrl}/${this.topic}`;

    const headers: Record<string, string> = {
      Title: notification.title,
      Priority: String(priorityMap[notification.priority] ?? 3),
      Tags: notification.tags?.join(",") ?? "",
    };

    if (notification.url) headers.Click = notification.url;
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    if (notification.actions?.length) {
      headers.Actions = notification.actions.map((a) => `view, ${a.label}, ${a.url}`).join("; ");
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: notification.body,
    });

    return response.ok;
  }
}
