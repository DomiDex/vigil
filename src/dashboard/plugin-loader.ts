import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { PluginWidget } from "../../dashboard-v2/src/types/plugin";

export const PluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string(),
  icon: z.string(),
  slot: z.enum(["tab", "sidebar", "timeline-card", "overlay", "top-bar"]),
  order: z.number().min(100),
  component: z.function(),
  sseEvents: z.array(z.string()).optional(),
  queryKeys: z.array(z.array(z.string())).optional(),
  apiRoutes: z
    .array(
      z.object({
        method: z.enum(["GET", "POST", "PUT", "DELETE"]),
        path: z.string(),
        handler: z.function(),
      }),
    )
    .optional(),
});

export interface PluginApiRoute {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  handler: (req: Request) => Response | Promise<Response>;
}

let loadedApiRoutes = new Map<string, PluginApiRoute[]>();

export async function loadUserPlugins(): Promise<PluginWidget[]> {
  const pluginDir = join(homedir(), ".vigil", "plugins");
  const plugins: PluginWidget[] = [];
  loadedApiRoutes = new Map();

  let entries: string[];
  try {
    entries = await readdir(pluginDir);
  } catch {
    return [];
  }

  const { corePlugins } = await import("../../dashboard-v2/src/plugins/index");
  const coreIds = new Set((corePlugins as PluginWidget[]).map((p) => p.id));

  for (const entry of entries) {
    const widgetPath = join(pluginDir, entry, "widget.ts");
    const exists = await Bun.file(widgetPath).exists();
    if (!exists) continue;

    try {
      const mod = await import(widgetPath);
      const manifest = PluginManifestSchema.parse(mod.default);

      if (coreIds.has(manifest.id)) {
        console.warn(`[plugins] Skipping "${manifest.id}" — ID collides with core plugin`);
        continue;
      }

      if (manifest.apiRoutes?.length) {
        loadedApiRoutes.set(manifest.id, manifest.apiRoutes as PluginApiRoute[]);
      }

      plugins.push({
        id: manifest.id,
        label: manifest.label,
        icon: manifest.icon,
        path: `/${manifest.id}`,
        slot: manifest.slot,
        order: manifest.order,
        component: manifest.component as PluginWidget["component"],
        sseEvents: manifest.sseEvents,
        queryKeys: manifest.queryKeys,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        console.warn(`[plugins] Invalid manifest in ${entry}/:`, err.issues.map((i) => i.message).join(", "));
      } else {
        console.warn(`[plugins] Failed to load ${entry}/:`, err);
      }
    }
  }

  return plugins;
}

export function getPluginApiRoutes(): Map<string, PluginApiRoute[]> {
  return loadedApiRoutes;
}
