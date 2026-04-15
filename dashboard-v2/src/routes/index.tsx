import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getVigilContext } from "../server/vigil-context";

const getHealthCheck = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = getVigilContext();
  const tick = (ctx.daemon as any).tickEngine;
  return {
    status: "ok" as const,
    repos: (ctx.daemon as any).repoPaths.length,
    tick: tick.currentTick as number,
  };
});

export const Route = createFileRoute("/")({
  loader: () => getHealthCheck(),
  component: IndexPage,
});

function IndexPage() {
  const data = Route.useLoaderData();

  return (
    <div className="min-h-screen bg-background p-8">
      <h1 className="text-3xl font-bold text-vigil mb-6">
        Vigil Dashboard v2
      </h1>

      <div className="rounded-lg bg-surface border border-border p-6">
        <div className="space-y-2">
          <p className="text-text">
            Status: <span className="text-success font-mono">{data.status}</span>
          </p>
          <p className="text-text">
            Repos: <span className="text-vigil font-mono">{data.repos}</span>
          </p>
          <p className="text-text">
            Tick: <span className="text-vigil font-mono">{data.tick}</span>
          </p>
        </div>

        <div className="mt-4">
          <span className="inline-flex items-center rounded-md bg-vigil/20 px-2 py-1 text-xs font-medium text-vigil border border-vigil/30">
            Phase 0 Spike
          </span>
        </div>
      </div>
    </div>
  );
}
