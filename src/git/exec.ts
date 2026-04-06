/**
 * Resilient git command wrapper with timeout, retry, and structured errors.
 *
 * Retry logic inspired by Kairos's resilient subprocess patterns.
 * Only retries on transient errors (lock files, network), not logical errors.
 */

export interface GitExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface GitExecOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY = 1_000;

const TRANSIENT_PATTERNS = [
  "Unable to create", // .git/index.lock exists
  "cannot lock ref", // ref lock contention
  "Connection refused", // network mount
  "fatal: loose object", // temporary corruption during gc
];

function isTransientError(stderr: string): boolean {
  return TRANSIENT_PATTERNS.some((p) => stderr.includes(p));
}

export async function gitExec(cwd: string, args: string[], opts: GitExecOptions = {}): Promise<GitExecResult> {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const maxRetries = opts.retries ?? DEFAULT_RETRIES;
  const retryDelay = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();

    try {
      const proc = Bun.spawn(["git", ...args], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      });

      const result = await Promise.race([
        proc.exited,
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            proc.kill();
            reject(new Error(`git ${args[0]} timed out after ${timeout}ms`));
          }, timeout),
        ),
      ]);

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const durationMs = Date.now() - start;

      if (result !== 0 && isTransientError(stderr) && attempt < maxRetries) {
        lastError = new Error(`git ${args[0]} failed (attempt ${attempt + 1}): ${stderr}`);
        await Bun.sleep(retryDelay);
        continue;
      }

      return { stdout, stderr, exitCode: result as number, durationMs };
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        await Bun.sleep(retryDelay);
      }
    }
  }

  throw lastError;
}
