import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  hideNav = false,
  width = "compact",
}: {
  children: ReactNode;
  hideNav?: boolean;
  width?: "compact" | "content" | "wide";
}) {
  return (
    <div
      className="relative min-h-screen bg-background pb-28 text-foreground"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <main
        className={cn(
          "mx-auto w-full px-5 pt-6 sm:px-6",
          width === "compact" && "max-w-md",
          width === "content" && "max-w-3xl",
          width === "wide" && "max-w-6xl",
        )}
      >
        {children}
      </main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
