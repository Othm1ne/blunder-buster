"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useAnalysis } from "@/components/AnalysisProvider";
import { Mascot } from "@/components/Mascot";
import { LoadingCard, ProgressBar } from "@/components/ProgressBar";
import { playerExists, type TimeClass } from "@/lib/chesscom";
import { isAnalyzed, type GameAnalysis, type GameDoc } from "@/lib/analysis";
import { reviewGame } from "@/lib/classify";
import { explain, LABEL_STYLE, MISTAKE_NAMES, moveName } from "@/lib/describe";
import { getProfile, listGames, saveUsername, syncGames, type SyncProgress, type UserProfile } from "@/lib/games";

type Filter = "all" | TimeClass;

/** "Analyze" button targets your most recent games. */
const BATCH_GAMES = 50;
/** Rough average, used only for the time estimate. */
const SECONDS_PER_GAME = 10;

const RESULT_STYLE = {
  win: { label: "W", color: "var(--good)" },
  loss: { label: "L", color: "var(--bad)" },
  draw: { label: "D", color: "var(--muted)" },
} as const;

function formatTimeControl(tc: string): string {
  const [base, inc] = tc.split("+").map(Number);
  return `${Math.round(base / 60)}${inc ? `+${inc}` : " min"}`;
}

export default function GamesPage() {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [games, setGames] = useState<GameDoc[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const analysis = useAnalysis();

  const load = useCallback(async (uid: string) => {
    const [p, g] = await Promise.all([getProfile(uid), listGames(uid)]);
    setProfile(p);
    setGames(g);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([getProfile(user.uid), listGames(user.uid)])
      .then(([p, g]) => {
        if (cancelled) return;
        setProfile(p);
        setGames(g);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [user]);

  const sync = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const added = await syncGames(user.uid, setProgress);
      setProgress({ message: "Refreshing your game list…", percent: 100 });
      await load(user.uid);
      setStatus(added ? `Imported ${added} new game${added === 1 ? "" : "s"}!` : "No new games. Go play one!");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }, [user, load]);

  async function onSaveUsername(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    const username = String(new FormData(e.currentTarget).get("username") ?? "").trim();
    if (!username) return;
    setBusy(true);
    setError(null);
    try {
      if (!(await playerExists(username))) throw new Error(`No Chess.com player called "${username}".`);
      await saveUsername(user.uid, username);
      setEditing(false);
      await load(user.uid);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingCard />;
  if (!user) {
    return (
      <div className="card flex items-center gap-4">
        <Mascot mood="shocked" size={72} />
        <p>Sign in first so I can keep your games safe.</p>
      </div>
    );
  }
  if (!profile) return <LoadingCard label="Fetching your games…" />;

  const username = profile.chessComUsername;
  const shown = filter === "all" ? games : games.filter((g) => g.timeClass === filter);
  const tally = { win: 0, loss: 0, draw: 0 };
  for (const g of shown) tally[g.result]++;

  const { enqueue, cancel, queuedIds, current, results, run } = analysis;
  const done = (g: GameDoc) => isAnalyzed(g) || results.has(g.id);
  const pending = games.slice(0, BATCH_GAMES).filter((g) => !done(g));
  const minutes = Math.max(1, Math.round((pending.length * SECONDS_PER_GAME) / 60));

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-wrap items-center gap-3">
        {username && !editing ? (
          <>
            <div>
              <h1 className="font-display text-2xl">Your games</h1>
              <p className="text-sm text-[var(--muted)]">
                Chess.com: <strong>{username}</strong>{" "}
                <button className="underline" onClick={() => setEditing(true)}>
                  change
                </button>
              </p>
            </div>
            <button className="btn-primary ml-auto" onClick={sync} disabled={busy}>
              {busy ? "Syncing…" : "Sync new games"}
            </button>
          </>
        ) : (
          <form onSubmit={onSaveUsername} className="flex flex-wrap items-center gap-3 w-full">
            <label className="font-display text-xl" htmlFor="username">
              Your Chess.com username
            </label>
            <input
              id="username"
              name="username"
              defaultValue={username}
              autoComplete="off"
              className="flex-1 min-w-40 rounded-full border-3 border-[var(--ink)] bg-[var(--paper)] px-4 py-1"
            />
            <button className="btn-primary" disabled={busy}>
              Save
            </button>
          </form>
        )}
        {progress && <ProgressBar percent={progress.percent} label={progress.message} />}
        {status && <p className="w-full text-sm">{status}</p>}
        {error && <p className="w-full text-sm text-[var(--bad)]">{error}</p>}
      </section>

      {username && games.length > 0 && (
        <section className="card flex flex-wrap items-center gap-3">
          <Mascot mood={run ? "happy" : pending.length ? "shocked" : "proud"} size={56} />
          {run ? (
            <>
              <div className="min-w-48 flex-1">
                <ProgressBar
                  percent={run.percent}
                  label={`Analyzing game ${Math.min(run.finished + 1, run.total)}/${run.total}${
                    current ? ` · position ${current.done}/${current.total}` : ""
                  }`}
                />
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Keep this tab open. You can browse other pages meanwhile.
                </p>
              </div>
              <button className="btn-secondary" onClick={cancel}>
                Stop
              </button>
            </>
          ) : pending.length ? (
            <>
              <p className="flex-1">
                <strong>{pending.length}</strong> of your latest {Math.min(BATCH_GAMES, games.length)} games
                haven&apos;t been checked for blunders yet.
              </p>
              <button className="btn-primary" onClick={() => enqueue(pending)}>
                Analyze them (~{minutes} min)
              </button>
            </>
          ) : (
            <p className="flex-1">
              All your latest {Math.min(BATCH_GAMES, games.length)} games are analyzed. Sir Blunderbuss is ready!
            </p>
          )}
          {analysis.error && <p className="w-full text-sm text-[var(--bad)]">{analysis.error}</p>}
        </section>
      )}

      {username && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "rapid", "blitz"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border-2 border-[var(--ink)] px-3 py-0.5 text-sm font-semibold capitalize ${
                  filter === f ? "bg-[var(--ink)] text-[var(--paper)]" : ""
                }`}
              >
                {f}
              </button>
            ))}
            <span className="ml-auto text-sm text-[var(--muted)]">
              {shown.length} games · <span style={{ color: "var(--good)" }}>{tally.win}W</span> /{" "}
              <span style={{ color: "var(--bad)" }}>{tally.loss}L</span> / {tally.draw}D
            </span>
          </div>

          {shown.length === 0 ? (
            <div className="card flex items-center gap-4">
              <Mascot size={64} />
              <p>No games yet. Hit &quot;Sync new games&quot; to import your last 3 months.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {shown.map((g) => (
                <GameRow
                  key={g.id}
                  game={g}
                  analysis={g.analysis ?? results.get(g.id)}
                  queued={queuedIds.has(g.id)}
                  percent={current?.id === g.id ? (current.done / current.total) * 100 : undefined}
                  onAnalyze={() => enqueue([g], { first: true })}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function GameRow({
  game: g,
  analysis,
  queued,
  percent,
  onAnalyze,
}: {
  game: GameDoc;
  analysis?: GameAnalysis;
  queued: boolean;
  percent?: number;
  onAnalyze: () => void;
}) {
  const [open, setOpen] = useState(false);
  const review = useMemo(
    () => (analysis ? reviewGame(g.moves, analysis.evals, g.myColor, g.result, g.clocks) : null),
    [analysis, g],
  );
  const r = RESULT_STYLE[g.result];
  const mistakes = review?.moves.filter((m) => m.mine && (m.label === "blunder" || m.label === "mistake")) ?? [];
  const chip = "shrink-0 rounded-full border-2 border-[var(--ink)] px-2 py-0.5 text-xs font-semibold tabular-nums";

  return (
    <li className="card !py-2">
      <div className="flex items-center gap-3">
        <span className="font-display grid size-9 shrink-0 place-items-center rounded-full text-white" style={{ background: r.color }}>
          {r.label}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            vs {g.oppName} <span className="text-[var(--muted)] font-normal">({g.oppRating})</span>
          </p>
          <p className="truncate text-xs text-[var(--muted)]">
            {g.opening} · {Math.ceil(g.moves.length / 2)} moves · {g.resultDetail}
          </p>
        </div>
        <div className="hidden text-right text-xs text-[var(--muted)] shrink-0 sm:block">
          <p>
            {g.myColor === "white" ? "♔" : "♚"} {g.myRating} · {formatTimeControl(g.timeControl)}
          </p>
          <p>{new Date(g.endTime).toLocaleDateString()}</p>
        </div>
        {review ? (
          <button onClick={() => setOpen(!open)} className="flex shrink-0 items-center gap-1" aria-expanded={open}>
            <span className={chip} title="Your accuracy">
              {Math.round(review.accuracy)}%
            </span>
            <span className={chip} style={{ color: LABEL_STYLE.blunder.color }} title="Blunders">
              {review.counts.blunder}??
            </span>
            <span className={chip} style={{ color: LABEL_STYLE.mistake.color }} title="Mistakes">
              {review.counts.mistake}?
            </span>
            <span className="text-xs">{open ? "▲" : "▼"}</span>
          </button>
        ) : (
          <AnalysisBadge queued={queued} percent={percent} onAnalyze={onAnalyze} />
        )}
        <a href={g.url} target="_blank" rel="noreferrer" className="hidden text-xs underline shrink-0 sm:inline">
          chess.com
        </a>
      </div>

      {open && review && (
        <div className="mt-3 border-t-2 border-dashed border-[var(--muted)] pt-3 text-sm">
          {mistakes.length === 0 ? (
            <p className="flex items-center gap-2">
              <Mascot mood="proud" size={32} /> Clean game: no mistakes or blunders. Sir Blunderbuss is proud!
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {mistakes.map((m) => (
                <li key={m.ply} className="flex gap-2">
                  <span className="font-bold shrink-0" style={{ color: LABEL_STYLE[m.label].color }}>
                    {moveName(m)}
                    {LABEL_STYLE[m.label].symbol}
                  </span>
                  <span>
                    {m.type && <strong>{MISTAKE_NAMES[m.type]}: </strong>}
                    {explain(m)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {review.failedToConvert && (
            <p className="mt-2 text-[var(--muted)]">
              You were winning ({Math.round(review.peakWin)}% chances) but didn&apos;t win this one.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function AnalysisBadge({
  queued,
  percent,
  onAnalyze,
}: {
  queued: boolean;
  percent?: number;
  onAnalyze: () => void;
}) {
  const base = "shrink-0 rounded-full border-2 border-[var(--ink)] px-2 py-0.5 text-xs font-semibold";
  if (percent !== undefined) return <span className={`${base} bg-[var(--gold)] tabular-nums`}>{Math.round(percent)}%</span>;
  if (queued) return <span className={`${base} text-[var(--muted)]`}>queued</span>;
  return (
    <button className={`${base} hover:bg-[var(--gold)]`} onClick={onAnalyze}>
      Analyze
    </button>
  );
}
