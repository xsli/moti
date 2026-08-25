import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { authEnabled, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";

export function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  const [signingOut, setSigningOut] = useState(false);

  if (!authEnabled) {
    return <span className="text-xs text-muted-foreground">预览</span>;
  }

  if (isPending) {
    return <div className="size-8 animate-pulse rounded-full bg-secondary" aria-hidden="true" />;
  }

  if (!user) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link to="/login">登录</Link>
      </Button>
    );
  }

  const label = user.displayName ?? user.primaryEmail ?? "已登录";

  return (
    <div className="flex items-center gap-2">
      {user.profileImageUrl ? (
        <img src={user.profileImageUrl} alt="" className="size-8 rounded-full object-cover" />
      ) : (
        <span className="grid size-8 place-items-center rounded-full bg-secondary text-sm font-medium">
          {label.charAt(0)}
        </span>
      )}
      <span className="hidden max-w-[7.5rem] truncate text-sm md:inline">{label}</span>
      <button
        type="button"
        disabled={signingOut}
        onClick={() => {
          setSigningOut(true);
          void signOut().catch(() => setSigningOut(false));
        }}
        className="text-sm text-muted-foreground transition-colors hover:text-fg disabled:opacity-60"
      >
        {signingOut ? "退出中" : "退出"}
      </button>
    </div>
  );
}
