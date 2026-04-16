import { describe, test, expect } from "bun:test";
import {
  NAV_ITEMS,
  type NavItem,
} from "../../../src/components/vigil/command-palette-data";

describe("NAV_ITEMS data integrity", () => {
  test("contains exactly 15 navigation items", () => {
    expect(NAV_ITEMS).toHaveLength(15);
  });

  test("all items have required fields", () => {
    for (const item of NAV_ITEMS) {
      expect(item.label).toBeTruthy();
      expect(item.path).toBeTruthy();
      expect(item.chord).toBeTruthy();
    }
  });

  test("no duplicate chord keys", () => {
    const chords = NAV_ITEMS.map((item) => item.chord);
    const unique = new Set(chords);
    expect(unique.size).toBe(chords.length);
  });

  test("all paths start with /", () => {
    for (const item of NAV_ITEMS) {
      expect(item.path.startsWith("/")).toBe(true);
    }
  });
});

describe("Navigation item lookup by chord", () => {
  test("finds Timeline with chord t", () => {
    const item = NAV_ITEMS.find((n) => n.chord === "t");
    expect(item?.path).toBe("/");
    expect(item?.label).toBe("Timeline");
  });

  test("finds Dreams with chord d", () => {
    const item = NAV_ITEMS.find((n) => n.chord === "d");
    expect(item?.path).toBe("/dreams");
  });

  test("returns undefined for unassigned chord", () => {
    const item = NAV_ITEMS.find((n) => n.chord === "z");
    expect(item).toBeUndefined();
  });
});
