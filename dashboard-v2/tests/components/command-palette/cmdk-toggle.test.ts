import { describe, test, expect } from "bun:test";
import { shouldTogglePalette } from "../../../src/components/vigil/command-palette-data";

describe("Cmd+K toggle detection", () => {
  test("Cmd+K triggers toggle (macOS)", () => {
    expect(
      shouldTogglePalette({ key: "k", metaKey: true, ctrlKey: false }),
    ).toBe(true);
  });

  test("Ctrl+K triggers toggle (Linux/Windows)", () => {
    expect(
      shouldTogglePalette({ key: "k", metaKey: false, ctrlKey: true }),
    ).toBe(true);
  });

  test("plain k does not trigger toggle", () => {
    expect(
      shouldTogglePalette({ key: "k", metaKey: false, ctrlKey: false }),
    ).toBe(false);
  });

  test("Cmd+j does not trigger toggle", () => {
    expect(
      shouldTogglePalette({ key: "j", metaKey: true, ctrlKey: false }),
    ).toBe(false);
  });
});
