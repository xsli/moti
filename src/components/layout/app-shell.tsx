import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, Camera, FileText, RotateCcw } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { Logo } from "@/components/brand/logo";
import { AuthSlot } from "@/components/layout/auth-slot";
import { usePaperStore } from "@/lib/paper/store";
import { useProblemStore } from "@/lib/problems/store";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "本子", icon: BookOpen },
  { to: "/capture", label: "拍题", icon: Camera },
  { to: "/review", label: "复习", icon: RotateCcw },
  { to: "/paper", label: "组卷", icon: FileText },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const userId = useProblemStore((s) => s.userId);
  const basketCount = usePaperStore((s) => s.basket.length);
  const hydratePaper = usePaperStore((s) => s.hydrate);

  useEffect(() => {
    hydratePaper(userId ?? "guest");
  }, [userId, hydratePaper]);

  return (
    <div className="paper-wash min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-bg/85 backdrop-blur-md print:hidden">
        <div className="mx-auto flex h-14 w-full max-w-[210mm] items-center justify-between gap-4 px-4 sm:h-16 sm:px-0">
          <Link to="/" className="flex items-center">
            <Logo compact />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map((item) => {
                const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "relative rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-secondary text-fg" : "text-muted-foreground hover:bg-secondary/70 hover:text-fg",
                    )}
                  >
                    {item.label}
                    {item.to === "/paper" && basketCount ? (
                      <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground">
                        {basketCount}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>
            <AuthSlot />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[210mm] px-4 pb-24 pt-6 sm:px-0 sm:pt-8 md:pb-12 print:max-w-none print:p-0">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden print:hidden">
        <ul className="grid grid-cols-4">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const isCapture = item.to === "/capture";
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "flex min-h-12 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "relative flex size-9 items-center justify-center rounded-full",
                      isCapture && "bg-primary text-primary-foreground",
                      isCapture && !active && "opacity-90",
                    )}
                  >
                    <Icon className="size-4" />
                    {item.to === "/paper" && basketCount ? (
                      <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground">
                        {basketCount}
                      </span>
                    ) : null}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
