import { Suspense, lazy } from "react";
import { Bot } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import {
  Route,
  type AgentsSearch,
  type AgentsSearchInput,
  type AgentTab,
} from "../../routes/agents";
import type { WidgetProps } from "../../types/plugin";

const PersonaTab = lazy(() => import("./PersonaTab"));
const SpecialistsTab = lazy(() => import("./SpecialistsTab"));
const FindingsTab = lazy(() => import("./FindingsTab"));
const FlakyTestsTab = lazy(() => import("./FlakyTestsTab"));

function TabFallback() {
  return (
    <div className="text-sm text-muted-foreground py-8">Loading...</div>
  );
}

export default function AgentsPage(_props: Partial<WidgetProps> = {}) {
  const { tab, id } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bot className="size-4 text-vigil" />
        <h3 className="text-sm font-medium">Agents</h3>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) =>
          navigate({
            to: "/agents",
            search: (prev: AgentsSearchInput): AgentsSearch => ({
              ...prev,
              tab: value as AgentTab,
              id: undefined,
            }),
          })
        }
      >
        <TabsList>
          <TabsTrigger value="persona">Persona</TabsTrigger>
          <TabsTrigger value="specialists">Specialists</TabsTrigger>
          <TabsTrigger value="findings">Findings</TabsTrigger>
          <TabsTrigger value="flaky">Flaky Tests</TabsTrigger>
        </TabsList>

        <TabsContent value="persona">
          <Suspense fallback={<TabFallback />}>
            <PersonaTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="specialists">
          <Suspense fallback={<TabFallback />}>
            <SpecialistsTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="findings">
          <Suspense fallback={<TabFallback />}>
            <FindingsTab activeId={id} />
          </Suspense>
        </TabsContent>

        <TabsContent value="flaky">
          <Suspense fallback={<TabFallback />}>
            <FlakyTestsTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
