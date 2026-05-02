import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

export function AppShell({ children, hideNav = false }: { children: ReactNode; hideNav?: boolean }) {
  return (
    <div
      className="relative min-h-screen bg-background pb-28 text-foreground"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[55vh] bg-gradient-dim opacity-90"
      />
      <main className="mx-auto w-full max-w-md px-5 pt-6">{children}</main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
