import { Skeleton } from "@/components/ui/skeleton";

export function ProductCardSkeleton() {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border bg-card p-5">
      <Skeleton className="size-16 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3.5 w-1/4" />
      </div>
      <Skeleton className="h-14 w-12 shrink-0 rounded-lg" />
    </div>
  );
}

export function FeedSkeleton({ withChips = false }: { withChips?: boolean }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Skeleton className="h-9 w-3/5" />
      {withChips && (
        <div className="mt-5 flex flex-wrap gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-16 rounded-4xl" />
          ))}
        </div>
      )}
      <div className="mt-8 flex flex-col gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-20 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-4 w-1/4" />
        </div>
        <Skeleton className="h-16 w-14 shrink-0 rounded-lg" />
      </div>
      <div className="mt-5 flex gap-1.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-16 rounded-4xl" />
        ))}
        <Skeleton className="ml-auto h-9 w-32 rounded-lg" />
      </div>
      <div className="mt-8 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 shrink-0 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="mt-10 h-6 w-32" />
      <div className="mt-3 flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
