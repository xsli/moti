import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function AppErrorComponent({ error, reset }: ErrorComponentProps) {
  return (
    <main className="paper-wash flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-destructive" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="font-display text-xl font-semibold">本子打不开了</h1>
      <p className="max-w-md text-sm break-words text-muted-foreground">
        {error.message || "刷新后再试一次。"}
      </p>
      <button
        type="button"
        className="h-10 rounded-full bg-fg px-5 text-sm text-primary-foreground"
        onClick={() => {
          reset();
          window.location.assign("/");
        }}
      >
        回到本子
      </button>
    </main>
  );
}
