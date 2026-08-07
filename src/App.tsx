import { useEffect, useState } from "react";
import { useGame } from "./game/useGame";
import { QUESTION_COUNT } from "./game/scoring";
import RaceCanvas from "./race/RaceCanvas";
import StartScreen from "./ui/StartScreen";
import Hud from "./ui/Hud";
import QuestionPanel from "./ui/QuestionPanel";
import ResultsScreen from "./ui/ResultsScreen";
import Leaderboard from "./ui/Leaderboard";
import AdminPanel from "./ui/AdminPanel";

type View = "game" | "leaderboard" | "admin";

function initialView(): View {
  const p = window.location.pathname.toLowerCase();
  const h = window.location.hash.toLowerCase();
  if (p.startsWith("/admin") || h.includes("admin")) return "admin";
  return "game";
}

export default function App() {
  const { state, start, submit, playAgain } = useGame();
  const [view, setView] = useState<View>(initialView);

  // keep the URL in sync for /admin deep-link + back button
  useEffect(() => {
    const onPop = () => setView(initialView());
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
    };
  }, []);

  const goGame = () => {
    if (window.location.pathname.startsWith("/admin")) {
      window.history.pushState({}, "", "/");
    }
    setView("game");
  };

  if (view === "admin") {
    return <AdminPanel onBack={goGame} />;
  }

  if (view === "leaderboard") {
    return <Leaderboard onBack={() => setView("game")} highlightUser={state.username} />;
  }

  // view === "game"
  if (state.phase === "idle") {
    return (
      <StartScreen
        onStart={start}
        onShowLeaderboard={() => setView("leaderboard")}
        initialName={state.username}
      />
    );
  }

  if (state.phase === "results") {
    return (
      <ResultsScreen
        state={state}
        onPlayAgain={playAgain}
        onShowLeaderboard={() => setView("leaderboard")}
      />
    );
  }

  // playing
  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      {state.notice && (
        <p className="mb-3 text-amber text-sm text-center">{state.notice}</p>
      )}
      <div className="rounded-3xl overflow-hidden border border-white/10 aspect-[16/7] mb-4">
        <RaceCanvas
          correctCount={state.correctCount}
          fxEvent={state.fxEvent}
          className="w-full h-full block"
        />
      </div>

      <Hud
        index={state.index}
        total={QUESTION_COUNT}
        score={state.score}
        streak={state.streak}
        correctCount={state.correctCount}
      />

      <div className="mt-4">
        {state.current && (
          <QuestionPanel
            question={state.current}
            index={state.index}
            reveal={state.reveal}
            lastResult={state.lastResult}
            submitting={state.submitting}
            onSubmit={submit}
          />
        )}
      </div>
    </div>
  );
}
