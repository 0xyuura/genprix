import { useEffect, useState } from "react";
import RaceCanvas from "../race/RaceCanvas";
import { isValidUsername } from "../game/username";
import { isSecureMode } from "../data/supabase";
import {
  activeRoomLocal,
  adoptRoomFromUrl,
  isRoomOpen,
  isTypableCode,
  shareCodeLocal,
  timeLeftOn,
} from "../data/rooms";

/** The code for a room already open on this device, if it is short enough to show. */
function hostCode(): string | null {
  const room = activeRoomLocal();
  if (!room || room.status !== "open" || timeLeftOn(room) <= 0) return null;
  const share = shareCodeLocal(room.code);
  return share && isTypableCode(share) ? share : room.code;
}

interface Props {
  onJoin: (username: string, code: string) => void;
  onShowLeaderboard: () => void;
  initialName?: string;
  error?: string | null;
}

export default function StartScreen({ onJoin, onShowLeaderboard, initialName = "", error }: Props) {
  const [name, setName] = useState(initialName);
  // A room can arrive three ways: inside an invite link (?r=…), as a bare code in
  // the old ?room= link, or typed in by hand. The first is the one that works on a
  // device that has never met the host.
  // A spent room still adopts (that is how the single-use rule survives a reload),
  // but showing it as an invitation would only hand the guest an error on submit.
  const [invited] = useState(() => {
    const room = adoptRoomFromUrl();
    // Spent or expired rooms still adopt — that is how both rules survive a
    // reload — but neither is an invitation worth showing.
    return room && room.status === "open" && timeLeftOn(room) > 0 ? room : null;
  });
  const [code, setCode] = useState(
    () =>
      invited?.code ??
      new URLSearchParams(window.location.search).get("room")?.toUpperCase() ??
      // On the host's own device the open room is right here, so don't make them
      // retype a code they just created. Prefer the share code, so what they see
      // matches what they handed out.
      hostCode() ??
      "",
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
        A typing race on GenLayer trivia. Enter a username and the host's room code, then take
        the 10 questions in any order. Retype each question exactly to drive your mochi kart
        forward, then type the answer to claim the checkpoint.
      </p>
      <p className="mt-2 text-white/40 text-sm">
        You get 10 minutes and 2 hints. Speed, accuracy and correct answers all count toward your
        score. A code lasts 15 minutes and is good for one run.
      </p>

      <div className="mt-5 rounded-3xl overflow-hidden border border-white/10 aspect-[16/7]">
        <RaceCanvas progress={0} className="w-full h-full block" />
      </div>

      {invited ? (
        // Invited by link: the room came with it, so all that is left is a name.
        <div className="mt-5 space-y-3">
          <div className="panel p-4 border-teal/40 flex items-center justify-between gap-3">
            <span className="text-white/60 text-sm">You're invited to room</span>
            <span className="font-display font-bold text-2xl tracking-[0.2em] text-teal">
              {invited.code}
            </span>
          </div>
          <input
            className="input-arcade w-full"
            placeholder="Your username (2–20 chars)"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && valid && onJoin(name, code)}
            autoComplete="off"
            autoFocus
          />
          <button
            className="btn-arcade w-full sm:w-auto"
            disabled={!valid}
            onClick={() => onJoin(name, code)}
          >
            Join race 🏁
          </button>
        </div>
      ) : (
        // Always here, on every device. Hiding the form when this browser had no
        // room of its own was the whole reason a guest saw a dead end instead of
        // somewhere to type the code they were given.
        <div className="mt-5 space-y-3">
          <p className="font-display font-bold text-sm text-white/50 uppercase tracking-wide">
            Join a game
          </p>
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
              // Room codes are keys, and a long one is base64url and case-sensitive,
              // so only style short codes as uppercase — never rewrite what was typed.
              className={`input-arcade sm:w-56 ${
                code.length > 12 ? "text-xs" : "uppercase tracking-widest"
              }`}
              placeholder="ROOM CODE"
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
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
          {roomOpen === false && (
            <p className="text-xs text-white/30">
              Nothing open on this device — that's fine, the host's code brings its own. Codes
              last 15 minutes from the moment the host creates them.
            </p>
          )}
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
