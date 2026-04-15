/// <reference types="vite/client" />
import type { ReactNode } from "react";
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { queryClient } from "../router";
import { AppSidebar } from "../components/layout/app-sidebar";
import { SiteHeader } from "../components/layout/site-header";
import { useSSE } from "../hooks/use-sse";
import { corePlugins } from "../plugins";
import "../app.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Vigil Dashboard" },
    ],
  }),
  component: RootLayout,
});

function RootLayout() {
  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppShell />
        </TooltipProvider>
      </QueryClientProvider>
    </RootDocument>
  );
}

function AppShell() {
  useSSE();

  return (
    <SidebarProvider>
      <AppSidebar plugins={corePlugins} />
      <SidebarInset>
        <SiteHeader />
        <main className="flex-1 overflow-y-auto p-4">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-text min-h-screen">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
