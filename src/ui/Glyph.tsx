// Drawn marks instead of emoji. Emoji render differently on every OS, carry a
// cartoon tone this UI does not want, and are the fastest way to make a screen
// look like it was decorated rather than designed. These inherit currentColor
// and line up with text.

interface Props {
  size?: number;
  className?: string;
}

const svg = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "none",
  className: `inline-block shrink-0 align-[-0.125em] ${className ?? ""}`,
  "aria-hidden": true as const,
});

/** Chequered flag block. Finish, results, standings. */
export const Chequer = ({ size = 14, className }: Props) => (
  <svg {...svg(size, className)}>
    <rect x="1" y="2" width="6" height="6" fill="currentColor" />
    <rect x="7" y="8" width="6" height="6" fill="currentColor" />
    <rect x="7" y="2" width="6" height="6" fill="currentColor" opacity="0.25" />
    <rect x="1" y="8" width="6" height="6" fill="currentColor" opacity="0.25" />
  </svg>
);

export const Check = ({ size = 14, className }: Props) => (
  <svg {...svg(size, className)}>
    <path
      d="M2.5 8.5l3.5 3.5 7.5-8"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="square"
    />
  </svg>
);

export const Cross = ({ size = 14, className }: Props) => (
  <svg {...svg(size, className)}>
    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
  </svg>
);

export const Clock = ({ size = 14, className }: Props) => (
  <svg {...svg(size, className)}>
    <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 4.4V8l2.6 1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
  </svg>
);

/** Hints. A pit board, not a lightbulb: the crew holding up information. */
export const Board = ({ size = 14, className }: Props) => (
  <svg {...svg(size, className)}>
    <rect x="2" y="2" width="12" height="9" stroke="currentColor" strokeWidth="1.6" />
    <path d="M4.6 5.6h6.8M4.6 8h4.2M8 11v3" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const Lock = ({ size = 14, className }: Props) => (
  <svg {...svg(size, className)}>
    <rect x="3" y="7" width="10" height="7" stroke="currentColor" strokeWidth="1.6" />
    <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

export const Camera = ({ size = 14, className }: Props) => (
  <svg {...svg(size, className)}>
    <rect x="1.5" y="4" width="13" height="9.5" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="8" cy="8.75" r="2.6" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6 4V2.5h4V4" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

/** Backspace, for the "fix the typo" hint. */
export const Backspace = ({ size = 14, className }: Props) => (
  <svg {...svg(size, className)}>
    <path d="M15 4H6L1.5 8 6 12h9V4z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8.5 6.5l4 3M12.5 6.5l-4 3" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

/** The five-lamp start gantry. Decorative on the home hero. */
export const StartLights = ({ className }: { className?: string }) => (
  <div className={`flex items-center gap-1.5 ${className ?? ""}`} aria-hidden>
    {[1, 2, 3, 4, 5].map((n) => (
      <span key={n} className={`light lamp-${n}`} />
    ))}
  </div>
);
