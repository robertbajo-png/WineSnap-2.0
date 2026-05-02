import { cn } from "@/lib/utils";

export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "text-xl", md: "text-2xl", lg: "text-4xl" };
  return (
    <span
      className={cn(
        "font-display font-medium tracking-tight text-gold",
        sizes[size],
        className,
      )}
    >
      WineSnap
    </span>
  );
}
