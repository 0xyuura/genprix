import { useEffect, useRef, useState } from "react";
import { isSecureMode } from "../data/supabase";
import { adminGetQuestions, type AdminQuestion } from "../data/backend";
import {
  clearLeaderboardAny,
  createRoomAny,
  editedQuestionCount,
  inviteLinkLocal,
  isTypableCode,
  localAdminUnlock,
  lobbyOf,
  ROOM_CAPACITY,
  shareCodeLocal,
  startGameAny,
  type Lobby,
} from "../data/rooms";
import { DEFAULT_QUESTIONS } from "../game/quiz";
import Avatar from "./Avatar";
import Countdown from "./Countdown";
import { avatarSeed } from "../game/username";

const fmtLeft = (ms: number): string => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

interface Props {
  onBack: () => void;
}

const defaultQuestions = (): AdminQuestion[] =>
  DEFAULT_QUESTIONS.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    accepted: q.accepted,
    hint: q.hint ?? "",
  }));

export default function AdminPanel({ onBack }: Props) {
  const [passcode, setPasscode] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const secure = isSecureMode();
  const edits = secure ? 0 : editedQuestionCount(questions);

  // Once a room is open this is the host's pit wall: who has arrived, how long
  // the code has left, and the button that sets them all off together.
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!code) return;
    let alive = true;
    const ask = async () => {
      try {
        const l = await lobbyOf(code);
        if (!alive) return;
        setLobby(l);
        setLeft(l.expiresInMs);
      } catch {
        /* a dropped poll just means the next one shows a fresher number */
      }
    };
    void ask();
    const poll = setInterval(ask, 2000);
    // The clock ticks down between polls so it reads like a clock rather than
    // jumping two seconds at a time.
    const tick = setInterval(() => setLeft((v) => Math.max(0, v - 1000)), 1000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [code]);

  const seats = Math.max(0, ROOM_CAPACITY - (lobby?.count ?? 0));
  const waiting = lobby?.players ?? [];
  const [counting, setCounting] = useState(false);

  const start = async () => {
    if (!code) return;
    setBusy(true);
    setMsg(null);
    try {
      await startGameAny(passcode, code);
      setLobby((l) => (l ? { ...l, started: true } : l));
      // The host watches the same lights the room does. On a projector this is
      // the whole point: everyone counts down off one screen.
      setCounting(true);
    } catch (e) {
      setMsg((e as Error).message || "Could not start the game.");
    } finally {
      setBusy(false);
    }
  };

  // Clearing the board is the one thing on this panel that destroys something,
  // and it is a board a room full of people is looking at. So the button arms
  // first and clears on the second press, with a few seconds to change your mind
  // — one deliberate action, no dialog, and a stray click costs nothing.
  const [armed, setArmed] = useState(false);
  const [cleared, setCleared] = useState<number | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (armTimer.current && clearTimeout(armTimer.current)), []);

  const disarm = () => {
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = null;
    setArmed(false);
  };

  const clearBoard = async () => {
    if (!armed) {
      setArmed(true);
      setCleared(null);
      setMsg(null);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(false), 5000);
      return;
    }
    disarm();
    setBusy(true);
    setMsg(null);
    try {
      setCleared(await clearLeaderboardAny(passcode));
    } catch (e) {
      setMsg((e as Error).message || "Could not clear the leaderboard.");
    } finally {
      setBusy(false);
    }
  };

  const unlock = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const qs = secure ? await adminGetQuestions(passcode) : localAdminUnlock(passcode);
      setQuestions(qs.length ? qs : defaultQuestions());
      setUnlocked(true);
    } catch (e) {
      setMsg((e as Error).message || "Wrong passcode.");
    } finally {
      setBusy(false);
    }
  };

  const update = (i: number, patch: Partial<AdminQuestion>) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));

  const create = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await createRoomAny(passcode, questions);
      setCode(r.code);
    } catch (e) {
      setMsg((e as Error).message || "Could not open the room.");
    } finally {
      setBusy(false);
    }
  };

  // Both carry the whole room, so a guest's device needs no server and no prior
  // knowledge of this room. The code is the one to read out; the link is for
  // pasting, and for the case where edited questions make the code too long.
  const shareLink = code ? (inviteLinkLocal(window.location.origin, code) ?? "") : "";
  const shareCode = code ? (shareCodeLocal(code) ?? code) : "";
  const typable = !!shareCode && isTypableCode(shareCode);

  const copyText = async (text: string, what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };

  if (!unlocked) {
    return (
      <Shell onBack={onBack}>
        <div className="panel-kerb max-w-sm">
          <div className="px-4 pt-5 pb-4">
            <h1 className="font-display font-bold uppercase tracking-[0.1em] text-xl text-ceramic">
              Host controls
            </h1>
            <p className="stencil mt-1">
              {secure ? "Passcode verified on the server" : "Passcode checked on this device"}
            </p>
            <div className="flex gap-2 mt-4">
              <input
                className="input-arcade !font-num"
                type="password"
                placeholder="Passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && unlock()}
              />
              <button className="btn-arcade" onClick={unlock} disabled={busy || !passcode}>
                {busy ? "…" : "Enter"}
              </button>
            </div>
            {msg && <p className="mt-3 text-bad text-sm">{msg}</p>}
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell onBack={onBack}>
      {counting && <Countdown onDone={() => setCounting(false)} />}
      <div className="flex items-center justify-between mb-3 gap-3">
        <h1 className="font-display font-bold uppercase tracking-[0.1em] text-xl text-ceramic">
          Set the questions
        </h1>
        <button className="btn-arcade !py-2 !px-4 text-sm !bg-magenta !text-accentink" onClick={create} disabled={busy}>
          {busy ? "…" : "Open a room"}
        </button>
      </div>

      {/* Every edited question has to travel inside the code, so tell the host
          what their edits cost and give them one click back to short. */}
      {edits > 0 && (
        <div className="panel border-amber/40 p-3 mb-3 flex items-center justify-between gap-3">
          <p className="text-xs text-ceramic/60">
            {edits} of {questions.length} questions differ from the built-in set. The code has to
            carry {edits === 1 ? "it" : "them"}, which is what makes it long.
          </p>
          <button
            className="stencil !text-teal hover:underline whitespace-nowrap"
            onClick={() => setQuestions(defaultQuestions())}
          >
            Reset to built-in
          </button>
        </div>
      )}

      {/* The board clears itself every two hours. This is for a host running two
          rounds back to back, who should not have to wait out the window. */}
      <div className="panel mb-4 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="stencil">Leaderboard</p>
          <p className="text-xs text-ceramic/55 mt-1">
            {cleared !== null
              ? cleared === 0
                ? "The board was already empty."
                : `Board cleared — ${cleared} ${cleared === 1 ? "row" : "rows"} removed.`
              : armed
                ? "This wipes the board everyone can see. It cannot be undone."
                : "Clears itself every two hours. Wipe it now to start a fresh round."}
          </p>
        </div>
        <button
          className={`btn-ghost !py-2 !px-4 text-sm whitespace-nowrap ${
            armed ? "!border-bad !text-bad" : "hover:!border-bad/70 hover:!text-bad"
          }`}
          onClick={clearBoard}
          onBlur={disarm}
          disabled={busy}
        >
          {busy ? "…" : armed ? "Press again to clear" : "Clear leaderboard"}
        </button>
      </div>

      <p className="text-xs text-ceramic/45 mb-4">
        Edit the ten questions, then open a room. Everyone who types the code waits on the grid
        until you press Start, and the ten minutes then run for the whole field at once. A code
        lives 15 minutes and seats {ROOM_CAPACITY} players at one run each; after that you open a
        new one. The leaderboard clears every two hours.
      </p>

      {code && (
        <div className="panel-kerb mb-4 animate-pop">
          <div className="px-4 pt-4 pb-4 text-center">
            {typable ? (
              <>
                <p className="stencil">Room open · read this out</p>
                <p className="num font-bold text-4xl tracking-[0.22em] text-teal my-2 break-all">
                  {shareCode}
                </p>
                <button
                  className="stencil !text-teal hover:underline"
                  onClick={() => copyText(shareCode, "code")}
                >
                  {copied === "code" ? "Code copied" : "Copy code"}
                </button>
                <p className="mt-3 text-xs text-ceramic/45">
                  Players open the site, tap Join quiz, and type a name and this code. It works on a
                  phone that has never seen this room: the code carries the questions.
                </p>
              </>
            ) : (
              <>
                <p className="stencil">Room {code} open</p>
                <p className="mt-2 text-sm text-ceramic/60">
                  Your edits are too long to read out, so send the link instead.
                </p>
                <p className="mt-2 mx-auto max-w-full truncate border border-line bg-sunken/50 px-3 py-2 num text-xs text-teal/80">
                  {shareLink}
                </p>
                <button
                  className="btn-ghost mt-3 !py-2 !px-4 text-sm"
                  onClick={() => copyText(shareLink, "link")}
                >
                  {copied === "link" ? "Copied" : "Copy link"}
                </button>
                <p className="mt-3 text-xs text-ceramic/45">
                  Reset to the built-in questions if you want a code short enough to say out loud.
                </p>
              </>
            )}
          </div>

          {/* Nobody races until this button is pressed. The whole field starts on
              one clock, which is the only way a leaderboard across a thousand
              players compares like with like. */}
          <div className="border-t border-line px-4 py-4">
            {lobby?.started ? (
              <p className="stencil !text-good text-center">
                Green flag · the room is racing
                {waiting.length > 0 && (
                  <span className="!text-ceramic/45">
                    {" · "}
                    <span className="num">{waiting.length}</span> away
                  </span>
                )}
              </p>
            ) : (
              <>
                <button
                  className="btn-arcade w-full !bg-good !text-accentink"
                  onClick={start}
                  disabled={busy || left <= 0}
                >
                  {busy ? "…" : `Start the game${waiting.length ? ` · ${waiting.length}` : ""}`}
                </button>
                <p className="mt-2 text-xs text-ceramic/45 text-center">
                  {left <= 0
                    ? "This code has expired. Open a new room to start one."
                    : waiting.length === 0
                      ? "Hand out the code first. Players wait here until you press this."
                      : `${waiting.length} ${waiting.length === 1 ? "player is" : "players are"} holding on the grid.`}
                </p>
              </>
            )}

            {waiting.length > 0 && (
              <ol className="mt-3 max-h-40 overflow-y-auto border border-line divide-y divide-line/60">
                {waiting.map((p, i) => (
                  <li key={`${p}-${i}`} className="flex items-center gap-2.5 px-2.5 py-1.5">
                    <span className="num text-xs text-ceramic/30 w-6 text-center">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Avatar seed={avatarSeed(p)} name={p} size={22} />
                    <span className="text-sm text-ceramic/75 truncate">{p}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div
            className={`border-t border-line px-4 py-2.5 flex items-center justify-between gap-3 ${
              left > 0 ? "" : "caution-stripe"
            }`}
          >
            {left > 0 ? (
              <>
                <span className="stencil">
                  Closes in <span className="num !text-amber font-bold">{fmtLeft(left)}</span>
                </span>
                <span className="stencil">
                  <span className="num text-ceramic/70">{seats}</span> of {ROOM_CAPACITY} seats left
                </span>
              </>
            ) : (
              <span className="stencil !text-flag">
                Quiz ended · the 15 minutes are up, open a new room
              </span>
            )}
          </div>
        </div>
      )}
      {msg && <p className="mb-3 text-bad text-sm">{msg}</p>}

      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={i} className="panel p-4 pl-11 relative">
            <span className="num absolute left-0 top-0 bottom-0 w-8 grid place-items-center text-sm text-ceramic/30 border-r border-line">
              {String(i + 1).padStart(2, "0")}
            </span>
            <label className="stencil block mb-1">Question</label>
            <input
              className="input-arcade !text-base !py-2 mb-3"
              value={q.prompt}
              onChange={(e) => update(i, { prompt: e.target.value })}
            />
            <label className="stencil block mb-1">Accepted answers · comma separated</label>
            <input
              className="input-arcade !text-base !py-2 mb-3"
              value={q.accepted.join(", ")}
              onChange={(e) =>
                update(i, {
                  accepted: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
            <label className="stencil block mb-1">Hint</label>
            <input
              className="input-arcade !text-base !py-2"
              value={q.hint}
              onChange={(e) => update(i, { hint: e.target.value })}
            />
          </div>
        ))}
      </div>
    </Shell>
  );
}

function Shell({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <img src="/brand/wordmark-white.png" alt="GenLayer" className="h-5 opacity-80" />
        <button className="stencil hover:text-teal transition-colors" onClick={onBack}>
          ← Back to the race
        </button>
      </div>
      {children}
    </div>
  );
}
