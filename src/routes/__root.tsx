import { createRootRoute, HeadContent, Outlet, Scripts, useRouterState } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, type ReactNode } from "react";
import { AuthProvider } from "@/lib/auth/provider";
import { authEnabled } from "@/lib/auth/client";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { DEV_USER, useCurrentUserState } from "@/lib/auth/use-current-user";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { AppShell } from "@/components/layout/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useProblemStore } from "@/lib/problems/store";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

const APP_NAME = "墨题";

const fetchSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const user = await getSessionUser();
  return user ? { id: user.id, email: user.email } : null;
});

export const Route = createRootRoute({
  beforeLoad: async () => {
    if (!authEnabled) {
      return { sessionUser: { id: DEV_USER.id, email: DEV_USER.primaryEmail } };
    }
    return { sessionUser: await fetchSessionUser() };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "description", content: "拍下错题，识别题干，并把图形重绘成矢量。" },
      { name: "theme-color", content: "#F3EEE4" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
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
        <PreviewHostBridge />
        <AuthProvider>
          <TooltipProvider delayDuration={280}>
            <RootChrome />
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
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootChrome() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/login") return <Outlet />;
  return (
    <RequireAuth>
      <AppShell>
        <Outlet />
      </AppShell>
    </RequireAuth>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { sessionUser } = Route.useRouteContext();
  const { user, isPending } = useCurrentUserState();
  const hydrate = useProblemStore((s) => s.hydrate);
  const reset = useProblemStore((s) => s.reset);
  const current = user ?? (sessionUser ? { id: sessionUser.id } : null);

  useEffect(() => {
    if (user) {
      void hydrate(user.id);
      return;
    }
    if (!authEnabled) {
      void hydrate(DEV_USER.id);
      return;
    }
    if (!isPending) reset();
  }, [user, isPending, hydrate, reset]);

  if (!authEnabled) return <>{children}</>;
  if (isPending && !current) {
    return (
      <div className="paper-wash grid min-h-dvh place-items-center px-6">
        <p className="text-sm text-muted-foreground">正在打开本子…</p>
      </div>
    );
  }
  if (!current) return <RedirectToSignIn />;
  return <>{children}</>;
}
