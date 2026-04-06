import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TempRepo {
  path: string;
  exec: (cmd: string) => string;
  cleanup: () => void;
}

export function createTempRepo(): TempRepo {
  const path = mkdtempSync(join(tmpdir(), "vigil-test-"));
  execSync(
    `git init && git config user.email "test@test.com" && git config user.name "Test" && git commit --allow-empty -m "init"`,
    {
      cwd: path,
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
    },
  );
  return {
    path,
    exec: (cmd: string) =>
      execSync(cmd, {
        cwd: path,
        env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
      }).toString(),
    cleanup: () => rmSync(path, { recursive: true, force: true }),
  };
}
