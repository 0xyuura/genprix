import { useEffect, useState } from "react";
import Avatar from "./Avatar";
import { Chequer } from "./Glyph";
import { avatarSeed } from "../game/username";
import type { Lobby } from "../data/rooms";

interface Props {
  code: string;
  username: string;
  lobby: Lobby | null;
}

const mmss = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * The assembly area. Everyone who typed the code lands here and stays here until
 * the host drops the lights, which is the only way a field of a thousand people
 * starts the same quiz at the same moment — before this, whoever typed fastest
 * simply had more of the clock left than whoever was still finding the link.
 */
export default function LobbyScreen({ code, username, lobby }: Props) {
  const players = lobby?.players ?? [];
  const count = lobby?.count ?? players.length;

  // The code's own 15 minutes keep running while people gather, so show the host's
  // deadline to the room: after it, nobody can be sent off under this code.
  const [left, setLeft] = useState(lobby?.expiresInMs ?? 0);
  useEffect(() => {
    setLeft(lobby?.expiresInMs ?? 0);
  }, [lobby?.expiresInMs]);
  useEffect(() => {
    const t = setInterval(() => setLeft((v) => Math.max(0, v - 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-5 flex items-center justify-between">
        <img src="/brand/wordmark-white.png" alt="GenLayer" className="h-5 opacity-80" />
        <span className="stencil">
          Room <span className="num text-teal tracking-[0.18em]">{code}</span>
        </span>
      </header>

      <div className="panel-kerb">
        <div className="px-5 pt-6 pb-5 text-center">
          {/* Five reds, all lit and holding. They go out when the host starts,
              which on this screen means the screen itself is replaced. The colour
              is written out because `bg-kerb` is the red-and-white kerb stripe,
              not the kerb colour — it would paint five candy-striped lamps. */}
          <div className="flex justify-center gap-2 mb-5" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="w-5 h-5 rounded-full bg-[#E01B2E] lights-hold"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </div>

          <h1 className="font-display font-bold uppercase leading-none text-ceramic text-3xl sm:text-4xl tracking-tight">
            Hold on the grid
          </h1>
          <p className="mt-3 text-sm text-ceramic/60 max-w-md mx-auto">
            You're in. The host sets everyone off together, so the ten minutes start for the whole
            room at once — nobody loses time waiting for the rest to arrive.
          </p>

          <p className="stencil mt-5 !text-amber" role="status">
            Waiting for the host
            <span className="dots" aria-hidden />
          </p>
        </div>

        <div className="border-t border-line px-4 py-2.5 flex items-center justify-between gap-3">
          <span className="stencil">
            <span className="num text-teal">{count}</span> {count === 1 ? "driver" : "drivers"} on
            the grid
          </span>
          <span className="stencil">
            Code expires in <span className="num !text-amber">{mmss(left)}</span>
          </span>
        </div>
      </div>

      {/* The roster, because a community quiz that hides who is playing is just a
          form. Everyone here is already on the leaderboard. */}
      <div className="panel mt-4">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <Chequer size={12} className="text-ceramic/50" />
          <span className="stencil">Starting grid</span>
        </div>
        {players.length === 0 ? (
          <p className="px-3 py-4 text-sm text-ceramic/45">Nobody else yet. You're first out.</p>
        ) : (
          <ol className="max-h-[46vh] overflow-y-auto grid sm:grid-cols-2">
            {players.map((p, i) => {
              const me = p === username;
              return (
                <li
                  key={`${p}-${i}`}
                  className={`flex items-center gap-2.5 px-3 py-2 border-b border-line/60 ${
                    me ? "bg-teal/[0.08]" : ""
                  }`}
                >
                  <span className="num text-xs text-ceramic/30 w-6 text-center">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Avatar seed={avatarSeed(p)} name={p} size={26} />
                  <span className="text-sm text-ceramic truncate">
                    {p}
                    {me && <span className="stencil !text-[9px] !text-teal ml-2">you</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <p className="mt-4 text-xs text-ceramic/35">
        Keep this page open. It goes green on its own the moment the host starts the quiz.
      </p>
    </div>
  );
}
