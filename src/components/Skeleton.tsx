import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-gradient-to-r from-white/5 via-white/10 to-white/5 bg-[length:200%_100%]",
        className,
      )}
    />
  );
}

export function CellarRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-card/40 p-3">
      <Skeleton className="h-[72px] w-[54px]" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

export function WineDetailSkeleton() {
  return (
    <div className="mt-4 space-y-4">
      <div className="flex gap-4">
        <Skeleton className="h-36 w-24 rounded-xl" />
        <div className="flex-1 space-y-2 pt-2">
          <Skeleton className="h-6 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  );
}
