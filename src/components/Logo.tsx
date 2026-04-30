import { cn } from "@/lib/utils";
import { Wine } from "lucide-react";

export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "text-xl", md: "text-2xl", lg: "text-4xl" };
  const iconSizes = { sm: "h-7 w-7", md: "h-9 w-9", lg: "h-12 w-12" };
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative flex items-center justify-center rounded-full bg-gradient-wine shadow-elegant",
          iconSizes[size],
        )}
      >
        <Wine className="h-1/2 w-1/2 text-[oklch(0.92_0.04_85)]" strokeWidth={1.6} />
      </span>
      <span className={cn("font-display font-medium tracking-tight", sizes[size])}>
        Wine<span className="text-burgundy">Snap</span>
      </span>
    </div>
  );
}
