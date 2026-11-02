import { Mascot } from "./Mascot";
import type { GameDoc } from "@/lib/analysis";
import { tiltWarning, type TiltStats } from "@/lib/insights";

/** "Take a break?" card after a losing streak in the current session. Renders nothing otherwise. */
export function TiltWarning({ games, stats }: { games: GameDoc[]; stats?: TiltStats | null }) {
  const warning = tiltWarning(games);
  if (!warning) return null;
  const drop = stats ? stats.otherwise.accuracy - stats.afterLoss.accuracy : 0;
  return (
    <section className="card flex flex-wrap items-center gap-4" style={{ borderColor: "var(--bad)" }}>
      <Mascot mood="shocked" size={64} />
      <div className="min-w-56 flex-1">
        <h2 className="font-display text-xl">Take a break?</h2>
        <p className="text-sm">
          You lost your last {warning.losses} games in a row. Tilted players rush and blunder more.
          {drop >= 3 &&
            ` Your own numbers agree: right after a loss your accuracy drops to ${Math.round(stats!.afterLoss.accuracy)}% (from ${Math.round(stats!.otherwise.accuracy)}%).`}
        </p>
        <p className="text-sm text-[var(--muted)]">
          Sir Blunderbuss suggests 10 minutes away from the board, or a few calm puzzles instead.
        </p>
      </div>
    </section>
  );
}
