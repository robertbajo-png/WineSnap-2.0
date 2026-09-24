import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

export function AppShell({ children, hideNav = false }: { children: ReactNode; hideNav?: boolean }) {
  return (
    <div
      className="relative min-h-screen overflow-hidden bg-background pb-28 text-foreground"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-10%,oklch(0.5_0.18_18/0.18),transparent_34%),linear-gradient(180deg,oklch(0.16_0.012_30),oklch(0.09_0.006_30)_72%)]"
      />
      <main className="relative z-10 mx-auto w-full max-w-md px-5 pt-6">{children}</main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
