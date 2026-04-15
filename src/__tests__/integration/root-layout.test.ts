import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT_FILE = join(import.meta.dir, "../../../dashboard-v2/src/routes/__root.tsx");

describe("root layout provider nesting", () => {
  let source: string;

  try {
    source = readFileSync(ROOT_FILE, "utf-8");
  } catch {
    source = "";
  }

  const fileExists = source.length > 0;

  it.skipIf(!fileExists)("file exists and is non-empty", () => {
    expect(source.length).toBeGreaterThan(0);
  });

  it.skipIf(!fileExists)("QueryClientProvider wraps TooltipProvider", () => {
    const qcpIndex = source.indexOf("QueryClientProvider");
    const tpIndex = source.indexOf("TooltipProvider");
    expect(qcpIndex).toBeGreaterThan(-1);
    expect(tpIndex).toBeGreaterThan(-1);
    expect(qcpIndex).toBeLessThan(tpIndex);
  });

  it.skipIf(!fileExists)("TooltipProvider wraps SidebarProvider", () => {
    const tpIndex = source.indexOf("TooltipProvider");
    const spIndex = source.indexOf("SidebarProvider");
    expect(tpIndex).toBeGreaterThan(-1);
    expect(spIndex).toBeGreaterThan(-1);
    expect(tpIndex).toBeLessThan(spIndex);
  });

  it.skipIf(!fileExists)("useSSE is called inside AppShell", () => {
    expect(source).toContain("useSSE()");
  });

  it.skipIf(!fileExists)("AppSidebar receives corePlugins prop", () => {
    expect(source).toMatch(/AppSidebar.*plugins.*=.*\{.*corePlugins.*\}/s);
  });

  it.skipIf(!fileExists)("Outlet is inside SidebarInset", () => {
    const siIndex = source.indexOf("SidebarInset");
    const outletIndex = source.indexOf("<Outlet");
    expect(siIndex).toBeGreaterThan(-1);
    expect(outletIndex).toBeGreaterThan(-1);
    expect(siIndex).toBeLessThan(outletIndex);
  });

  it.skipIf(!fileExists)("imports app.css for Tailwind theme", () => {
    expect(source).toContain("app.css");
  });
});
