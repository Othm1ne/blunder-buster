"use client";

import Link from "next/link";
import { Mascot } from "@/components/Mascot";
import { useAnalysis } from "@/components/AnalysisProvider";
import type { GameDoc } from "@/lib/analysis";
import type { ReviewedGame } from "@/lib/profile";
import { reactTo } from "@/lib/reactions";

/** Reactions shown for at most this many new games (the latest). */
const MAX_SHOWN = 3;
/** A bigger sync (like the first 3-month import) gets no reactions and no automatic analysis. */
export const REACT_MAX_GAMES = 10;

/** Sir Blunderbuss reacts to the games you just synced. Reactions upgrade once a game is analyzed. */
export function SyncReactions({
  games,
  reviewed,
  onClose,
}: {
  /** The newly synced games, latest first. Empty = the sync found nothing new. */
  games: GameDoc[];
  reviewed: ReviewedGame[] | null;
  onClose: () => void;
}) {
  const { queuedIds, current } = useAnalysis();

  if (!games.length)
    return (
      <section className="card pop-in flex flex-wrap items-center gap-3">
        <Mascot size={48} />
        <p className="min-w-0 flex-1 text-sm">No new games yet. Go play one, Sir Blunderbuss is waiting!</p>
        <button className="text-sm underline" onClick={onClose}>
          OK
        </button>
      </section>
    );

  const byId = new Map(reviewed?.map((r) => [r.game.id, r.review]));
  const extra = games.length - MAX_SHOWN;
  return (
    <section className="flex flex-col gap-2" aria-live="polite">
      {games.slice(0, MAX_SHOWN).map((g) => {
        const review = byId.get(g.id);
        const r = reactTo(g, review);
        const busy = !review && (queuedIds.has(g.id) || current?.id === g.id);
        return (
          <div key={g.id} className="card pop-in flex flex-wrap items-center gap-3">
            <Mascot mood={r.mood} size={56} />
            <div className="min-w-48 flex-1">
              <p className="font-display text-lg">{r.title}</p>
              <p className="text-sm text-[var(--muted)]">
                {busy && current?.id === g.id ? `Analyzing (${Math.round((current.done / current.total) * 100)}%)… ` : ""}
                {r.line}
              </p>
            </div>
            {review && (
              <Link href={`/review?id=${g.id}`} className="btn-primary text-sm">
                Review it
              </Link>
            )}
          </div>
        );
      })}
      <div className="flex justify-end gap-3 text-sm">
        {extra > 0 && (
          <Link href="/games" className="underline">
            +{extra} more on the Games page
          </Link>
        )}
        <button className="underline" onClick={onClose}>
          Hide
        </button>
      </div>
    </section>
  );
}
