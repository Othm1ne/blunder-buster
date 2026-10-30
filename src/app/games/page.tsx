"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Mascot } from "@/components/Mascot";
import { LoadingCard, ProgressBar } from "@/components/ProgressBar";
import { playerExists, type StoredGame, type TimeClass } from "@/lib/chesscom";
import { getProfile, listGames, saveUsername, syncGames, type SyncProgress, type UserProfile } from "@/lib/games";

type Filter = "all" | TimeClass;

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
  const [games, setGames] = useState<StoredGame[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

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
              {shown.map((g) => {
                const r = RESULT_STYLE[g.result];
                return (
                  <li key={g.id} className="card flex items-center gap-3 !py-2">
                    <span
                      className="font-display grid size-9 shrink-0 place-items-center rounded-full text-white"
                      style={{ background: r.color }}
                    >
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
                    <div className="text-right text-xs text-[var(--muted)] shrink-0">
                      <p>
                        {g.myColor === "white" ? "♔" : "♚"} {g.myRating} · {formatTimeControl(g.timeControl)}
                      </p>
                      <p>{new Date(g.endTime).toLocaleDateString()}</p>
                    </div>
                    <a href={g.url} target="_blank" rel="noreferrer" className="text-xs underline shrink-0">
                      chess.com
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
