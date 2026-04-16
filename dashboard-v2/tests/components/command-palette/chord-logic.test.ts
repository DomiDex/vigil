import { describe, test, expect } from "bun:test";
import {
  handleChordKeydown,
  type ChordState,
} from "../../../src/components/vigil/command-palette-data";

function fakeTarget(
  tagName = "DIV",
  isContentEditable = false,
): { tagName: string; isContentEditable: boolean } {
  return { tagName, isContentEditable };
}

describe("Chord detection — timing", () => {
  test("g then t within 500ms navigates to timeline", () => {
    const initialState: ChordState = { key: "", time: 0 };
    const now = 1000;

    // Press g
    const after_g = handleChordKeydown(
      { key: "g", target: fakeTarget() },
      initialState,
      false,
      now,
    );
    expect(after_g.newState).toEqual({ key: "g", time: 1000 });
    expect(after_g.navigateTo).toBeNull();

    // Press t within 500ms
    const after_t = handleChordKeydown(
      { key: "t", target: fakeTarget() },
      after_g.newState,
      false,
      now + 200,
    );
    expect(after_t.navigateTo).toBe("/");
    expect(after_t.newState).toEqual({ key: "", time: 0 });
  });

  test("g then t after 500ms does not navigate", () => {
    const after_g: ChordState = { key: "g", time: 1000 };

    const result = handleChordKeydown(
      { key: "t", target: fakeTarget() },
      after_g,
      false,
      1600, // 600ms later, past 500ms window
    );
    expect(result.navigateTo).toBeNull();
  });

  test("g then unassigned key resets chord state", () => {
    const after_g: ChordState = { key: "g", time: 1000 };

    const result = handleChordKeydown(
      { key: "z", target: fakeTarget() },
      after_g,
      false,
      1200,
    );
    expect(result.navigateTo).toBeNull();
    expect(result.newState).toEqual({ key: "", time: 0 });
  });

  test("exactly at 499ms boundary still navigates", () => {
    const after_g: ChordState = { key: "g", time: 1000 };

    const result = handleChordKeydown(
      { key: "d", target: fakeTarget() },
      after_g,
      false,
      1499,
    );
    expect(result.navigateTo).toBe("/dreams");
  });
});

describe("Chord detection — palette open guard", () => {
  test("chords are ignored when palette is open", () => {
    const after_g: ChordState = { key: "g", time: 1000 };

    const result = handleChordKeydown(
      { key: "t", target: fakeTarget() },
      after_g,
      true, // palette open
      1200,
    );
    expect(result.navigateTo).toBeNull();
    // State is preserved (not reset), but navigation blocked
    expect(result.newState).toEqual(after_g);
  });
});

describe("Chord detection — input element guard", () => {
  test("chords are ignored when focus is in INPUT", () => {
    const after_g: ChordState = { key: "g", time: 1000 };

    const result = handleChordKeydown(
      { key: "t", target: fakeTarget("INPUT") },
      after_g,
      false,
      1200,
    );
    expect(result.navigateTo).toBeNull();
  });

  test("chords are ignored when focus is in TEXTAREA", () => {
    const after_g: ChordState = { key: "g", time: 1000 };

    const result = handleChordKeydown(
      { key: "t", target: fakeTarget("TEXTAREA") },
      after_g,
      false,
      1200,
    );
    expect(result.navigateTo).toBeNull();
  });

  test("chords are ignored when focus is in contentEditable", () => {
    const after_g: ChordState = { key: "g", time: 1000 };

    const result = handleChordKeydown(
      { key: "t", target: fakeTarget("DIV", true) },
      after_g,
      false,
      1200,
    );
    expect(result.navigateTo).toBeNull();
  });

  test("chords work when focus is on a regular DIV", () => {
    const after_g: ChordState = { key: "g", time: 1000 };

    const result = handleChordKeydown(
      { key: "r", target: fakeTarget("DIV") },
      after_g,
      false,
      1200,
    );
    expect(result.navigateTo).toBe("/repos");
  });
});
