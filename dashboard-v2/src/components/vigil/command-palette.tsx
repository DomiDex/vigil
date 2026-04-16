import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Plus } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command";
import { triggerDream } from "../../server/functions";
import { vigilKeys } from "../../lib/query-keys";
import {
  NAV_ITEMS,
  handleChordKeydown,
  shouldTogglePalette,
  type ChordState,
} from "./command-palette-data";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const chordRef = useRef<ChordState>({ key: "", time: 0 });

  const dreamMutation = useMutation({
    mutationFn: () => triggerDream({ data: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.dreams });
    },
  });

  // Cmd+K / Ctrl+K toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (shouldTogglePalette(e)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Two-key chord navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const result = handleChordKeydown(
        {
          key: e.key,
          target: {
            tagName: target.tagName,
            isContentEditable: target.isContentEditable,
          },
        },
        chordRef.current,
        open,
        Date.now(),
      );

      chordRef.current = result.newState;

      if (result.navigateTo) {
        e.preventDefault();
        navigate({ to: result.navigateTo });
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, navigate]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.path}
              onSelect={() => {
                navigate({ to: item.path });
                setOpen(false);
              }}
            >
              <item.icon className="size-4" />
              <span>{item.label}</span>
              <CommandShortcut>g {item.chord}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Quick Actions">
          <CommandItem
            onSelect={() => {
              dreamMutation.mutate();
              setOpen(false);
            }}
          >
            <Play className="size-4" />
            <span>Trigger Dream</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              navigate({ to: "/tasks" });
              setOpen(false);
            }}
          >
            <Plus className="size-4" />
            <span>Create Task</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
