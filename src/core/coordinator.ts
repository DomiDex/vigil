import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "./config.ts";

export interface WorkerTask {
  id: string;
  prompt: string;
  model: string;
  repo?: string;
}

export interface WorkerResult {
  id: string;
  result: string;
  exitCode: number;
  completedAt: number;
  repo?: string;
}

/** Auto-kill workers after this many milliseconds */
const WORKER_TIMEOUT_MS = 60_000;

export class Coordinator {
  private workersDir: string;
  private maxConcurrent: number;
  private running: Map<string, { proc: ReturnType<typeof Bun.spawn>; started: number }> = new Map();

  constructor(maxConcurrent = 2) {
    this.workersDir = join(getDataDir(), "workers");
    mkdirSync(this.workersDir, { recursive: true });
    this.maxConcurrent = maxConcurrent;
  }

  async spawnWorker(task: Omit<WorkerTask, "id">): Promise<string> {
    if (this.running.size >= this.maxConcurrent) {
      throw new Error(`Max ${this.maxConcurrent} concurrent workers reached`);
    }

    const prompt = task.prompt || "";
    if (!prompt) {
      throw new Error("Worker task requires a non-empty prompt");
    }

    const id = crypto.randomUUID().slice(0, 8);
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;

    const args = ["claude", "-p", "--output-format", "text", "--model", task.model];

    const proc = Bun.spawn(args, {
      env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdin.write(prompt);
    proc.stdin.end();

    this.running.set(id, { proc, started: Date.now() });

    // Non-blocking: collect result when done
    proc.exited.then(async (code) => {
      const stdout = await new Response(proc.stdout).text();
      const resultPath = join(this.workersDir, `${id}.json`);
      writeFileSync(
        resultPath,
        JSON.stringify({
          id,
          result: stdout.trim(),
          exitCode: code,
          completedAt: Date.now(),
          repo: task.repo,
        } satisfies WorkerResult),
      );
      this.running.delete(id);
    });

    return id;
  }

  /** Collect completed worker results and clean up files */
  collectResults(): WorkerResult[] {
    if (!existsSync(this.workersDir)) return [];

    const results: WorkerResult[] = [];
    const files = readdirSync(this.workersDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      const path = join(this.workersDir, file);
      try {
        const data: WorkerResult = JSON.parse(readFileSync(path, "utf-8"));
        results.push(data);
        unlinkSync(path);
      } catch {
        // Skip malformed result files
      }
    }
    return results;
  }

  /** Kill workers that have exceeded the timeout */
  reapTimedOut(): number {
    let killed = 0;
    const now = Date.now();
    for (const [id, { proc, started }] of this.running) {
      if (now - started > WORKER_TIMEOUT_MS) {
        proc.kill();
        this.running.delete(id);
        killed++;
      }
    }
    return killed;
  }

  get activeCount(): number {
    return this.running.size;
  }
}
