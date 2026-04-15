import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { vigilKeys } from "../lib/query-keys";

export const SSE_EVENT_MAP = {
  tick: [vigilKeys.overview, vigilKeys.repos.all, ["timeline"]],
  message: [["timeline"]],
  decision: [["timeline"], vigilKeys.metrics],
  action: [vigilKeys.actions.all],
  action_pending: [vigilKeys.actions.pending, vigilKeys.actions.all],
  action_resolved: [vigilKeys.actions.all, vigilKeys.actions.pending],
  dream: [vigilKeys.dreams, vigilKeys.memory.stats],
  dream_started: [vigilKeys.dreams],
  dream_completed: [vigilKeys.dreams, vigilKeys.memory.stats],
  state_change: [vigilKeys.overview],
  config_changed: [vigilKeys.config.all],
  task_updated: [vigilKeys.tasks],
  schedule_fired: [vigilKeys.scheduler],
  webhook: [["webhooks"]],
  channel: [["channels"]],
  health: [["health"]],
} as const satisfies Record<string, readonly (readonly unknown[])[]>;

export function useSSE() {
  const queryClient = useQueryClient();
  const sourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function connect() {
      const source = new EventSource("/api/sse");
      sourceRef.current = source;

      source.addEventListener("connected", () => {
        retryRef.current = 0;
      });

      for (const [eventType, keys] of Object.entries(SSE_EVENT_MAP)) {
        source.addEventListener(eventType, () => {
          for (const queryKey of keys) {
            queryClient.invalidateQueries({ queryKey });
          }
        });
      }

      source.onerror = () => {
        source.close();
        const delay = Math.min(1000 * 2 ** retryRef.current, 30_000);
        retryRef.current++;
        timerRef.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      sourceRef.current?.close();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [queryClient]);
}
