import { hsl } from "../brand";

interface Props {
  seed: string;
  name: string;
  size?: number;
}

// A driver badge: flat colour keyed off the seed, hard edge, initial set in the
// timing font. The old glossy radial gradient was the one bit of chrome on an
// otherwise painted-metal screen.
export default function Avatar({ seed, name, size = 40 }: Props) {
  const n = Number(seed) || 0;
  const hue = n % 360;
  return (
    <span
      className="grid place-items-center rounded-sm font-num font-bold text-void border border-black/50 shrink-0"
      style={{
        width: size,
        height: size,
        background: hsl(hue, 72, 58),
        fontSize: size * 0.44,
      }}
      aria-hidden
    >
      {(name[0] || "?").toUpperCase()}
    </span>
  );
}
