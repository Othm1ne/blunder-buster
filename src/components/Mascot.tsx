export type MascotMood = "happy" | "shocked" | "proud";

// Sir Blunderbuss: a cartoon knight head drawn in SVG so it costs nothing to host.
// Fixed colors, not theme tokens: in dark mode the ink token turns light, which erased his face.
const INK = "#2b2118";
const FACE = "#f0c27b";
const BASE = "#a86b32";
const CROWN = "#ffc93c";

export function Mascot({ mood = "happy", size = 96 }: { mood?: MascotMood; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="shrink-0" role="img" aria-label={`Sir Blunderbuss looking ${mood}`}>
      {/* base */}
      <rect x="22" y="82" width="56" height="12" rx="4" fill={BASE} />
      {/* head + mane */}
      <path
        d="M30 82 C28 62 26 46 38 30 C44 22 52 14 60 12 L62 22 C72 26 80 36 80 46 C80 54 74 58 66 56 C60 55 56 58 56 64 C56 70 62 76 66 82 Z"
        fill={FACE}
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M38 30 C34 42 32 56 34 70" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      {/* eye */}
      {mood === "shocked" ? (
        <circle cx="62" cy="34" r="6" fill="#fff" stroke={INK} strokeWidth="2.5" />
      ) : (
        <circle cx="62" cy="34" r="4.5" fill="#fff" stroke={INK} strokeWidth="2.5" />
      )}
      <circle cx={mood === "shocked" ? 62 : 63} cy="34" r={mood === "shocked" ? 2 : 2.2} fill={INK} />
      {mood === "proud" && <path d="M55 26 L69 24" stroke={INK} strokeWidth="3" strokeLinecap="round" />}
      {/* mouth */}
      {mood === "happy" && <path d="M68 50 Q73 54 77 49" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />}
      {mood === "shocked" && <ellipse cx="73" cy="51" rx="3" ry="4" fill={INK} />}
      {mood === "proud" && <path d="M67 51 Q73 56 78 50" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />}
      {/* crown for proud */}
      {mood === "proud" && (
        <path d="M44 16 L48 6 L54 13 L60 3 L64 14 L70 8 L70 18 Z" fill={CROWN} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      )}
    </svg>
  );
}
