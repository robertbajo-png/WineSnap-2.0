import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

export function AppShell({ children, hideNav = false }: { children: ReactNode; hideNav?: boolean }) {
  return (
    <div
      className="relative min-h-screen bg-background pb-24"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[60vh] opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, oklch(0.55 0.18 18 / 0.18) 0%, transparent 70%)",
        }}
      />
      <main className="mx-auto w-full max-w-md px-5 pt-6">{children}</main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
