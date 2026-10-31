import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { archiveLabel, fetchArchive, fetchArchiveUrls, toStoredGame, type StoredGame } from "./chesscom";
import type { GameDoc } from "./analysis";

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
};

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
}

export async function getGame(uid: string, id: string): Promise<GameDoc | null> {
  const snap = await getDoc(doc(gamesCol(uid), id));
  return snap.exists() ? (snap.data() as GameDoc) : null;
}

export async function listGames(uid: string, max = 300): Promise<GameDoc[]> {
  const snap = await getDocs(query(gamesCol(uid), orderBy("endTime", "desc"), limit(max)));
  return snap.docs.map((d) => d.data() as GameDoc);
}

async function writeGames(uid: string, games: StoredGame[], onSaved: (saved: number) => void): Promise<void> {
  for (let i = 0; i < games.length; i += BATCH_SIZE) {
    const chunk = games.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db());
    // merge: never wipes analysis fields that later phases add to the same document.
    for (const g of chunk) batch.set(doc(gamesCol(uid), g.id), g, { merge: true });
    await batch.commit();
    onSaved(i + chunk.length);
  }
}

export type SyncProgress = { message: string; percent: number };

/** Imports new rapid/blitz games. Returns how many were added. */
export async function syncGames(uid: string, onProgress: (p: SyncProgress) => void): Promise<number> {
  onProgress({ message: "Asking Chess.com for your game history…", percent: 2 });
  const profile = await getProfile(uid);
  const username = profile.chessComUsername;
  if (!username) throw new Error("Set your Chess.com username first.");

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
    onProgress({ message: `Downloading ${label}…`, percent: base });
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

  await setDoc(userRef(uid), { syncedArchives: synced, latestEndTime: latest, lastSyncAt: Date.now() }, { merge: true });
  onProgress({ message: "Done!", percent: 100 });
  return added;
}
