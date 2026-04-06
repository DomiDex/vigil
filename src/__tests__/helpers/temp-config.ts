import { spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import * as os from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function withTempHome(): { tmpDir: string; cleanup: () => void } {
  const tmpDir = mkdtempSync(join(tmpdir(), "vigil-config-test-"));
  spyOn(os, "homedir").mockReturnValue(tmpDir);
  return {
    tmpDir,
    cleanup: () => {
      rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}
