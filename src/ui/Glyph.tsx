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

/** Daylight running. Shown on the button that switches *to* light. */
export const Sun = ({ size = 14, className }: Props) => (
  <svg {...svg(size, className)}>
    <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M12.8 3.2l-1.4 1.4M4.6 11.4l-1.4 1.4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
    />
  </svg>
);

/** Night race. Shown on the button that switches *to* dark. */
export const Moon = ({ size = 14, className }: Props) => (
  <svg {...svg(size, className)}>
    <path
      d="M13.2 10.1A5.6 5.6 0 016.1 2.9a5.7 5.7 0 107.1 7.2z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

/** Sound on: a speaker with two waves. */
export const SoundOn = ({ size = 14, className }: Props) => (
  <svg {...svg(size, className)}>
    <path d="M2 6h2.5L8 3v10L4.5 10H2V6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M10.4 5.8a3.4 3.4 0 010 4.4M12.6 3.8a6.4 6.4 0 010 8.4" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

/** Sound off: the same speaker, struck out. */
export const SoundOff = ({ size = 14, className }: Props) => (
  <svg {...svg(size, className)}>
    <path d="M2 6h2.5L8 3v10L4.5 10H2V6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M10.6 6.2l3.8 3.6M14.4 6.2l-3.8 3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
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
