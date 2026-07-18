import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mt-10 rounded-2xl border border-white/8 bg-card/40 px-6 py-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-gold/30 bg-background/60">
        <Icon className="h-5 w-5 text-gold/80" strokeWidth={1.6} />
      </div>
      <p className="mt-4 font-display text-base text-cream">{title}</p>
      {description && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
