"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { Mascot } from "./Mascot";
import { isFirebaseConfigured } from "@/lib/firebase";
import { useAnalysis } from "./AnalysisProvider";
import { ProgressBar } from "./ProgressBar";

const NAV = [
  { href: "/", label: "Today" },
  { href: "/games", label: "Games" },
  { href: "/puzzles", label: "Puzzle Gym" },
  { href: "/profile", label: "Blunder Profile" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading, signIn, logOut } = useAuth();
  const { run } = useAnalysis();

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b-4 border-[var(--ink)] bg-[var(--wood)]">
        <div className="mx-auto max-w-5xl px-4 py-3 flex flex-wrap items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <Mascot size={40} />
            <span className="font-display text-2xl text-[var(--ink)]">Blunder Buster</span>
          </Link>
          <nav className="flex flex-wrap gap-1 sm:ml-6">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3 py-1 text-sm font-semibold ${
                  pathname === item.href ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink)] hover:bg-[var(--wood-dark)]/40"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            {!isFirebaseConfigured ? (
              <span className="text-xs text-[var(--ink)]">Firebase not configured</span>
            ) : loading ? null : user ? (
              <button onClick={logOut} className="btn-secondary">
                Sign out
              </button>
            ) : (
              <button onClick={signIn} className="btn-primary">
                Sign in with Google
              </button>
            )}
          </div>
        </div>
      </header>
      {run && pathname !== "/games" && (
        <Link href="/games" className="block border-b-2 border-[var(--ink)] bg-[var(--card)]">
          <div className="mx-auto max-w-5xl px-4 py-2">
            <ProgressBar percent={run.percent} label={`Sir Blunderbuss is analyzing game ${Math.min(run.finished + 1, run.total)}/${run.total}…`} />
          </div>
        </Link>
      )}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
