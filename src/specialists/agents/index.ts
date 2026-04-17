import type { SpecialistConfig } from "../types.ts";
import { CODE_REVIEW_AGENT } from "./code-review.ts";
import { createFlakyTestAgent } from "./flaky-test/index.ts";
import { SECURITY_AGENT } from "./security.ts";
import { TEST_DRIFT_AGENT } from "./test-drift.ts";

/** All built-in analytical specialist agents. Deterministic agents (flaky-test)
 * need runtime dependencies and are constructed via factories at daemon init. */
export const BUILTIN_SPECIALISTS: SpecialistConfig[] = [CODE_REVIEW_AGENT, SECURITY_AGENT, TEST_DRIFT_AGENT];

export { CODE_REVIEW_AGENT, createFlakyTestAgent, SECURITY_AGENT, TEST_DRIFT_AGENT };
