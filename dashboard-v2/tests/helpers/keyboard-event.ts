export function fakeKeyEvent(
  key: string,
  overrides: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    tagName?: string;
    isContentEditable?: boolean;
  } = {},
) {
  return {
    key,
    metaKey: overrides.metaKey ?? false,
    ctrlKey: overrides.ctrlKey ?? false,
    target: {
      tagName: overrides.tagName ?? "DIV",
      isContentEditable: overrides.isContentEditable ?? false,
    },
    preventDefault: () => {},
  };
}
