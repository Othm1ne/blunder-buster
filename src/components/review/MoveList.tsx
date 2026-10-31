"use client";

import { useEffect, useRef } from "react";
import type { MoveReview } from "@/lib/classify";
import { LABEL_STYLE } from "@/lib/describe";

/** Two-column move list. Every move shows its label symbol; your moves are bold. */
export function MoveList({ moves, ply, onSelect }: { moves: MoveReview[]; ply: number; onSelect: (ply: number) => void }) {
  const active = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // Keep the current move visible by scrolling the list only (scrollIntoView would scroll the whole page).
  useEffect(() => {
    const box = list.current;
    const el = active.current;
    if (!box || !el) return;
    const top = el.offsetTop; // relative to the list, which is `relative` (the offsetParent)
    if (top < box.scrollTop) box.scrollTop = top;
    else if (top + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top + el.offsetHeight - box.clientHeight;
  }, [ply]);

  const rows: [MoveReview, MoveReview | undefined][] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push([moves[i], moves[i + 1]]);

  const cell = (m: MoveReview | undefined, striped: boolean) => {
    const bg = striped ? "bg-[var(--stripe)]" : "";
    if (!m) return <span className={bg} />;
    const style = LABEL_STYLE[m.label];
    const isActive = m.ply === ply;
    const showSymbol = m.label !== "good";
    return (
      <button
        ref={isActive ? active : undefined}
        onClick={() => onSelect(m.ply)}
        className={`flex items-center justify-between gap-1 px-2 py-1 text-left ${
          isActive ? "bg-[var(--gold)] text-[var(--on-gold)]" : `${bg} hover:bg-[var(--wood)]/30`
        } ${m.mine ? "font-bold" : ""}`}
      >
        <span>{m.san}</span>
        {showSymbol && (
          <span
            className="rounded px-1 text-[11px] font-bold leading-4"
            style={isActive ? { background: style.color, color: "#fff" } : { color: style.color }}
          >
            {style.symbol}
          </span>
        )}
      </button>
    );
  };

  return (
    <div ref={list} className="relative max-h-72 overflow-y-auto rounded-xl border-2 border-[var(--line)] bg-[var(--card)] text-sm lg:max-h-[420px]">
      <div className="grid grid-cols-[2.5rem_1fr_1fr]">
        {rows.map(([w, b], i) => {
          const striped = i % 2 === 1;
          return (
            <div key={i} className="contents">
              <span className={`py-1 pr-2 text-right text-[var(--muted)] ${striped ? "bg-[var(--stripe)]" : ""}`}>{i + 1}.</span>
              {cell(w, striped)}
              {cell(b, striped)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
