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
  const { state, join, submit, playAgain, useHint } = useGame();
  const [view, setView] = useState<View>(initialView);

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
    if (window.location.pathname.startsWith("/admin")) window.history.pushState({}, "", "/");
    setView("game");
  };

  // Discreet admin entry, bottom-right, on every non-admin screen.
  const AdminFab = () =>
    view === "admin" ? null : (
      <button
        onClick={() => setView("admin")}
        title="Admin access"
        aria-label="Admin access"
        className="fixed bottom-4 right-4 z-50 grid place-items-center w-12 h-12 rounded-full
          bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur text-lg
          transition-transform active:scale-95"
      >
        🔒
      </button>
    );

  let screen: JSX.Element;

  if (view === "admin") {
    screen = <AdminPanel onBack={goGame} />;
  } else if (view === "leaderboard") {
    screen = <Leaderboard onBack={() => setView("game")} highlightUser={state.username} />;
  } else if (state.phase === "idle") {
    screen = (
      <StartScreen
        onJoin={join}
        onShowLeaderboard={() => setView("leaderboard")}
        initialName={state.username}
        error={state.notice}
      />
    );
  } else if (state.phase === "results") {
    screen = (
      <ResultsScreen
        state={state}
        onPlayAgain={playAgain}
        onShowLeaderboard={() => setView("leaderboard")}
      />
    );
  } else {
    // playing
    screen = (
      <div className="mx-auto max-w-3xl px-4 py-5">
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
              hintsLeft={state.hintsLeft}
              onUseHint={useHint}
              onSubmit={submit}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {screen}
      <AdminFab />
    </>
  );
}
