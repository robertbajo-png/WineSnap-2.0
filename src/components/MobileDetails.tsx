import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileDetails({
  title,
  children,
  defaultOpen = false,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className={cn("mobile-details", className)}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        {title}
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="min-w-0 pb-4">{children}</div>
    </details>
  );
}

export function revealInvalidField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return;
  let section = target.closest("details");
  while (section) {
    section.open = true;
    section = section.parentElement?.closest("details") ?? null;
  }
}
