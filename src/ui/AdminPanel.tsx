import { useState } from "react";
import { isSecureMode } from "../data/supabase";
import { adminGetQuestions, type AdminQuestion } from "../data/backend";
import { createRoomAny, localAdminUnlock } from "../data/rooms";
import { DEFAULT_QUESTIONS } from "../game/quiz";

interface Props {
  onBack: () => void;
}

const defaultQuestions = (): AdminQuestion[] =>
  DEFAULT_QUESTIONS.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    accepted: q.accepted,
    hint: q.hint ?? "",
    explanation: q.explanation,
  }));

export default function AdminPanel({ onBack }: Props) {
  const [passcode, setPasscode] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const secure = isSecureMode();

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

  const shareLink = code ? `${window.location.origin}/?room=${code}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
      <p className="text-xs text-white/40 mb-4">
        Edit the 10 questions, then create a room. Players join with the code; the leaderboard
        resets every hour automatically.
      </p>

      {code && (
        <div className="panel p-5 mb-4 text-center animate-pop border-teal/40">
          <p className="text-white/60 text-sm">Room is live! Share this code:</p>
          <p className="font-display font-bold text-4xl tracking-[0.3em] text-teal my-2">{code}</p>
          <button className="text-sm text-teal hover:underline" onClick={copy}>
            {copied ? "✓ Link copied" : `Copy invite link (${shareLink})`}
          </button>
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
            <div className="grid sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-white/50 mb-1">Hint</label>
                <input
                  className="input-arcade !text-base !py-2"
                  value={q.hint}
                  onChange={(e) => update(i, { hint: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Explanation</label>
                <input
                  className="input-arcade !text-base !py-2"
                  value={q.explanation}
                  onChange={(e) => update(i, { explanation: e.target.value })}
                />
              </div>
            </div>
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
