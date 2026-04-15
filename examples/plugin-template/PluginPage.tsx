import type { WidgetProps } from "../../dashboard-v2/src/types/plugin";
import { useQuery } from "@tanstack/react-query";

export default function PluginPage({ activeRepo, queryClient }: WidgetProps) {
  const { data } = useQuery(
    {
      queryKey: ["plugin-template", "hello"],
      queryFn: async () => {
        const res = await fetch("/api/plugins/plugin-template/hello");
        return res.json() as Promise<{ message: string }>;
      },
    },
    queryClient,
  );

  return (
    <div className="space-y-4 p-6">
      <h2 className="text-lg font-semibold text-[#FF8102]">My Plugin</h2>
      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-white/70">
          Active repo: {activeRepo ?? "None selected"}
        </p>
        {data && (
          <p className="mt-2 text-sm text-white/50">
            API response: {data.message}
          </p>
        )}
      </div>
    </div>
  );
}
