import { useState } from "react";
import RaceCanvas from "../race/RaceCanvas";
import { isValidUsername } from "../game/username";
import { isSecureMode } from "../data/supabase";

interface Props {
  onStart: (username: string) => void;
  onShowLeaderboard: () => void;
  initialName?: string;
}

export default function StartScreen({ onStart, onShowLeaderboard, initialName = "" }: Props) {
  const [name, setName] = useState(initialName);
  const valid = isValidUsername(name);
  const secure = isSecureMode();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <img src="/brand/wordmark-white.png" alt="GenLayer" className="h-6 opacity-90" />
        <span
          className={`text-xs font-display font-bold px-3 py-1 rounded-full ${
            secure ? "bg-good/20 text-good" : "bg-amber/20 text-amber"
          }`}
        >
          {secure ? "● Global board" : "● Local demo"}
        </span>
      </div>

      <h1 className="font-display font-bold text-4xl sm:text-5xl text-ceramic leading-none">
        GenLayer <span className="text-magenta">Grand Prix</span>
      </h1>
      <p className="mt-2 text-white/70">
        Answer 10 GenLayer questions. Every correct answer floors it — get your mochi kart to the
        finish line and top the leaderboard. Faster + streaks = more points.
      </p>

      <div className="mt-5 rounded-3xl overflow-hidden border border-white/10 aspect-[16/7]">
        <RaceCanvas correctCount={0} className="w-full h-full block" />
      </div>

      <div className="mt-5 flex flex-col sm:flex-row gap-3">
        <input
          className="input-arcade"
          placeholder="Enter a username (2–20 chars)"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && valid && onStart(name)}
          autoComplete="off"
        />
        <button className="btn-arcade whitespace-nowrap" disabled={!valid} onClick={() => onStart(name)}>
          Start race 🏁
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <button className="text-teal hover:underline" onClick={onShowLeaderboard}>
          🏆 View leaderboard
        </button>
        <span className="text-white/40">No wallet. No sign-up. Just vibes.</span>
      </div>
    </div>
  );
}
