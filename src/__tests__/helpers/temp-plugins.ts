import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spyOn } from "bun:test";
import * as os from "node:os";

export interface TempPluginEnv {
  tmpDir: string;
  pluginsDir: string;
  addPlugin: (id: string, widgetContent: string) => string;
  addPluginDir: (id: string) => string;
  cleanup: () => void;
}

export function createTempPluginEnv(): TempPluginEnv {
  const tmpDir = mkdtempSync(join(tmpdir(), "vigil-plugin-test-"));
  const pluginsDir = join(tmpDir, ".vigil", "plugins");
  mkdirSync(pluginsDir, { recursive: true });

  spyOn(os, "homedir").mockReturnValue(tmpDir);

  return {
    tmpDir,
    pluginsDir,
    addPlugin(id: string, widgetContent: string): string {
      const dir = join(pluginsDir, id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "widget.ts"), widgetContent);
      return dir;
    },
    addPluginDir(id: string): string {
      const dir = join(pluginsDir, id);
      mkdirSync(dir, { recursive: true });
      return dir;
    },
    cleanup() {
      rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

/**
 * Returns a valid widget.ts source string for testing.
 * Override individual fields by passing a partial object.
 */
export function validWidgetSource(overrides: Record<string, string> = {}): string {
  const fields: Record<string, string> = {
    id: '"test-plugin"',
    label: '"Test Plugin"',
    icon: '"Puzzle"',
    slot: '"tab" as const',
    order: "100",
    component: "() => Promise.resolve({ default: () => null })",
    ...overrides,
  };

  const entries = Object.entries(fields)
    .map(([k, v]) => `  ${k}: ${v},`)
    .join("\n");

  return `export default {\n${entries}\n};\n`;
}
