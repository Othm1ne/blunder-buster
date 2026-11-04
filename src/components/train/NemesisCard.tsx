import Link from "next/link";
import { ProgressBar } from "@/components/ProgressBar";
import { MISTAKE_NAMES } from "@/lib/describe";
import { THEMES } from "@/lib/puzzles";
import { NEMESIS_HP, NEMESIS_NAMES, type NemesisState } from "@/lib/training";

/** Your nemesis: your worst weakness as a boss with HP, beaten with puzzles of its theme. */
export function NemesisCard({ nemesis, onNext }: { nemesis?: NemesisState; onNext: () => void }) {
  if (!nemesis)
    return (
      <section className="card flex flex-wrap items-center gap-4">
        <span className="text-5xl" aria-hidden>
          👹
        </span>
        <p className="min-w-0 flex-1 text-sm">
          Your nemesis appears once your games show a weakness with a few puzzles to fight it. Analyze more games!
        </p>
        <Link href="/games" className="btn-secondary">
          Games
        </Link>
      </section>
    );

  const hp = Math.max(0, NEMESIS_HP - nemesis.hits);
  const defeated = hp === 0;
  return (
    <section className="card flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <span className={`text-5xl ${defeated ? "grayscale" : ""}`} aria-hidden>
          {defeated ? "💀" : "👹"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Your nemesis</p>
          <h2 className="font-display text-xl">{NEMESIS_NAMES[nemesis.type]}</h2>
          <p className="text-sm text-[var(--muted)]">
            Born from your #1 weakness: {MISTAKE_NAMES[nemesis.type].toLowerCase()}. Every {THEMES[nemesis.theme].name} puzzle you
            solve first try hits it; every miss heals it.
          </p>
        </div>
      </div>
      <ProgressBar percent={(hp / NEMESIS_HP) * 100} label={defeated ? "Defeated!" : `${hp}/${NEMESIS_HP} HP`} />
      {defeated ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--good)]">
            You beat {NEMESIS_NAMES[nemesis.type]}! Sir Blunderbuss is impressed.
          </p>
          <button className="btn-primary" onClick={onNext}>
            Face your next nemesis
          </button>
        </div>
      ) : (
        <Link href="/puzzles?nemesis=1" className="btn-primary self-start">
          ⚔️ Fight ({THEMES[nemesis.theme].name} puzzles)
        </Link>
      )}
      {!!nemesis.beaten?.length && (
        <p className="text-xs text-[var(--muted)]">Beaten so far: {nemesis.beaten.map((b) => NEMESIS_NAMES[b.type]).join(", ")}</p>
      )}
    </section>
  );
}
