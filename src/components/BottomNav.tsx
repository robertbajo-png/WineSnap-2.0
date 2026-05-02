import { Link, useLocation } from "@tanstack/react-router";
import { Home, Search, Camera, Wine, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const { pathname } = useLocation();
  const left = [
    { to: "/", icon: Home, label: "Home" },
    { to: "/search", icon: Search, label: "Search" },
  ] as const;
  const right = [
    { to: "/cellar", icon: Wine, label: "Cellar" },
    { to: "/me", icon: User, label: "Profile" },
  ] as const;
  const scanActive = pathname === "/scan";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40">
      <div className="border-t border-white/8 bg-background/95 backdrop-blur-xl">
        <ul className="mx-auto flex max-w-md items-end justify-around px-4 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2">
          {left.map((it) => (
            <NavItem key={it.to} {...it} active={pathname === it.to} />
          ))}

          <li className="-mt-8">
            <Link
              to="/scan"
              aria-label="Scan"
              className={cn(
                "relative flex h-[68px] w-[68px] items-center justify-center rounded-full ring-4 ring-background transition-transform",
                "bg-gradient-to-b from-[oklch(0.82_0.13_80)] to-[oklch(0.62_0.15_50)]",
                "shadow-[0_8px_24px_-6px_oklch(0.78_0.13_75/0.5)]",
                scanActive ? "scale-105" : "hover:scale-105",
              )}
            >
              <Camera className="h-7 w-7 text-background" strokeWidth={2} />
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
    <li>
      <Link
        to={to}
        className={cn(
          "flex flex-col items-center gap-1 px-3 py-1.5 transition-colors",
          active ? "text-burgundy" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className={cn("h-5 w-5", active && "fill-burgundy/20")} strokeWidth={1.8} />
        <span className="text-[10px] font-medium tracking-wide">{label}</span>
      </Link>
    </li>
  );
}
