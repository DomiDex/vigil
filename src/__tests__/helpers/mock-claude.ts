/**
 * Mock helpers for Bun.spawn claude CLI calls.
 */

const originalSpawn = Bun.spawn;

interface MockSpawnResult {
  restore: () => void;
  getCalls: () => { args: any[]; stdin: string }[];
}

export function mockBunSpawn(stdout: string, exitCode = 0, stderr = ""): MockSpawnResult {
  const calls: { args: any[]; stdin: string }[] = [];

  const fakeSpawn = (args: any[], _opts?: any) => {
    const stdinChunks: string[] = [];
    const call = { args, stdin: "" };
    calls.push(call);

    const stdoutBlob = new Blob([stdout]);
    const stderrBlob = new Blob([stderr]);

    return {
      stdin: {
        write(data: string) {
          stdinChunks.push(data);
        },
        end() {
          call.stdin = stdinChunks.join("");
        },
      },
      stdout: stdoutBlob.stream(),
      stderr: stderrBlob.stream(),
      exited: Promise.resolve(exitCode),
      pid: 999,
      kill() {},
    };
  };

  (Bun as any).spawn = fakeSpawn;

  return {
    restore: () => {
      (Bun as any).spawn = originalSpawn;
    },
    getCalls: () => calls,
  };
}

export function mockBunSpawnThrow(error: Error): { restore: () => void } {
  (Bun as any).spawn = () => {
    throw error;
  };
  return {
    restore: () => {
      (Bun as any).spawn = originalSpawn;
    },
  };
}

export function restoreBunSpawn(): void {
  (Bun as any).spawn = originalSpawn;
}
