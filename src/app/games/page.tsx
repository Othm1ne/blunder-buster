"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useAnalysis } from "@/components/AnalysisProvider";
import { Mascot } from "@/components/Mascot";
import { LoadingCard, ProgressBar } from "@/components/ProgressBar";
import { playerExists, SITE_NAME, type Site, type TimeClass } from "@/lib/chesscom";
import { lichessPlayerExists } from "@/lib/lichess";
import { isAnalyzed, type GameDoc } from "@/lib/analysis";
import { GameRow } from "@/components/GameRow";
import { TiltWarning } from "@/components/TiltWarning";
import { claimAutoSync, getProfile, hasSource, listGames, saveLichessUsername, saveUsername, syncGames, type SyncProgress, type UserProfile } from "@/lib/games";
import { REACT_MAX_GAMES, SyncReactions } from "@/components/SyncReactions";
import { useOpeningBook } from "@/lib/openings";
import { reviewCached, type ReviewedGame } from "@/lib/profile";

type Filter = "all" | TimeClass;

/** "Analyze" button targets your most recent games. */
const BATCH_GAMES = 50;
/** Rough average, used only for the time estimate. */
const SECONDS_PER_GAME = 25;

export default function GamesPage() {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [games, setGames] = useState<GameDoc[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Which username form is open. */
  const [editing, setEditing] = useState<Site | null>(null);
  /** Games the last sync brought in, for Sir Blunderbuss's reactions. */
  const [fresh, setFresh] = useState<GameDoc[] | null>(null);
  const analysis = useAnalysis();
  const book = useOpeningBook();
  /** The latest sync(), for the auto-sync when the page first loads. */
  const autoSync = useRef<((known: GameDoc[]) => void) | null>(null);

  const load = useCallback(async (uid: string) => {
    const [p, g] = await Promise.all([getProfile(uid), listGames(uid)]);
    setProfile(p);
    setGames(g);
    return g;
  }, []);

  const { enqueue: enqueueGames, results: liveResults } = analysis;
  const freshReviewed = useMemo<ReviewedGame[]>(() => {
    if (!fresh || book === undefined) return [];
    return fresh.flatMap((g) => {
      const a = g.analysis ?? liveResults.get(g.id);
      return a && isAnalyzed({ ...g, analysis: a }) ? [{ game: g, analysis: a, review: reviewCached(g, a, book) }] : [];
    });
  }, [fresh, liveResults, book]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([getProfile(user.uid), listGames(user.uid)])
      .then(([p, g]) => {
        if (cancelled) return;
        setProfile(p);
        setGames(g);
        // Opening the app pulls in the games you played since last time.
        if (claimAutoSync(p)) autoSync.current?.(g);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [user]);

  const sync = useCallback(async (known: GameDoc[] = games) => {
    if (!user) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const before = new Set(known.map((g) => g.id));
      const added = await syncGames(user.uid, setProgress);
      setProgress({ message: "Refreshing your game list…", percent: 100 });
      const all = await load(user.uid);
      const newGames = all.filter((g) => !before.has(g.id)).sort((a, b) => b.endTime - a.endTime);
      if (newGames.length <= REACT_MAX_GAMES) {
        setFresh(newGames);
        enqueueGames(newGames, { first: true });
      } else setStatus(`Imported ${added} new games!`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }, [user, load, games, enqueueGames]);
  useEffect(() => {
    autoSync.current = sync;
  }, [sync]);

  async function onSaveUsername(e: FormEvent<HTMLFormElement>, site: Site) {
    e.preventDefault();
    if (!user) return;
    const username = String(new FormData(e.currentTarget).get("username") ?? "").trim();
    if (!username) return;
    setBusy(true);
    setError(null);
    try {
      const exists = site === "lichess" ? lichessPlayerExists : playerExists;
      if (!(await exists(username))) throw new Error(`No ${SITE_NAME[site]} player called "${username}".`);
      await (site === "lichess" ? saveLichessUsername : saveUsername)(user.uid, username);
      setEditing(null);
      await load(user.uid);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeLichess() {
    if (!user) return;
    await saveLichessUsername(user.uid, null);
    await load(user.uid);
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
  const outdated = pending.filter((g) => g.analysis).length;
  const minutes = Math.max(1, Math.round((pending.length * SECONDS_PER_GAME) / 60));

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-wrap items-center gap-3">
        {hasSource(profile) && !editing ? (
          <>
            <div className="min-w-0">
              <h1 className="font-display text-2xl">Your games</h1>
              <p className="text-sm text-[var(--muted)]">
                {username && (
                  <>
                    Chess.com: <strong>{username}</strong>{" "}
                    <button className="underline" onClick={() => setEditing("chesscom")}>
                      change
                    </button>
                    {" · "}
                  </>
                )}
                {profile.lichessUsername ? (
                  <>
                    Lichess: <strong>{profile.lichessUsername}</strong>{" "}
                    <button className="underline" onClick={() => setEditing("lichess")}>
                      change
                    </button>{" "}
                    {username && (
                      <button className="underline" onClick={removeLichess}>
                        remove
                      </button>
                    )}
                  </>
                ) : (
                  <button className="underline" onClick={() => setEditing("lichess")}>
                    + also import from Lichess
                  </button>
                )}
                {!username && (
                  <>
                    {" · "}
                    <button className="underline" onClick={() => setEditing("chesscom")}>
                      + also import from Chess.com
                    </button>
                  </>
                )}
              </p>
            </div>
            <button className="btn-primary ml-auto" onClick={() => sync()} disabled={busy}>
              {busy ? "Syncing…" : "Sync new games"}
            </button>
          </>
        ) : (
          <UsernameForm
            site={editing ?? "chesscom"}
            current={editing === "lichess" ? profile.lichessUsername : username}
            busy={busy}
            onSubmit={onSaveUsername}
            onSwitch={!hasSource(profile) ? (site) => setEditing(site) : undefined}
            onCancel={hasSource(profile) ? () => setEditing(null) : undefined}
          />
        )}
        {progress && <ProgressBar percent={progress.percent} label={progress.message} />}
        {status && <p className="w-full text-sm">{status}</p>}
        {error && <p className="w-full text-sm text-[var(--bad)]">{error}</p>}
      </section>

      {fresh && !progress && <SyncReactions games={fresh} reviewed={freshReviewed} onClose={() => setFresh(null)} />}

      <TiltWarning games={games} />

      {hasSource(profile) && games.length > 0 && (
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
                <strong>{pending.length}</strong> of your latest {Math.min(BATCH_GAMES, games.length)} games{" "}
                {outdated === pending.length
                  ? "were analyzed with older, less precise engine settings."
                  : "haven't been checked for blunders yet."}
              </p>
              <button className="btn-primary" onClick={() => enqueue(pending)}>
                {outdated === pending.length ? "Re-analyze" : "Analyze"} them (~{minutes} min)
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

      {hasSource(profile) && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "rapid", "blitz"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border-2 border-[var(--line)] px-3 py-0.5 text-sm font-semibold capitalize ${
                  filter === f ? "border-[var(--gold)] bg-[var(--gold)] text-[var(--on-gold)]" : "bg-[var(--card)]"
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

function UsernameForm({
  site,
  current,
  busy,
  onSubmit,
  onSwitch,
  onCancel,
}: {
  site: Site;
  current?: string;
  busy: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>, site: Site) => void;
  /** First setup: pick the other site instead. */
  onSwitch?: (site: Site) => void;
  onCancel?: () => void;
}) {
  const other: Site = site === "lichess" ? "chesscom" : "lichess";
  return (
    <form key={site} onSubmit={(e) => onSubmit(e, site)} className="flex w-full flex-wrap items-center gap-3">
      <label className="font-display text-xl" htmlFor="username">
        Your {SITE_NAME[site]} username
      </label>
      <input
        id="username"
        name="username"
        defaultValue={current}
        autoComplete="off"
        autoCapitalize="none"
        className="min-w-40 flex-1 rounded-full border-2 border-[var(--line)] bg-[var(--paper)] px-4 py-1 outline-none focus:border-[var(--gold)]"
      />
      <button className="btn-primary" disabled={busy}>
        Save
      </button>
      {onCancel && (
        <button type="button" className="text-sm underline" onClick={onCancel}>
          Cancel
        </button>
      )}
      {onSwitch && (
        <button type="button" className="w-full text-left text-sm underline" onClick={() => onSwitch(other)}>
          I play on {SITE_NAME[other]} instead
        </button>
      )}
      {site === "lichess" && (
        <p className="w-full text-xs text-[var(--muted)]">
          Your rapid and blitz games from the last 3 months (up to 500). Rating goals keep using{" "}
          {onSwitch ? "Lichess" : "Chess.com"} ratings, so the two don&apos;t get mixed.
        </p>
      )}
    </form>
  );
}
