"use client";

import { useEffect, useState } from "react";
import type { OpeningBook } from "./classify";

// The opening book (public/data/openings.json, built by scripts/build-openings.mjs from the
// CC0 Lichess opening list). ~85 KB compressed, downloaded once per visit and shared.

let loading: Promise<OpeningBook | null> | null = null;

function loadBook(): Promise<OpeningBook | null> {
  loading ??= fetch("/data/openings.json")
    .then((r) => (r.ok ? (r.json() as Promise<OpeningBook>) : null))
    .catch(() => null);
  return loading;
}

/** The opening book, or null while it loads (reviews then just have no Book moves yet). */
export function useOpeningBook(): OpeningBook | null {
  const [book, setBook] = useState<OpeningBook | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadBook().then((b) => !cancelled && setBook(b));
    return () => {
      cancelled = true;
    };
  }, []);
  return book;
}
