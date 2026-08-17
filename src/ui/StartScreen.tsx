import { useEffect, useState } from "react";
import RaceCanvas from "../race/RaceCanvas";
import { isValidUsername } from "../game/username";
import { Chequer, StartLights } from "./Glyph";
import {
  activeRoomLocal,
  adoptRoomFromUrl,
  isRoomLive,
  isRoomOpen,
  isTypableCode,
  shareCodeLocal,
} from "../data/rooms";

/** The code for a room already open on this device, if it is short enough to show. */
function hostCode(): string | null {
  const room = activeRoomLocal();
  if (!room || !isRoomLive(room)) return null;
  const share = shareCodeLocal(room.code);
  return share && isTypableCode(share) ? share : room.code;
}

/** Race-control notes. Each one is a rule a player can act on, not decoration. */
const NOTES = [
  "Track limits: a wrong character parks the kart until you backspace it",
  "Pit note: a hint shows the first and last letter of the answer",
  "Ranking: correct answers first, then the clock, then how cleanly you typed",
  "Leaderboard: resets at the top of every hour",
];

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
  const [invited] = useState(() => {
    const room = adoptRoomFromUrl();
    // An ended room still adopts — that is how the one-run-per-player rule
    // survives a reload — but it is not an invitation worth showing.
    return room && isRoomLive(room) ? room : null;
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
  // The form starts folded behind one button, so the landing page asks for one
  // decision instead of two empty fields. It opens itself whenever there is
  // already something to act on: a code we filled in, or an error to explain.
  const [joining, setJoining] = useState(() => code !== "" || !!error);

  useEffect(() => {
    let alive = true;
    isRoomOpen().then((o) => alive && setRoomOpen(o));
    return () => {
      alive = false;
    };
  }, []);

  // A rejected join arrives as a prop after the fact; never leave the reason
  // showing above a form the player can no longer see.
  useEffect(() => {
    if (error) setJoining(true);
  }, [error]);

  const valid = isValidUsername(name) && code.trim().length >= 4;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* No status badge. Whether a server is keeping score is not a player's
          problem, and the leaderboard already says which kind of board it is. */}
      <header className="mb-5">
        <img src="/brand/wordmark-white.png" alt="GenLayer" className="h-6 opacity-90" />
      </header>

      {/* Title as trackside signage: heavy caps sitting on the kerb. */}
      <h1 className="font-display font-bold uppercase leading-[0.9] text-ceramic text-[13vw] sm:text-6xl tracking-tight">
        GenLayer
        <br />
        <span className="text-magenta">Grand Prix</span>
      </h1>
      <div className="mt-3 h-[5px] w-40 bg-kerb" style={{ backgroundSize: "28px 5px" }} />

      <p className="mt-4 text-white/70 max-w-xl">
        Ten questions on GenLayer. Retype each one character for character to move your kart, then
        type the answer to take the checkpoint. Miss a character and the kart stops until you
        backspace it.
      </p>

      {/* The numbers as a spec sheet. A sentence claiming that speed and accuracy
          "count toward your score" says nothing; these are the actual figures.
          Seats per code is deliberately not one of them: without a shared backend
          the count is per device, so promising it on the front page would be
          advertising a limit this build cannot actually hold anyone to. */}
      <dl className="mt-5 grid grid-cols-3 border border-line divide-x divide-line bg-pit">
        {[
          ["Questions", "10"],
          ["Minutes", "10"],
          ["Hints", "2"],
        ].map(([label, value]) => (
          <div key={label} className="px-3 py-2.5">
            <dd className="num text-xl text-teal">{value}</dd>
            <dt className="stencil !text-[10px] mt-0.5">{label}</dt>
          </div>
        ))}
      </dl>

      {/* Hero screen: the canvas behind a bezel, with the gantry lit above it. */}
      <div className="mt-5 panel-kerb">
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <StartLights />
          <span className="stencil">Circuit preview</span>
        </div>
        <div className="aspect-[16/7] border-t border-line">
          <RaceCanvas progress={0} className="w-full h-full block" />
        </div>
      </div>

      {invited ? (
        // Invited by link: the room came with it, so all that is left is a name.
        <div className="mt-5 space-y-3">
          <div className="panel p-3 flex items-center justify-between gap-3 border-teal/40">
            <span className="stencil">Room held for you</span>
            <span className="num font-bold text-xl tracking-[0.2em] text-teal">
              {invited.code}
            </span>
          </div>
          <input
            className="input-arcade"
            placeholder="Your name on the timing screen"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && valid && onJoin(name, code)}
            autoComplete="off"
            autoFocus
          />
          <button className="btn-arcade w-full sm:w-auto" disabled={!valid} onClick={() => onJoin(name, code)}>
            Join the race
          </button>
        </div>
      ) : !joining ? (
        // One button, on every device. Hiding the way in when this browser had no
        // room of its own was the whole reason a guest saw a dead end instead of
        // somewhere to type the code they were given.
        <div className="mt-5">
          <button className="btn-arcade w-full sm:w-auto" onClick={() => setJoining(true)}>
            Join quiz
          </button>
          <p className="mt-3 text-xs text-white/35">
            Bring a name and the room code your host read out.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <p className="stencil">Join a game</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              className="input-arcade sm:flex-1"
              placeholder="Name (2–20 characters)"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              autoFocus
            />
            <input
              // Room codes are keys, and a long one is base64url and case-sensitive,
              // so only style short codes as uppercase — never rewrite what was typed.
              className={`input-arcade sm:w-56 !font-num ${
                code.length > 12 ? "!text-xs" : "uppercase tracking-[0.2em]"
              }`}
              placeholder="ROOM CODE"
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && valid && onJoin(name, code)}
              autoComplete="off"
            />
          </div>
          <button className="btn-arcade w-full sm:w-auto" disabled={!valid} onClick={() => onJoin(name, code)}>
            Join the race
          </button>
          {roomOpen === false && (
            <p className="text-xs text-white/35">
              Nothing open on this device, which is normal for a guest. The host's code carries the
              questions with it and runs for 15 minutes from the moment they made it.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 panel caution-stripe border-flag/40 px-3 py-2 text-sm text-flag">
          {error}
        </p>
      )}

      <button
        className="mt-5 flex items-center gap-2 stencil hover:text-teal transition-colors"
        onClick={onShowLeaderboard}
      >
        <Chequer size={13} />
        Leaderboard
      </button>

      {/* Pit-wall ticker: the rules, moving, where a marketing strapline would
          otherwise sit. Duplicated once so the loop has no visible seam, and
          masked at both ends so notes fade out instead of being sliced off. */}
      <div
        className="mt-6 border-y border-line overflow-hidden py-2"
        style={{
          maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
        }}
      >
        <div className="ticker-track flex w-max gap-8 whitespace-nowrap">
          {[...NOTES, ...NOTES].map((note, i) => (
            <span key={i} className="stencil !text-[10px] !text-white/30">
              {note}
            </span>
          ))}
        </div>
      </div>

      {/* Bottom padding clears the fixed admin button in the corner. */}
      <footer className="mt-6 pb-16 text-center">
        <span className="stencil !text-[10px]">
          Built by{" "}
          <a
            className="text-white/60 hover:text-teal"
            href="https://x.com/0xyuura"
            target="_blank"
            rel="noopener noreferrer"
          >
            Yuura
          </a>
          {" & "}
          <a
            className="text-white/60 hover:text-teal"
            href="https://x.com/Bas_Basterx"
            target="_blank"
            rel="noopener noreferrer"
          >
            Baster
          </a>
        </span>
      </footer>
    </div>
  );
}
