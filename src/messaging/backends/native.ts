import type { PushBackend, PushNotification } from "../channels/push.ts";

/**
 * OS-native notification backend.
 * macOS: osascript, Linux: notify-send, Windows: PowerShell toast.
 */
export class NativeBackend implements PushBackend {
  name = "native";

  async send(notification: PushNotification): Promise<boolean> {
    try {
      const platform = process.platform;

      if (platform === "darwin") {
        const title = escapeAppleScript(notification.title);
        const body = escapeAppleScript(notification.body);
        const proc = Bun.spawn(["osascript", "-e", `display notification "${body}" with title "${title}"`]);
        await proc.exited;
        return proc.exitCode === 0;
      }

      if (platform === "linux") {
        const urgency =
          notification.priority === "urgent" ? "critical" : notification.priority === "high" ? "normal" : "low";
        const proc = Bun.spawn(["notify-send", "-u", urgency, notification.title, notification.body]);
        await proc.exited;
        return proc.exitCode === 0;
      }

      if (platform === "win32") {
        const title = notification.title.replace(/'/g, "''");
        const body = notification.body.replace(/'/g, "''");
        const proc = Bun.spawn([
          "powershell.exe",
          "-Command",
          `Add-Type -AssemblyName System.Windows.Forms; ` +
            `[System.Windows.Forms.MessageBox]::Show('${body}','${title}')`,
        ]);
        await proc.exited;
        return proc.exitCode === 0;
      }

      return false;
    } catch {
      return false;
    }
  }
}

function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
