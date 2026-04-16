import { mock } from "bun:test";

export function createMockQueryClient() {
  return {
    invalidateQueries: mock(() => Promise.resolve()),
  };
}
