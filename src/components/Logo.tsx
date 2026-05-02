import { cn } from "@/lib/utils";

export function Logo({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-3xl",
    xl: "text-5xl",
  } as const;
  return (
    <span
      className={cn(
        "font-display font-medium tracking-wide text-gold",
        sizes[size],
        className,
      )}
    >
      WineSnap
    </span>
  );
}
