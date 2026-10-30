"use client";

import { Mascot } from "@/components/Mascot";
import { useAuth } from "@/components/AuthProvider";

const MISSIONS = [
  { title: "Warm-up", detail: "Solve 5 puzzles from your own blunders", xp: 20 },
  { title: "Play", detail: "Play 1 rapid game (10+5 or 15+10) on Chess.com", xp: 30 },
  { title: "Review", detail: "Review your latest game move by move", xp: 25 },
];

export default function Today() {
  const { user } = useAuth();
  const name = user?.displayName?.split(" ")[0];

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex items-center gap-4">
        <Mascot size={88} />
        <div>
          <h1 className="font-display text-3xl">{name ? `Ready, ${name}?` : "Welcome to Blunder Buster!"}</h1>
          <p className="text-[var(--muted)]">
            Sir Blunderbuss says: before every move, ask <em>&quot;is everything safe?&quot;</em>
          </p>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl mb-3">Today&apos;s missions</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {MISSIONS.map((m) => (
            <li key={m.title} className="card">
              <div className="flex items-baseline justify-between">
                <span className="font-display text-lg">{m.title}</span>
                <span className="text-sm font-bold text-[var(--wood-dark)]">+{m.xp} XP</span>
              </div>
              <p className="text-sm text-[var(--muted)] mt-1">{m.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
