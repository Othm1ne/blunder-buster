"use client";

import type { MouseEvent } from "react";
import type { MoveReview } from "@/lib/classify";
import { winChance } from "@/lib/classify";
import type { EngineEval } from "@/lib/engine";
import { LABEL_STYLE, moveName } from "@/lib/describe";

const W = 600;
const H = 100;

/** White's winning chances over the game. Click anywhere to jump to that move. */
export function EvalGraph({
  evals,
  moves,
  ply,
  onSelect,
}: {
  evals: EngineEval[];
  moves: MoveReview[];
  ply: number;
  onSelect: (ply: number) => void;
}) {
  const n = Math.max(evals.length - 1, 1);
  const x = (i: number) => (i / n) * W;
  const y = (e: EngineEval) => H - (winChance(e.cp) / 100) * H;
  const line = evals.map((e, i) => `${x(i).toFixed(1)},${y(e).toFixed(1)}`).join(" ");
  const markers = moves.filter((m) => m.mine && (m.label === "blunder" || m.label === "mistake"));

  function click(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    onSelect(Math.round(((e.clientX - rect.left) / rect.width) * n));
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-24 w-full cursor-pointer rounded-lg border-2 border-[var(--line)] bg-[#403d39]"
      onClick={click}
      role="img"
      aria-label="Evaluation graph"
    >
      <polygon points={`0,${H} ${line} ${W},${H}`} fill="#f0ede6" />
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="#8a8580" strokeWidth={1} strokeDasharray="4 4" />
      <line x1={x(ply)} x2={x(ply)} y1={0} y2={H} stroke="var(--gold)" strokeWidth={3} vectorEffect="non-scaling-stroke" />
      {markers.map((m) => (
        <circle
          key={m.ply}
          cx={x(m.ply)}
          cy={y(evals[m.ply])}
          r={5}
          fill={LABEL_STYLE[m.label].color}
          stroke="#fff"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        >
          <title>
            {moveName(m)}
            {LABEL_STYLE[m.label].symbol}
          </title>
        </circle>
      ))}
    </svg>
  );
}
