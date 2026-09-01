import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LOCAL_USER_ID } from "@/lib/local-user";
import { useProblemStore } from "@/lib/problems/store";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

const APP_NAME = "解集";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "description", content: "扫描题目与讲义，识别整理、复习并生成试卷。" },
      { name: "theme-color", content: "#F3EEE4" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="zh-CN" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <TooltipProvider delayDuration={280}>
          <LocalApp />
          <Toaster
            position="top-center"
            toastOptions={{
              className: "font-sans",
              style: {
                background: "var(--color-surface)",
                color: "var(--color-fg)",
                border: "1px solid var(--color-border)",
              },
            }}
          />
        </TooltipProvider>
        <Scripts />
      </body>
    </html>
  );
}

function LocalApp() {
  const hydrate = useProblemStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate(LOCAL_USER_ID);
  }, [hydrate]);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
