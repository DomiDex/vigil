import { homedir } from "os";
import { join } from "path";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";

export interface VigilConfig {
  tickInterval: number;
  blockingBudget: number;
  sleepAfter: number;
  sleepTickInterval: number;
  dreamAfter: number;
  tickModel: string;
  escalationModel: string;
  maxEventWindow: number;
}

const DEFAULT_CONFIG: VigilConfig = {
  tickInterval: 30,
  blockingBudget: 15,
  sleepAfter: 900, // 15 minutes in seconds
  sleepTickInterval: 300,
  dreamAfter: 300, // 5 minutes in seconds
  tickModel: "claude-haiku-4-5-20251001",
  escalationModel: "claude-sonnet-4-6",
  maxEventWindow: 100,
};

export function getConfigDir(): string {
  const dir = join(homedir(), ".vigil");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDataDir(): string {
  const dir = join(getConfigDir(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getLogsDir(): string {
  const dir = join(getDataDir(), "logs");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function loadConfig(): VigilConfig {
  const configPath = join(getConfigDir(), "config.json");
  if (!existsSync(configPath)) {
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = readFileSync(configPath, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: VigilConfig): void {
  const configPath = join(getConfigDir(), "config.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function getApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY;
}
