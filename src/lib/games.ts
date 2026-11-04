import { collection, deleteField, doc, getDoc, getDocs, limit, orderBy, query, setDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { archiveLabel, fetchArchive, fetchArchiveUrls, toStoredGame, type StoredGame } from "./chesscom";
import { fetchLichessGames, lichessToStored } from "./lichess";
import type { GameDoc } from "./analysis";
import type { RatingGoal } from "./goal";

// Firestore layout:
//   users/{uid}               -> UserProfile
//   users/{uid}/games/{id}    -> GameDoc (StoredGame from the import + `analysis` from Stockfish)

export type UserProfile = {
  chessComUsername?: string;
  /** Past months that are fully imported; they never change, so we skip them next time. */
  syncedArchives?: string[];
  /** endTime of the newest imported game, so the current month only writes new games. */
  latestEndTime?: number;
  lastSyncAt?: number;
  /** Optional second source (V2). */
  lichessUsername?: string;
  /** lastMoveAt of the newest imported Lichess game. */
  lichessLatestEndTime?: number;
  /** Day-1 snapshot, so progress can be measured later (M6). */
  baseline?: Baseline;
  /** Rating goal mode (V2). */
  goal?: RatingGoal;
};

export type Baseline = {
  createdAt: number;
  /** Latest Chess.com ratings at the time (missing if no games of that type). */
  rapidRating?: number;
  blitzRating?: number;
  blundersPerGame: number;
  mistakesPerGame: number;
  accuracy: number;
  games: number;
};

export async function saveBaseline(uid: string, baseline: Baseline): Promise<void> {
  await setDoc(userRef(uid), { baseline }, { merge: true });
}

/** How far back the first sync goes. */
const MAX_MONTHS = 3;
const BATCH_SIZE = 400; // Firestore allows 500 writes per batch

const userRef = (uid: string) => doc(db(), "users", uid);
const gamesCol = (uid: string) => collection(db(), "users", uid, "games");

export async function getProfile(uid: string): Promise<UserProfile> {
  const snap = await getDoc(userRef(uid));
  return (snap.data() as UserProfile | undefined) ?? {};
}

export async function saveUsername(uid: string, username: string): Promise<void> {
  // A new username means a fresh import.
  await setDoc(userRef(uid), { chessComUsername: username.toLowerCase(), syncedArchives: [], latestEndTime: 0 }, { merge: true });
  forgetGames();
}

/** Pass null to stop importing from Lichess (games already imported stay). */
export async function saveLichessUsername(uid: string, username: string | null): Promise<void> {
  await setDoc(
    userRef(uid),
    username
      ? { lichessUsername: username.toLowerCase(), lichessLatestEndTime: 0 }
      : { lichessUsername: deleteField(), lichessLatestEndTime: deleteField() },
    { merge: true },
  );
}

export const hasSource = (p: UserProfile) => Boolean(p.chessComUsername || p.lichessUsername);

/** Auto-sync when the app opens: at most once per visit, and not if the last sync was this recent. */
const AUTO_SYNC_AFTER = 20 * 60 * 1000;
let autoSynced = false;

/** True once per visit when the games are worth refreshing. Calling it claims the auto-sync. */
export function claimAutoSync(p: UserProfile): boolean {
  if (autoSynced || !hasSource(p) || typeof navigator === "undefined" || !navigator.onLine) return false;
  if (p.lastSyncAt && Date.now() - p.lastSyncAt < AUTO_SYNC_AFTER) return false;
  autoSynced = true;
  return true;
}

export async function getGame(uid: string, id: string): Promise<GameDoc | null> {
  const snap = await getDoc(doc(gamesCol(uid), id));
  return snap.exists() ? (snap.data() as GameDoc) : null;
}

// The game list is a few MB with all the engine evals, so it's kept for the session: switching
// pages is then instant (and costs no Firestore reads). Whatever writes a game calls forgetGames().
let listed: { key: string; games: Promise<GameDoc[]> } | null = null;

export function forgetGames(): void {
  listed = null;
}

/** Newest first. Treat the result as read-only: it's shared between pages. */
export function listGames(uid: string, max = 300): Promise<GameDoc[]> {
  const key = `${uid}:${max}`;
  if (listed?.key !== key) {
    const games = getDocs(query(gamesCol(uid), orderBy("endTime", "desc"), limit(max))).then((snap) =>
      snap.docs.map((d) => d.data() as GameDoc),
    );
    listed = { key, games };
    games.catch(() => {
      if (listed?.games === games) listed = null;
    });
  }
  return listed.games;
}

async function writeGames(uid: string, games: StoredGame[], onSaved: (saved: number) => void): Promise<void> {
  for (let i = 0; i < games.length; i += BATCH_SIZE) {
    const chunk = games.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db());
    // merge: never wipes analysis fields that later phases add to the same document.
    for (const g of chunk) batch.set(doc(gamesCol(uid), g.id), g, { merge: true });
    await batch.commit();
    forgetGames();
    onSaved(i + chunk.length);
  }
}

export type SyncProgress = { message: string; percent: number };

/** Imports new rapid/blitz games from Chess.com and/or Lichess. Returns how many were added. */
export async function syncGames(uid: string, onProgress: (p: SyncProgress) => void): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("You're offline. Sync again when you're back online.");
  onProgress({ message: "Checking your accounts…", percent: 2 });
  const profile = await getProfile(uid);
  if (!hasSource(profile)) throw new Error("Set your Chess.com or Lichess username first.");

  // Each site gets its share of the bar.
  const both = profile.chessComUsername && profile.lichessUsername;
  const share = (from: number, to: number) => (p: SyncProgress) => onProgress({ ...p, percent: from + ((to - from) * p.percent) / 100 });

  let added = 0;
  const update: Partial<UserProfile> = {};
  if (profile.chessComUsername) {
    const r = await syncChessCom(uid, profile, both ? share(0, 60) : onProgress);
    added += r.added;
    Object.assign(update, r.update);
  }
  if (profile.lichessUsername) {
    const r = await syncLichess(uid, profile, both ? share(60, 100) : onProgress);
    added += r.added;
    Object.assign(update, r.update);
  }

  await setDoc(userRef(uid), { ...update, lastSyncAt: Date.now() }, { merge: true });
  onProgress({ message: "Done!", percent: 100 });
  return added;
}

type SiteSync = { added: number; update: Partial<UserProfile> };

async function syncChessCom(uid: string, profile: UserProfile, onProgress: (p: SyncProgress) => void): Promise<SiteSync> {
  const username = profile.chessComUsername!;
  onProgress({ message: "Asking Chess.com for your game history…", percent: 2 });
  const allArchives = await fetchArchiveUrls(username);
  const recent = allArchives.slice(-MAX_MONTHS);
  const currentMonth = recent.at(-1);
  const done = new Set(profile.syncedArchives ?? []);
  const since = profile.latestEndTime ?? 0;
  const todo = recent.filter((url) => !done.has(url));

  let added = 0;
  let latest = since;
  const synced = [...done];

  // 5% for the archive list, the rest split evenly between months:
  // 40% of a month's share for downloading it, 60% for saving its games.
  const monthShare = 95 / Math.max(todo.length, 1);
  for (const [i, url] of todo.entries()) {
    const base = 5 + i * monthShare;
    const label = archiveLabel(url);
    onProgress({ message: `Downloading ${label} from Chess.com…`, percent: base });
    const games = (await fetchArchive(url))
      .map((g) => toStoredGame(g, username))
      .filter((g): g is StoredGame => g !== null)
      .filter((g) => url !== currentMonth || g.endTime > since);

    onProgress({ message: `Saving ${games.length} games from ${label}…`, percent: base + monthShare * 0.4 });
    await writeGames(uid, games, (saved) =>
      onProgress({
        message: `Saving games from ${label} (${saved}/${games.length})…`,
        percent: base + monthShare * (0.4 + 0.6 * (saved / games.length)),
      }),
    );
    added += games.length;
    for (const g of games) latest = Math.max(latest, g.endTime);
    if (url !== currentMonth) synced.push(url);
  }
  return { added, update: { syncedArchives: synced, latestEndTime: latest } };
}

async function syncLichess(uid: string, profile: UserProfile, onProgress: (p: SyncProgress) => void): Promise<SiteSync> {
  const username = profile.lichessUsername!;
  // First import: the same 3 months as Chess.com.
  const since = profile.lichessLatestEndTime || Date.now() - MAX_MONTHS * 31 * 24 * 60 * 60 * 1000;
  onProgress({ message: "Downloading your Lichess games…", percent: 5 });
  const raw = await fetchLichessGames(username, since, (n) =>
    onProgress({ message: `Downloading your Lichess games (${n})…`, percent: Math.min(45, 5 + n / 5) }),
  );
  const games = raw.map((g) => lichessToStored(g, username)).filter((g): g is StoredGame => g !== null);

  onProgress({ message: `Saving ${games.length} Lichess games…`, percent: 50 });
  await writeGames(uid, games, (saved) =>
    onProgress({ message: `Saving Lichess games (${saved}/${games.length})…`, percent: 50 + 50 * (saved / games.length) }),
  );
  const latest = Math.max(since, ...raw.map((g) => g.lastMoveAt));
  return { added: games.length, update: { lichessLatestEndTime: latest } };
}
