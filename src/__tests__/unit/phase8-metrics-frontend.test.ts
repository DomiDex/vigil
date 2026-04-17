import { describe, expect, test } from "bun:test";

// These will be imported from the actual implementation once created
// For now, inline them to validate the test structure works

const RANGE_MS: Record<string, number> = {
  "1h": 3_600_000,
  "6h": 21_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
  "30d": 2_592_000_000,
};

function metricsToCSV(data: { time: string; SILENT: number; OBSERVE: number; NOTIFY: number; ACT: number }[]): string {
  const header = "time,SILENT,OBSERVE,NOTIFY,ACT";
  const rows = data.map((d) => `${d.time},${d.SILENT},${d.OBSERVE},${d.NOTIFY},${d.ACT}`);
  return [header, ...rows].join("\n");
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

describe("Phase 8: RANGE_MS mapping", () => {
  test("1h = 3,600,000 ms", () => {
    expect(RANGE_MS["1h"]).toBe(3_600_000);
  });

  test("6h = 21,600,000 ms", () => {
    expect(RANGE_MS["6h"]).toBe(21_600_000);
  });

  test("24h = 86,400,000 ms", () => {
    expect(RANGE_MS["24h"]).toBe(86_400_000);
  });

  test("7d = 604,800,000 ms", () => {
    expect(RANGE_MS["7d"]).toBe(604_800_000);
  });

  test("30d = 2,592,000,000 ms", () => {
    expect(RANGE_MS["30d"]).toBe(2_592_000_000);
  });

  test("all 5 range presets are defined", () => {
    expect(Object.keys(RANGE_MS).length).toBe(5);
  });
});

describe("Phase 8: metricsToCSV", () => {
  test("produces header row", () => {
    const csv = metricsToCSV([]);
    expect(csv).toBe("time,SILENT,OBSERVE,NOTIFY,ACT");
  });

  test("produces header + data rows", () => {
    const csv = metricsToCSV([
      { time: "2026-04-10T14:00:00Z", SILENT: 10, OBSERVE: 3, NOTIFY: 1, ACT: 0 },
      { time: "2026-04-10T15:00:00Z", SILENT: 8, OBSERVE: 5, NOTIFY: 2, ACT: 1 },
    ]);

    const lines = csv.split("\n");
    expect(lines.length).toBe(3);
    expect(lines[0]).toBe("time,SILENT,OBSERVE,NOTIFY,ACT");
    expect(lines[1]).toBe("2026-04-10T14:00:00Z,10,3,1,0");
    expect(lines[2]).toBe("2026-04-10T15:00:00Z,8,5,2,1");
  });

  test("handles single row", () => {
    const csv = metricsToCSV([{ time: "2026-04-10T14:00:00Z", SILENT: 1, OBSERVE: 0, NOTIFY: 0, ACT: 0 }]);

    const lines = csv.split("\n");
    expect(lines.length).toBe(2);
  });

  test("handles zero values in all columns", () => {
    const csv = metricsToCSV([{ time: "2026-04-10T14:00:00Z", SILENT: 0, OBSERVE: 0, NOTIFY: 0, ACT: 0 }]);

    expect(csv).toContain(",0,0,0,0");
  });
});

describe("Phase 8: formatBytes", () => {
  test("formats 0 bytes", () => {
    expect(formatBytes(0)).toBe("0 Bytes");
  });

  test("formats bytes below 1 KB", () => {
    expect(formatBytes(512)).toBe("512 Bytes");
  });

  test("formats exactly 1 KB", () => {
    expect(formatBytes(1024)).toBe("1 KB");
  });

  test("formats KB range", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  test("formats exactly 1 MB", () => {
    expect(formatBytes(1048576)).toBe("1 MB");
  });

  test("formats MB range", () => {
    expect(formatBytes(5242880)).toBe("5 MB");
  });

  test("formats exactly 1 GB", () => {
    expect(formatBytes(1073741824)).toBe("1 GB");
  });

  test("formats fractional GB", () => {
    expect(formatBytes(1610612736)).toBe("1.5 GB");
  });
});

describe("Phase 8: Date range filter button state", () => {
  test("active range returns 'default' variant", () => {
    const selectedRange = "24h";
    const getVariant = (range: string) => (range === selectedRange ? "default" : "outline");

    expect(getVariant("24h")).toBe("default");
    expect(getVariant("1h")).toBe("outline");
    expect(getVariant("7d")).toBe("outline");
  });
});
