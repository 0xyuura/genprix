import { useEffect, useState } from "react";
import RaceCanvas from "../race/RaceCanvas";
import { isValidUsername } from "../game/username";
import { isSecureMode } from "../data/supabase";
import { isRoomOpen } from "../data/rooms";

interface Props {
  onJoin: (username: string, code: string) => void;
  onShowLeaderboard: () => void;
  initialName?: string;
  error?: string | null;
}

export default function StartScreen({ onJoin, onShowLeaderboard, initialName = "", error }: Props) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(
    () => new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "",
  );
  const [roomOpen, setRoomOpen] = useState<boolean | null>(null);
  const secure = isSecureMode();

  useEffect(() => {
    let alive = true;
    isRoomOpen().then((o) => alive && setRoomOpen(o));
    return () => {
      alive = false;
    };
  }, []);

  const valid = isValidUsername(name) && code.trim().length >= 4;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <img src="/brand/wordmark-white.png" alt="GenLayer" className="h-6 opacity-90" />
        {/* Only the secure-mode badge is worth showing players; the old "Local demo"
            pill just advertised that the board wasn't real. */}
        {secure && (
          <span className="text-xs font-display font-bold px-3 py-1 rounded-full bg-good/20 text-good">
            ● Global board
          </span>
        )}
      </div>

      <h1 className="font-display font-bold text-4xl sm:text-5xl text-ceramic leading-none">
        GenLayer <span className="text-magenta">Grand Prix</span>
      </h1>
      <p className="mt-2 text-white/70">
        A typing race on GenLayer trivia. Enter the host's room code and take the 10 questions in
        any order. Retype each question exactly to drive your mochi kart forward, then type the
        answer to claim the checkpoint.
      </p>
      <p className="mt-2 text-white/40 text-sm">
        You get 10 minutes and 2 hints. Speed, accuracy and correct answers all count toward your
        score. A room code is good for one run.
      </p>

      <div className="mt-5 rounded-3xl overflow-hidden border border-white/10 aspect-[16/7]">
        <RaceCanvas progress={0} className="w-full h-full block" />
      </div>

      {roomOpen === false ? (
        <div className="mt-5 panel p-5 text-center">
          <p className="font-display text-lg text-amber">No game running right now</p>
          <p className="text-white/60 text-sm mt-1">
            Either the last code has been played or the host hasn't opened a room yet. Ask the admin
            for a fresh code, then enter it here.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              className="input-arcade sm:flex-1"
              placeholder="Username (2–20 chars)"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
            <input
              className="input-arcade sm:w-48 uppercase tracking-widest"
              placeholder="ROOM CODE"
              value={code}
              maxLength={8}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && valid && onJoin(name, code)}
              autoComplete="off"
            />
          </div>
          <button
            className="btn-arcade w-full sm:w-auto"
            disabled={!valid}
            onClick={() => onJoin(name, code)}
          >
            Join race 🏁
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-bad text-sm">{error}</p>}

      <div className="mt-4 flex items-center text-sm">
        <button className="text-teal hover:underline" onClick={onShowLeaderboard}>
          🏆 View leaderboard
        </button>
      </div>
    </div>
  );
}
