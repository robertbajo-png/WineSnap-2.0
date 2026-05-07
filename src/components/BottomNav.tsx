import { Link, useLocation } from "@tanstack/react-router";
import { Home, Sparkles, Camera, Wine, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

export function BottomNav() {
  const { pathname } = useLocation();
  const t = useT();
  const left = [
    { to: "/", icon: Home, label: t("nav.home") },
    { to: "/for-you", icon: Sparkles, label: t("nav.forYou") },
  ] as const;
  const right = [
    { to: "/cellar", icon: Wine, label: t("nav.cellar") },
    { to: "/me", icon: User, label: t("nav.profile") },
  ] as const;
  const scanActive = pathname === "/scan";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40">
      <div className="border-t border-white/8 bg-background/95 backdrop-blur-xl">
        <ul className="mx-auto grid max-w-md grid-cols-5 items-end px-4 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2">
          {left.map((it) => (
            <NavItem key={it.to} {...it} active={pathname === it.to} />
          ))}

          <li className="-mt-7 flex justify-center">
            <Link
              to="/scan"
              aria-label="Scan"
              className={cn(
                "relative flex h-[64px] w-[64px] items-center justify-center rounded-full border-2 border-gold bg-background ring-4 ring-background transition-transform",
                scanActive ? "scale-105" : "hover:scale-105",
              )}
            >
              <Camera className="h-7 w-7 text-gold" strokeWidth={1.6} />
            </Link>
          </li>

          {right.map((it) => (
            <NavItem key={it.to} {...it} active={pathname === it.to} />
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
        className={cn(
          "flex flex-col items-center gap-1 px-2 py-1.5 transition-colors",
          active ? "text-gold" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={1.8} />
        <span className="text-[10px] font-medium tracking-wide">{label}</span>
      </Link>
    </li>
  );
}
