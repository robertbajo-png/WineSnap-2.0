import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { useT } from "@/i18n";

export function AppShell({
  children,
  hideNav = false,
}: {
  children: ReactNode;
  hideNav?: boolean;
}) {
  const t = useT();
  return (
    <div
      className="relative min-h-screen overflow-x-clip bg-background pb-[calc(var(--bottom-nav-height)+1rem)] text-foreground"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <a
        href="#winesnap-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-5 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2"
      >
        {t("common.skipToContent")}
      </a>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-10%,oklch(0.5_0.18_18/0.18),transparent_34%),linear-gradient(180deg,oklch(0.16_0.012_30),oklch(0.09_0.006_30)_72%)]"
      />
      <main
        id="winesnap-content"
        tabIndex={-1}
        className={`relative z-10 mx-auto w-full max-w-md px-5 pt-6 ${hideNav ? "" : "md:max-w-[720px]"}`}
      >
        {children}
      </main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
