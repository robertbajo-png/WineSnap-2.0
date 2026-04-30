import { Link, useLocation } from "@tanstack/react-router";
import { Camera, Clock, Sparkles, Grape, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const { pathname } = useLocation();
  const items = [
    { to: "/", icon: Camera, label: "Skanna" },
    { to: "/history", icon: Clock, label: "Historik" },
    { to: "/for-you", icon: Sparkles, label: "För dig" },
    { to: "/taste", icon: Grape, label: "Smak" },
    { to: "/me", icon: User, label: "Profil" },
  ] as const;
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/85 backdrop-blur-xl">
      <ul className="mx-auto flex max-w-md items-center justify-around px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2">
        {items.map(({ to, icon: Icon, label }) => {
          const active = pathname === to;
          return (
            <li key={to}>
              <Link
                to={to}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon
                  className={cn("h-5 w-5 transition-transform", active && "scale-110")}
                  strokeWidth={1.6}
                />
                <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
