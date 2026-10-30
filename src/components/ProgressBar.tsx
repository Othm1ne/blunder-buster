import { Mascot } from "./Mascot";

/** Chunky progress bar. Without `percent` it shows an animated "working on it" stripe. */
export function ProgressBar({ percent, label }: { percent?: number; label?: string }) {
  const known = percent !== undefined;
  const value = known ? Math.round(Math.min(100, Math.max(0, percent))) : 0;

  return (
    <div className="w-full" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={known ? value : undefined}>
      {(label || known) && (
        <div className="mb-1 flex justify-between gap-2 text-sm">
          <span className="truncate">{label}</span>
          {known && <span className="font-bold tabular-nums">{value}%</span>}
        </div>
      )}
      <div className="h-4 overflow-hidden rounded-full border-2 border-[var(--ink)] bg-[var(--paper)]">
        {known ? (
          <div className="h-full bg-[var(--gold)] transition-[width] duration-300" style={{ width: `${value}%` }} />
        ) : (
          <div className="progress-indeterminate h-full w-1/3 rounded-full bg-[var(--gold)]" />
        )}
      </div>
    </div>
  );
}

export function LoadingCard({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="card flex items-center gap-4">
      <div className="animate-bounce">
        <Mascot size={56} />
      </div>
      <div className="flex-1">
        <ProgressBar label={label} />
      </div>
    </div>
  );
}
