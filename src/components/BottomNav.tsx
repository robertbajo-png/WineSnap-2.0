import { Link, useLocation } from "@tanstack/react-router";
import { Home, Search, Camera, Wine, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const { pathname } = useLocation();
  const left = [
    { to: "/for-you", icon: Home, label: "Hem" },
    { to: "/history", icon: Search, label: "Sök" },
  ] as const;
  const right = [
    { to: "/taste", icon: Wine, label: "Källare" },
    { to: "/me", icon: User, label: "Profil" },
  ] as const;
  const scanActive = pathname === "/";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40">
      <div className="glass-dark border-t border-white/5">
        <ul
          className="mx-auto flex max-w-md items-end justify-around px-4 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2"
          style={{ paddingTop: "0.5rem" }}
        >
          {left.map((it) => (
            <NavItem key={it.to} {...it} active={pathname === it.to} />
          ))}

          {/* Central FAB */}
          <li className="-mt-7">
            <Link
              to="/"
              aria-label="Skanna"
              className={cn(
                "relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-gold shadow-glow ring-4 ring-background transition-transform",
                scanActive && "scale-105",
              )}
            >
              <Camera className="h-6 w-6 text-background" strokeWidth={2} />
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
          "flex flex-col items-center gap-1 px-2 py-1.5 transition-colors",
          active ? "text-gold" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={1.6} />
        <span className="text-[10px] font-medium">{label}</span>
      </Link>
    </li>
  );
}
