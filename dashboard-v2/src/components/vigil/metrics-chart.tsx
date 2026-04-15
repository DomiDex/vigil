export const VIGIL_CHART_COLORS = {
  SILENT: "var(--color-text-muted)",
  OBSERVE: "var(--color-info)",
  NOTIFY: "var(--color-warning)",
  ACT: "var(--color-vigil)",
  primary: "var(--color-vigil)",
  secondary: "var(--color-info)",
  success: "var(--color-success)",
  error: "var(--color-error)",
  grid: "var(--color-border)",
  text: "var(--color-text-muted)",
} as const;

export const vigilTooltipStyle = {
  contentStyle: {
    background: "var(--color-surface-dark)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    color: "var(--color-text)",
    fontSize: 12,
  },
};

export const vigilAxisProps = {
  tick: {
    fill: "var(--color-text-muted)",
    fontSize: 12,
  },
  axisLine: {
    stroke: "var(--color-border)",
  },
  tickLine: {
    stroke: "var(--color-border)",
  },
};
