import { Link, useLocation } from "@tanstack/react-router";
import { Home, MessageCircleMore, CookingPot, Camera, Wine, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { pilotUiEnabled } from "@/features/pilot/feature";

export function BottomNav() {
  const { pathname } = useLocation();
  const t = useT();
  const left = [
    { to: "/", icon: Home, label: t("nav.home") },
    pilotUiEnabled
      ? { to: "/kitchen", icon: CookingPot, label: t("nav.kitchen") }
      : { to: "/ask", icon: MessageCircleMore, label: t("nav.ask") },
  ] as const;
  const right = [
    { to: "/cellar", icon: Wine, label: t("nav.cellar") },
    { to: "/me", icon: User, label: t("nav.profile") },
  ] as const;
  const scanActive = pathname === "/scan";
  const active = (to: string) =>
    pathname === to ||
    (pilotUiEnabled && to !== "/" && pathname.startsWith(to + "/")) ||
    (pilotUiEnabled && to === "/cellar" && (pathname.startsWith("/wine/") || pathname === "/ask"));

  return (
    <nav
      aria-label="WineSnap"
      className={cn("fixed bottom-0 left-0 right-0 z-40", pilotUiEnabled && "pilot-nav")}
    >
      <div className="h-[var(--bottom-nav-height)] border-t border-white/10 bg-background/90 shadow-elegant backdrop-blur-xl">
        <ul className="mx-auto grid h-full max-w-md grid-cols-5 items-end px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 md:max-w-[720px]">
          {left.map((it) => (
            <NavItem key={it.to} {...it} active={active(it.to)} />
          ))}

          <li className="-mt-5 flex justify-center">
            <Link
              to="/scan"
              aria-label={t("nav.scan")}
              aria-current={scanActive ? "page" : undefined}
              className={cn(
                "relative flex aspect-square h-auto w-14 max-w-full shrink-0 items-center justify-center rounded-full border-2 border-gold bg-background ring-4 ring-background transition-transform",
                pilotUiEnabled && "pilot-camera",
                scanActive ? "scale-105 shadow-gold-ring" : "shadow-soft hover:scale-105",
              )}
            >
              <Camera className="h-6 w-6 text-gold" strokeWidth={1.8} />
            </Link>
          </li>

          {right.map((it) => (
            <NavItem key={it.to} {...it} active={active(it.to)} />
          ))}
        </ul>
      </div>
    </nav>
  );
}

function NavItem({
  to,
  icon: Icon,
  label,
  active,
}: {
  to: string;
  icon: typeof Home;
  label: string;
  active: boolean;
}) {
  return (
    <li className="flex justify-center">
      <Link
        to={to}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-12 min-w-11 flex-col items-center justify-center gap-1 px-1 py-1 transition-colors",
          active ? "text-gold" : "text-muted-foreground hover:text-foreground",
          pilotUiEnabled && to === "/cellar" && active && "pilot-cellar-active",
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={1.8} />
        <span className="text-[13px] font-medium leading-tight">{label}</span>
      </Link>
    </li>
  );
}
