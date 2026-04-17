import { randomUUID } from "node:crypto";
import type { VigilConfig } from "../core/config.ts";
import { callClaude } from "../llm/decision-max.ts";
import { SpecialistResponseSchema } from "./schemas.ts";
import type {
  Finding,
  SpecialistConfig,
  SpecialistContext,
  SpecialistResult,
} from "./types.ts";

export class SpecialistRunner {
  constructor(private config: VigilConfig) {}

  /** Run a single specialist and return parsed findings */
  async run(
    specialist: SpecialistConfig,
    context: SpecialistContext,
  ): Promise<SpecialistResult> {
    const timeout = 10_000; // 10s per spec Risk #4

    try {
      if (specialist.class === "deterministic" && specialist.execute) {
        return await Promise.race([
          specialist.execute(context),
          new Promise<SpecialistResult>((_, reject) =>
            setTimeout(
              () => reject(new Error("Specialist timeout")),
              timeout,
            ),
          ),
        ]);
      }

      if (specialist.class === "analytical" && specialist.buildPrompt) {
        const prompt = specialist.buildPrompt(context);
        const model = specialist.model ?? this.config.tickModel;

        const raw = await Promise.race([
          callClaude(prompt, "", model),
          new Promise<string>((_, reject) =>
            setTimeout(
              () => reject(new Error("Specialist LLM timeout")),
              timeout,
            ),
          ),
        ]);

        if (!raw) {
          return {
            specialist: specialist.name,
            findings: [],
            confidence: 0,
            skippedReason: "Empty LLM response",
          };
        }

        return this.parseResponse(specialist.name, raw, context);
      }

      return {
        specialist: specialist.name,
        findings: [],
        confidence: 0,
        skippedReason: "No execute or buildPrompt",
      };
    } catch (err) {
      console.warn(
        `[specialist:${specialist.name}] Error:`,
        (err as Error).message,
      );
      return {
        specialist: specialist.name,
        findings: [],
        confidence: 0,
        skippedReason: (err as Error).message,
      };
    }
  }

  /** Run multiple specialists in parallel, bounded by maxParallel */
  async runAll(
    specialists: SpecialistConfig[],
    context: SpecialistContext,
  ): Promise<SpecialistResult[]> {
    const maxParallel = this.config.specialists?.maxParallel ?? 2;
    const results: SpecialistResult[] = [];

    for (let i = 0; i < specialists.length; i += maxParallel) {
      const batch = specialists.slice(i, i + maxParallel);
      const batchResults = await Promise.allSettled(
        batch.map((s) => this.run(s, context)),
      );
      for (const r of batchResults) {
        if (r.status === "fulfilled") results.push(r.value);
        else
          results.push({
            specialist: "unknown" as any,
            findings: [],
            confidence: 0,
            skippedReason: r.reason?.message,
          });
      }
    }

    return results;
  }

  /** Parse raw LLM JSON response into SpecialistResult */
  private parseResponse(
    specialistName: string,
    raw: string,
    context: SpecialistContext,
  ): SpecialistResult {
    // Extract JSON from response (LLM may wrap in markdown code blocks)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        specialist: specialistName as any,
        findings: [],
        confidence: 0,
        skippedReason: "No JSON in response",
      };
    }

    try {
      const parsed = SpecialistResponseSchema.parse(JSON.parse(jsonMatch[0]));

      const minSeverity =
        this.config.specialists?.severityThreshold ?? "info";
      const severityOrder = { info: 0, warning: 1, critical: 2 };

      const findings: Finding[] = parsed.findings
        .filter(
          (f) => severityOrder[f.severity] >= severityOrder[minSeverity],
        )
        .filter((f) => !this.isDuplicate(f, context.recentFindings))
        .map((f) => ({
          id: randomUUID(),
          specialist: specialistName as any,
          severity: f.severity,
          title: f.title,
          detail: f.detail,
          file: f.file ?? undefined,
          line: f.line ?? undefined,
          suggestion: f.suggestion ?? undefined,
        }));

      return {
        specialist: specialistName as any,
        findings,
        confidence: parsed.confidence,
        skippedReason: parsed.skippedReason ?? undefined,
      };
    } catch (err) {
      return {
        specialist: specialistName as any,
        findings: [],
        confidence: 0,
        skippedReason: `Parse error: ${(err as Error).message}`,
      };
    }
  }

  /** Check if a finding is a duplicate of a recent one */
  private isDuplicate(
    finding: { title: string; file?: string | null },
    recentFindings: Finding[],
  ): boolean {
    return recentFindings.some(
      (existing) =>
        existing.title === finding.title &&
        existing.file === (finding.file ?? undefined),
    );
  }
}
