import { useEffect, useState } from "react";
import { isSecureMode } from "../data/supabase";
import { adminGetQuestions, type AdminQuestion } from "../data/backend";
import {
  activeRoomLocal,
  createRoomAny,
  editedQuestionCount,
  inviteLinkLocal,
  isTypableCode,
  localAdminUnlock,
  ROOM_CAPACITY,
  seatsLeft,
  shareCodeLocal,
  timeLeftOn,
} from "../data/rooms";
import { DEFAULT_QUESTIONS } from "../game/quiz";

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

  // A code dies 15 minutes after it is created, so the host needs to see the
  // clock they are handing out, not just the code — plus how many seats are left.
  const [left, setLeft] = useState(0);
  const [seats, setSeats] = useState(ROOM_CAPACITY);
  useEffect(() => {
    if (!code) return;
    const tick = () => {
      const room = activeRoomLocal();
      const mine = room && room.code === code ? room : null;
      setLeft(mine ? timeLeftOn(mine) : 0);
      setSeats(mine ? seatsLeft(mine) : ROOM_CAPACITY);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [code]);

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
              Race control
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
      <div className="flex items-center justify-between mb-3 gap-3">
        <h1 className="font-display font-bold uppercase tracking-[0.1em] text-xl text-ceramic">
          Set the questions
        </h1>
        <button className="btn-arcade !py-2 !px-4 text-sm !bg-magenta !text-white" onClick={create} disabled={busy}>
          {busy ? "…" : "Open a room"}
        </button>
      </div>

      {/* Every edited question has to travel inside the code, so tell the host
          what their edits cost and give them one click back to short. */}
      {edits > 0 && (
        <div className="panel border-amber/40 p-3 mb-3 flex items-center justify-between gap-3">
          <p className="text-xs text-white/60">
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

      <p className="text-xs text-white/45 mb-4">
        Edit the ten questions, then open a room. Players retype each question before they answer
        it. A code runs 15 minutes and seats {ROOM_CAPACITY} players at one run each; once the time
        is up the quiz is over and you open a new one. The tower wipes on the hour.
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
                <p className="mt-3 text-xs text-white/45">
                  Players open the site, tap Join quiz, and type a name and this code. It works on a
                  phone that has never seen this room: the code carries the questions.
                </p>
              </>
            ) : (
              <>
                <p className="stencil">Room {code} open</p>
                <p className="mt-2 text-sm text-white/60">
                  Your edits are too long to read out, so send the link instead.
                </p>
                <p className="mt-2 mx-auto max-w-full truncate border border-line bg-black/50 px-3 py-2 num text-xs text-teal/80">
                  {shareLink}
                </p>
                <button
                  className="btn-ghost mt-3 !py-2 !px-4 text-sm"
                  onClick={() => copyText(shareLink, "link")}
                >
                  {copied === "link" ? "Copied" : "Copy link"}
                </button>
                <p className="mt-3 text-xs text-white/45">
                  Reset to the built-in questions if you want a code short enough to say out loud.
                </p>
              </>
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
                  <span className="num text-white/70">{seats}</span> of {ROOM_CAPACITY} seats left
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
            <span className="num absolute left-0 top-0 bottom-0 w-8 grid place-items-center text-sm text-white/30 border-r border-line">
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
