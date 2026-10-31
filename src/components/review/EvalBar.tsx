import type { EngineEval } from "@/lib/engine";
import { winChance } from "@/lib/classify";

export function evalText(e: EngineEval): string {
  if (e.mate !== undefined) return e.mate === 0 ? "#" : `M${Math.abs(e.mate)}`;
  const pawns = e.cp / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(1)}`;
}

/** Vertical bar: White's share fills from White's side of the board. */
export function EvalBar({ value, orientation }: { value: EngineEval; orientation: "white" | "black" }) {
  const white = winChance(value.cp);
  const whiteAhead = value.cp >= 0;
  return (
    <div
      className="relative w-6 shrink-0 overflow-hidden rounded-md border-2 border-[var(--line)] bg-[#403d39]"
      title={`Evaluation ${evalText(value)}`}
    >
      <div
        className="absolute inset-x-0 bg-[#f0ede6] transition-[height] duration-300"
        style={{ height: `${white}%`, [orientation === "white" ? "bottom" : "top"]: 0 }}
      />
      <span
        className={`absolute inset-x-0 text-center text-[10px] font-bold ${whiteAhead ? "text-[#403d39]" : "text-[#f0ede6]"}`}
        style={{ [whiteAhead === (orientation === "white") ? "bottom" : "top"]: 2 }}
      >
        {evalText(value)}
      </span>
    </div>
  );
}
