import type { SpecialistConfig } from "../types.ts";
import { CODE_REVIEW_AGENT } from "./code-review.ts";
import { SECURITY_AGENT } from "./security.ts";
import { TEST_DRIFT_AGENT } from "./test-drift.ts";

/** All built-in specialist agents */
export const BUILTIN_SPECIALISTS: SpecialistConfig[] = [
  CODE_REVIEW_AGENT,
  SECURITY_AGENT,
  TEST_DRIFT_AGENT,
  // flaky-test is added in Phase 4 (deterministic, different pattern)
];

export { CODE_REVIEW_AGENT, SECURITY_AGENT, TEST_DRIFT_AGENT };
