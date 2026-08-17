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
      setMsg((e as Error).message || "Could not create room.");
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
        <h2 className="font-display font-bold text-2xl text-ceramic mb-1">Admin access</h2>
        <p className="text-xs text-white/40 mb-3">
          {secure ? "Secure mode · server-verified passcode" : "Local demo · passcode checked on this device"}
        </p>
        <div className="flex gap-3">
          <input
            className="input-arcade"
            type="password"
            placeholder="Passcode"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && unlock()}
          />
          <button className="btn-arcade" onClick={unlock} disabled={busy || !passcode}>
            {busy ? "…" : "Unlock"}
          </button>
        </div>
        {msg && <p className="mt-3 text-bad">{msg}</p>}
      </Shell>
    );
  }

  return (
    <Shell onBack={onBack}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display font-bold text-2xl text-ceramic">Set up the game</h2>
        <button
          className="btn-arcade !py-2 !px-4 text-sm !bg-magenta !text-white"
          onClick={create}
          disabled={busy}
        >
          {busy ? "…" : "Create room & get code"}
        </button>
      </div>

      {/* Every edited question has to travel inside the invite link, so tell the
          host what their edits cost and give them one click back to short. */}
      {edits > 0 && (
        <div className="panel p-3 mb-3 flex items-center justify-between gap-3 border-amber/30">
          <p className="text-xs text-white/60">
            {edits} of {questions.length} questions differ from the built-in set, so the invite
            link has to carry {edits === 1 ? "it" : "them"} and gets longer.
          </p>
          <button
            className="text-xs text-teal hover:underline whitespace-nowrap"
            onClick={() => setQuestions(defaultQuestions())}
          >
            Use built-in questions
          </button>
        </div>
      )}
      <p className="text-xs text-white/40 mb-4">
        Edit the 10 questions, then create a room. Players retype each question before they answer
        it. A code stays open 15 minutes and seats up to {ROOM_CAPACITY} players, one run each —
        once the 15 minutes are up the quiz is over and you create a new room. The leaderboard
        resets on the hour.
      </p>

      {code && (
        <div className="panel p-5 mb-4 text-center animate-pop border-teal/40">
          {typable ? (
            <>
              <p className="text-white/60 text-sm">Room is live. Share this code:</p>
              <p className="font-display font-bold text-4xl tracking-[0.25em] text-teal my-2 break-all">
                {shareCode}
              </p>
              <button
                className="text-sm text-teal hover:underline"
                onClick={() => copyText(shareCode, "code")}
              >
                {copied === "code" ? "✓ Code copied" : "Copy code"}
              </button>
              <p className="mt-3 text-xs text-white/50">
                Players open the site, type a username and this code, and race. It works on any
                device — the code carries the quiz, so nothing has to be looked up.
              </p>
            </>
          ) : (
            <>
              <p className="text-white/60 text-sm">
                Room {code} is live. Your edits are too long for a typed code, so share this
                link:
              </p>
              <p className="mt-2 mx-auto max-w-full truncate rounded-xl bg-black/40 px-3 py-2 font-mono text-xs text-teal/80">
                {shareLink}
              </p>
              <p className="mt-3 text-xs text-white/50">
                Want a code short enough to type? Use the built-in questions.
              </p>
            </>
          )}
          <button
            className="btn-arcade mt-3 !py-2 !px-5 text-sm !bg-teal !text-void"
            onClick={() => copyText(shareLink, "link")}
          >
            {copied === "link" ? "✓ Copied" : "Copy invite link"}
          </button>
          <p className="mt-3 text-xs text-amber">
            {left > 0 ? (
              <>
                Expires in <span className="font-display font-bold">{fmtLeft(left)}</span> ·{" "}
                {seats} of {ROOM_CAPACITY} seats left, one run per player.
              </>
            ) : (
              <>
                <span className="font-display font-bold">Quiz ended.</span> The 15 minutes are up
                and this code no longer works — create a new room for the next round.
              </>
            )}
          </p>
        </div>
      )}
      {msg && <p className="mb-3 text-bad">{msg}</p>}

      <div className="space-y-4">
        {questions.map((q, i) => (
          <div key={i} className="panel p-4">
            <div className="text-xs text-white/40 mb-2 font-display">Q{i + 1}</div>
            <label className="block text-xs text-white/50 mb-1">Prompt</label>
            <input
              className="input-arcade !text-base !py-2 mb-2"
              value={q.prompt}
              onChange={(e) => update(i, { prompt: e.target.value })}
            />
            <label className="block text-xs text-white/50 mb-1">
              Accepted answers (comma-separated)
            </label>
            <input
              className="input-arcade !text-base !py-2 mb-2"
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
            <label className="block text-xs text-white/50 mb-1">Hint</label>
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
        <button className="text-teal hover:underline text-sm" onClick={onBack}>
          ← Back to game
        </button>
      </div>
      {children}
    </div>
  );
}
