import { hsl } from "../brand";

interface Props {
  seed: string;
  name: string;
  size?: number;
}

// Cosmetic mochi-style avatar: a colored disc (hue from the seed) with the
// username initial. No external calls.
export default function Avatar({ seed, name, size = 40 }: Props) {
  const n = Number(seed) || 0;
  const hue = n % 360;
  const bg = `radial-gradient(circle at 35% 30%, ${hsl(hue, 85, 62)}, ${hsl(
    (hue + 40) % 360,
    80,
    42,
  )})`;
  return (
    <span
      className="grid place-items-center rounded-full font-display font-bold text-void ring-2 ring-white/20 shrink-0"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.42 }}
      aria-hidden
    >
      {(name[0] || "?").toUpperCase()}
    </span>
  );
}
