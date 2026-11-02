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
  { href: "/", label: "Today", short: "Today", icon: "☀️" },
  { href: "/games", label: "Games", short: "Games", icon: "♟️" },
  { href: "/puzzles", label: "Puzzle Gym", short: "Puzzles", icon: "🧩" },
  { href: "/profile", label: "Blunder Profile", short: "Profile", icon: "📊" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading, signIn, logOut } = useAuth();
  const { run } = useAnalysis();

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b-2 border-[var(--line)] bg-[var(--header)] text-[var(--on-header)] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-5xl px-3 py-2 sm:px-4 sm:py-3 flex items-center gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <span className="sm:hidden">
              <Mascot size={32} />
            </span>
            <span className="hidden sm:block">
              <Mascot size={40} />
            </span>
            <span className="font-display truncate text-xl sm:text-2xl">Blunder Buster</span>
          </Link>
          {/* Phones get the bottom tab bar instead. */}
          <nav className="hidden flex-wrap gap-1 sm:ml-6 sm:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3 py-1 text-sm font-semibold ${
                  pathname === item.href ? "bg-[var(--gold)] text-[var(--on-gold)]" : "hover:bg-[var(--wood-dark)]/30"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto shrink-0">
            {!isFirebaseConfigured ? (
              <span className="text-xs">Firebase not configured</span>
            ) : loading ? null : user ? (
              <button onClick={logOut} className="btn-secondary !px-3 !py-1 text-sm sm:!px-4 sm:text-base">
                Sign out
              </button>
            ) : (
              <button onClick={signIn} className="btn-primary !px-3 !py-1 text-sm sm:!px-4 sm:text-base">
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>
      {run && pathname !== "/games" && (
        <Link href="/games" className="block border-b-2 border-[var(--line)] bg-[var(--card)]">
          <div className="mx-auto max-w-5xl px-3 py-2 sm:px-4">
            <ProgressBar percent={run.percent} label={`Sir Blunderbuss is analyzing game ${Math.min(run.finished + 1, run.total)}/${run.total}…`} />
          </div>
        </Link>
      )}
      <main className="mx-auto w-full max-w-5xl flex-1 px-3 pt-4 pb-24 sm:px-4 sm:pt-6 sm:pb-6">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t-2 border-[var(--line)] bg-[var(--header)] pb-[env(safe-area-inset-bottom)] text-[var(--on-header)] sm:hidden">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="flex flex-col items-center gap-0.5 px-1 pb-2 pt-1.5 text-[11px] font-semibold"
            >
              <span
                className={`grid h-7 w-12 place-items-center rounded-full text-base ${active ? "bg-[var(--gold)]" : ""}`}
                aria-hidden
              >
                {item.icon}
              </span>
              {item.short}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
