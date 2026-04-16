import type { LucideIcon } from "lucide-react";
import {
  Activity,
  GitBranch,
  Sparkles,
  CheckSquare,
  Zap,
  Brain,
  BarChart3,
  Clock,
  Settings,
  Bot,
  HeartPulse,
  Webhook,
  Radio,
  Bell,
  Network,
} from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  chord: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Timeline", path: "/", icon: Activity, chord: "t" },
  { label: "Repos", path: "/repos", icon: GitBranch, chord: "r" },
  { label: "Dreams", path: "/dreams", icon: Sparkles, chord: "d" },
  { label: "Tasks", path: "/tasks", icon: CheckSquare, chord: "k" },
  { label: "Actions", path: "/actions", icon: Zap, chord: "a" },
  { label: "Memory", path: "/memory", icon: Brain, chord: "m" },
  { label: "Metrics", path: "/metrics", icon: BarChart3, chord: "e" },
  { label: "Scheduler", path: "/scheduler", icon: Clock, chord: "s" },
  { label: "Config", path: "/config", icon: Settings, chord: "c" },
  { label: "Agents", path: "/agents", icon: Bot, chord: "g" },
  { label: "Health", path: "/health", icon: HeartPulse, chord: "h" },
  { label: "Webhooks", path: "/webhooks", icon: Webhook, chord: "w" },
  { label: "Channels", path: "/channels", icon: Radio, chord: "l" },
  { label: "Notifications", path: "/notifications", icon: Bell, chord: "n" },
  { label: "A2A", path: "/a2a", icon: Network, chord: "2" },
];

export interface ChordState {
  key: string;
  time: number;
}

export function handleChordKeydown(
  e: { key: string; target: { tagName: string; isContentEditable: boolean } },
  chordState: ChordState,
  paletteOpen: boolean,
  now: number,
): { newState: ChordState; navigateTo: string | null } {
  if (paletteOpen) {
    return { newState: chordState, navigateTo: null };
  }

  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) {
    return { newState: chordState, navigateTo: null };
  }

  if (e.key === "g") {
    return { newState: { key: "g", time: now }, navigateTo: null };
  }

  if (chordState.key === "g" && now - chordState.time < 500) {
    const item = NAV_ITEMS.find((n) => n.chord === e.key);
    const resetState = { key: "", time: 0 };
    if (item) {
      return { newState: resetState, navigateTo: item.path };
    }
    return { newState: resetState, navigateTo: null };
  }

  return { newState: chordState, navigateTo: null };
}

export function shouldTogglePalette(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
}): boolean {
  return e.key === "k" && (e.metaKey || e.ctrlKey);
}
