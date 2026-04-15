import { Suspense, lazy, useMemo, useState, useEffect } from "react";
import { ErrorBoundary } from "./error-boundary";
import { Skeleton } from "../ui/skeleton";
import type { PluginWidget, WidgetProps } from "../../types/plugin";

interface PluginSlotProps {
  plugin: PluginWidget;
  widgetProps: WidgetProps;
}

export function PluginSlot({ plugin, widgetProps }: PluginSlotProps) {
  // SSR guard: typeof window === 'undefined' means server render
  const [isClient, setIsClient] = useState(typeof window !== "undefined");
  useEffect(() => setIsClient(true), []);

  const LazyComponent = useMemo(
    () => (isClient ? lazy(plugin.component) : null),
    [plugin.component, isClient]
  );

  return (
    <ErrorBoundary fallback={<PluginError pluginId={plugin.id} />}>
      {LazyComponent ? (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <LazyComponent {...widgetProps} />
        </Suspense>
      ) : (
        <Skeleton className="h-64 w-full" />
      )}
    </ErrorBoundary>
  );
}

export function PluginError({ pluginId }: { pluginId: string }) {
  return (
    <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
      Plugin &quot;{pluginId}&quot; failed to load.
    </div>
  );
}
