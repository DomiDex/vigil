// src/__tests__/unit/phase9-frontend-structure.test.ts
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const DASHBOARD_V2 = join(import.meta.dir, "../../../dashboard-v2");

async function readSource(relativePath: string): Promise<string> {
  const fullPath = join(DASHBOARD_V2, relativePath);
  const file = Bun.file(fullPath);
  if (!(await file.exists())) return "";
  return file.text();
}

describe("Phase 9: ActionPreview type", () => {
  test("types/api.ts defines ActionPreview interface", async () => {
    const source = await readSource("src/types/api.ts");
    expect(source).toContain("export interface ActionPreview");
  });

  test("ActionPreview has id field", async () => {
    const source = await readSource("src/types/api.ts");
    expect(source).toContain("id: string");
  });

  test("ActionPreview has command field", async () => {
    const source = await readSource("src/types/api.ts");
    const previewBlock = source.split("ActionPreview")[1]?.split("export")[0] ?? "";
    expect(previewBlock).toContain("command:");
  });

  test("ActionPreview has args field", async () => {
    const source = await readSource("src/types/api.ts");
    const previewBlock = source.split("ActionPreview")[1]?.split("export")[0] ?? "";
    expect(previewBlock).toContain("args:");
  });

  test("ActionPreview has description field", async () => {
    const source = await readSource("src/types/api.ts");
    const previewBlock = source.split("ActionPreview")[1]?.split("export")[0] ?? "";
    expect(previewBlock).toContain("description:");
  });

  test("ActionPreview has dryRun field", async () => {
    const source = await readSource("src/types/api.ts");
    const previewBlock = source.split("ActionPreview")[1]?.split("export")[0] ?? "";
    expect(previewBlock).toContain("dryRun:");
  });

  test("ActionPreview has estimatedEffect field", async () => {
    const source = await readSource("src/types/api.ts");
    const previewBlock = source.split("ActionPreview")[1]?.split("export")[0] ?? "";
    expect(previewBlock).toContain("estimatedEffect:");
  });
});

describe("Phase 9: getActionPreview wrapper", () => {
  test("functions.ts exports getActionPreview", async () => {
    const source = await readSource("src/server/functions.ts");
    expect(source).toContain("getActionPreview");
  });

  test("getActionPreview calls /api/actions/ preview path", async () => {
    const source = await readSource("src/server/functions.ts");
    expect(source).toContain("/api/actions/");
    expect(source).toContain("/preview");
  });
});

describe("Phase 9: query key — actions.preview(id)", () => {
  test("query-keys.ts defines actions.preview function", async () => {
    const source = await readSource("src/lib/query-keys.ts");
    expect(source).toContain("preview:");
    expect(source).toContain('"preview"');
  });

  test("actions.preview returns tuple with action id and 'preview'", async () => {
    const source = await readSource("src/lib/query-keys.ts");
    expect(source).toMatch(/preview.*=>.*\[.*"actions".*"preview".*\]/);
  });
});

describe("Phase 9: action-approval.tsx preview integration", () => {
  test("imports useState for showPreview toggle", async () => {
    const source = await readSource("src/components/vigil/action-approval.tsx");
    expect(source).toContain("useState");
    expect(source).toContain("showPreview");
  });

  test("imports useQuery for lazy preview fetch", async () => {
    const source = await readSource("src/components/vigil/action-approval.tsx");
    expect(source).toContain("useQuery");
  });

  test("uses enabled: showPreview pattern for lazy loading", async () => {
    const source = await readSource("src/components/vigil/action-approval.tsx");
    expect(source).toContain("enabled:");
    expect(source).toContain("showPreview");
  });

  test("imports Eye icon from lucide-react", async () => {
    const source = await readSource("src/components/vigil/action-approval.tsx");
    expect(source).toContain("Eye");
    expect(source).toContain("lucide-react");
  });

  test("imports Skeleton for loading state", async () => {
    const source = await readSource("src/components/vigil/action-approval.tsx");
    expect(source).toContain("Skeleton");
  });

  test("contains 'Preview unavailable' error fallback", async () => {
    const source = await readSource("src/components/vigil/action-approval.tsx");
    expect(source).toContain("Preview unavailable");
  });

  test("imports getActionPreview from functions", async () => {
    const source = await readSource("src/components/vigil/action-approval.tsx");
    expect(source).toContain("getActionPreview");
  });

  test("imports vigilKeys for preview query key", async () => {
    const source = await readSource("src/components/vigil/action-approval.tsx");
    expect(source).toContain("vigilKeys");
  });
});

describe("Phase 9: ActionsPage.tsx Tabs layout", () => {
  test("imports Tabs components from shadcn", async () => {
    const source = await readSource("src/plugins/actions/ActionsPage.tsx");
    expect(source).toContain("Tabs");
    expect(source).toContain("TabsContent");
    expect(source).toContain("TabsList");
    expect(source).toContain("TabsTrigger");
  });

  test("has 'pending' tab value", async () => {
    const source = await readSource("src/plugins/actions/ActionsPage.tsx");
    expect(source).toContain('"pending"');
  });

  test("has 'history' tab value", async () => {
    const source = await readSource("src/plugins/actions/ActionsPage.tsx");
    expect(source).toContain('"history"');
  });

  test("imports Table components from shadcn", async () => {
    const source = await readSource("src/plugins/actions/ActionsPage.tsx");
    expect(source).toContain("Table");
    expect(source).toContain("TableBody");
    expect(source).toContain("TableHead");
    expect(source).toContain("TableHeader");
    expect(source).toContain("TableRow");
  });

  test("imports Select for status filter", async () => {
    const source = await readSource("src/plugins/actions/ActionsPage.tsx");
    expect(source).toContain("Select");
    expect(source).toContain("SelectContent");
    expect(source).toContain("SelectItem");
  });

  test("imports ArrowUpDown icon for sortable headers", async () => {
    const source = await readSource("src/plugins/actions/ActionsPage.tsx");
    expect(source).toContain("ArrowUpDown");
  });

  test("has sort state for column and direction", async () => {
    const source = await readSource("src/plugins/actions/ActionsPage.tsx");
    expect(source).toContain("sortBy");
    expect(source).toContain("sortDir");
  });

  test("has pagination state", async () => {
    const source = await readSource("src/plugins/actions/ActionsPage.tsx");
    expect(source).toContain("setPage");
    expect(source).toContain("25");
  });
});

describe("Phase 9: tier badge reuse", () => {
  test("ActionsPage.tsx imports getTierBadgeClasses from action-approval", async () => {
    const source = await readSource("src/plugins/actions/ActionsPage.tsx");
    expect(source).toContain("getTierBadgeClasses");
    expect(source).toContain("action-approval");
  });
});

describe("Phase 9: status badge colors", () => {
  test("history table has green styling for approved status", async () => {
    const source = await readSource("src/plugins/actions/ActionsPage.tsx");
    expect(source).toContain("green");
    expect(source).toContain("approved");
  });

  test("history table has red styling for rejected status", async () => {
    const source = await readSource("src/plugins/actions/ActionsPage.tsx");
    expect(source).toContain("red");
    expect(source).toContain("rejected");
  });

  test("history table has blue styling for executed status", async () => {
    const source = await readSource("src/plugins/actions/ActionsPage.tsx");
    expect(source).toContain("blue");
    expect(source).toContain("executed");
  });
});
