interface SkeletonProps {
  /** Announced to screen readers while the block is shown. */
  label?: string;
  /** Size of the placeholder, e.g. `h-24 w-full`. */
  className?: string;
}

export function Skeleton({ label = 'Loading', className = 'h-6 w-full' }: SkeletonProps) {
  return (
    <div role="status" className={`rounded bg-border motion-safe:animate-pulse ${className}`}>
      <span className="sr-only">{label}</span>
    </div>
  );
}
