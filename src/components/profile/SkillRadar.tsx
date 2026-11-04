"use client";

import { useMemo } from "react";
import type { ReviewedGame } from "@/lib/profile";
import { LEVEL_NAMES, SKILL_INFO, skillsOf, type Skill } from "@/lib/skills";

/** "Now" is your latest games; "before" the same number of games just before them. */
const RECENT = 20;
const MIN_BEFORE = 10;

const SIZE = 300;
const C = SIZE / 2;
const R = 100;

function point(i: number, n: number, score: number): [number, number] {
  const angle = -Math.PI / 2 + (i / n) * 2 * Math.PI;
  return [C + Math.cos(angle) * (R * score) / 100, C + Math.sin(angle) * (R * score) / 100];
}

const polygon = (skills: Skill[]) => skills.map((s, i) => point(i, skills.length, s.score ?? 0).join(",")).join(" ");

/** Your skill levels per area on a radar chart, with how they changed over your recent games. */
export function SkillRadar({ reviewed }: { reviewed: ReviewedGame[] }) {
  const { now, before } = useMemo(() => {
    const sorted = [...reviewed].sort((a, b) => b.game.endTime - a.game.endTime);
    const older = sorted.slice(RECENT, RECENT * 2);
    return { now: skillsOf(sorted.slice(0, RECENT)), before: older.length >= MIN_BEFORE ? skillsOf(older) : null };
  }, [reviewed]);

  const n = now.length;
  const known = now.filter((s) => s.score !== null);
  const weakest = [...known].sort((a, b) => a.score! - b.score!)[0];
  const overall = known.length ? Math.round(known.reduce((s, k) => s + k.score!, 0) / known.length) : null;

  return (
    <section className="card flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-display text-xl">Your skills</h2>
        {overall !== null && (
          <span className="chip chip-gold">
            Overall level {Math.max(1, Math.ceil(overall / 10))} · {LEVEL_NAMES[Math.max(0, Math.ceil(overall / 10) - 1)]}
          </span>
        )}
        <span className="ml-auto text-xs text-[var(--muted)]">Last {Math.min(RECENT, reviewed.length)} analyzed games</span>
      </div>

      <div className="grid items-center gap-4 md:grid-cols-[minmax(0,384px)_minmax(0,1fr)]">
        <svg viewBox={`-70 -4 ${SIZE + 140} ${SIZE + 8}`} className="mx-auto w-full max-w-96" role="img" aria-label="Skill radar chart">
          {[25, 50, 75, 100].map((ring) => (
            <polygon
              key={ring}
              points={now.map((_, i) => point(i, n, ring).join(",")).join(" ")}
              fill="none"
              stroke="var(--line)"
              strokeWidth={ring === 100 ? 2 : 1}
            />
          ))}
          {now.map((_, i) => {
            const [x, y] = point(i, n, 100);
            return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="var(--line)" strokeWidth={1} />;
          })}
          {before && (
            <polygon points={polygon(before)} fill="none" stroke="var(--muted)" strokeWidth={2} strokeDasharray="5 4" />
          )}
          <polygon points={polygon(now)} fill="var(--gold)" fillOpacity={0.35} stroke="var(--gold)" strokeWidth={3} strokeLinejoin="round" />
          {now.map((s, i) => {
            const [x, y] = point(i, n, s.score ?? 0);
            return s.score === null ? null : <circle key={s.id} cx={x} cy={y} r={4} fill="var(--gold)" />;
          })}
          {now.map((s, i) => {
            const [x, y] = point(i, n, 128);
            const anchor = Math.abs(x - C) < 8 ? "middle" : x > C ? "start" : "end";
            return (
              <text
                key={s.id}
                x={x}
                y={y}
                textAnchor={anchor}
                dominantBaseline="middle"
                fontSize={12}
                fontWeight={700}
                fill={s.score === null ? "var(--muted)" : "var(--ink)"}
              >
                {s.name}
                <tspan x={x} dy={14} fontWeight={400} fill="var(--muted)">
                  {s.level ? `Lv ${s.level}` : "?"}
                </tspan>
              </text>
            );
          })}
        </svg>

        <ul className="flex flex-col gap-2">
          {now.map((s, i) => {
            const change = s.score !== null && before?.[i].score != null ? s.score - before[i].score! : null;
            return (
              <li key={s.id} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 font-semibold">{s.name}</span>
                <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full border-2 border-[var(--line)] bg-[var(--paper)]">
                  <div className="h-full bg-[var(--gold)]" style={{ width: `${s.score ?? 0}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right text-xs">
                  {s.level ? (
                    <>
                      <strong>Lv {s.level}</strong> {LEVEL_NAMES[s.level - 1]}
                    </>
                  ) : (
                    <span className="text-[var(--muted)]">{s.detail}</span>
                  )}
                </span>
                <span
                  className="w-9 shrink-0 text-right text-xs font-bold tabular-nums"
                  style={{ color: change === null || change === 0 ? "var(--muted)" : change > 0 ? "var(--good)" : "var(--bad)" }}
                  title={s.detail}
                >
                  {change === null ? "" : change === 0 ? "=" : `${change > 0 ? "▲" : "▼"}${Math.abs(change)}`}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {before && (
        <p className="text-xs text-[var(--muted)]">
          Gold: your last {RECENT} games. Dashed: the {RECENT} games before. ▲▼ = change in points.
        </p>
      )}
      {weakest && (
        <p className="rounded-lg bg-[var(--stripe)] px-3 py-2 text-sm">
          <strong>Level up next: {weakest.name}</strong> ({weakest.detail}). {SKILL_INFO[weakest.id].tip}
        </p>
      )}
    </section>
  );
}
