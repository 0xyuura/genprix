import { useEffect, useState } from "react";
import { useGame, kartProgress } from "./game/useGame";
import { useCaptureGuard } from "./game/useCaptureGuard";
import { QUESTION_COUNT } from "./game/scoring";
import RaceCanvas from "./race/RaceCanvas";
import StartScreen from "./ui/StartScreen";
import Hud from "./ui/Hud";
import QuestionBoard from "./ui/QuestionBoard";
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
  const { state, join, select, backToBoard, typeInput, submit, useHint, playAgain } = useGame();
  const [view, setView] = useState<View>(initialView);
  // Only guard while a round is actually live — never on the start/results screens.
  const { masked, warning } = useCaptureGuard(view === "game" && state.phase === "playing");

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
    const openBq = state.selected != null ? state.board[state.selected] : null;
    screen = (
      <div className="mx-auto max-w-3xl px-4 py-5">
        <div className="rounded-3xl overflow-hidden border border-white/10 aspect-[16/7] mb-4">
          <RaceCanvas
            progress={kartProgress(state)}
            fxEvent={state.fxEvent}
            mood={state.mood}
            className="w-full h-full block"
          />
        </div>

        <Hud
          remainingMs={state.remainingMs}
          score={state.score}
          solvedCount={state.solvedCount}
          total={QUESTION_COUNT}
          hintsLeft={state.hintsLeft}
          wpm={state.wpm}
          accuracy={state.accuracy}
        />

        <div
          className={`mt-4 no-capture capture-fade ${masked ? "capture-masked" : ""}`}
          aria-hidden={masked}
        >
          {openBq && state.selected != null ? (
            <QuestionPanel
              bq={openBq}
              index={state.selected}
              hintsLeft={state.hintsLeft}
              lastResult={state.lastResult}
              onType={typeInput}
              onUseHint={useHint}
              onSubmit={submit}
              onBack={backToBoard}
            />
          ) : (
            <QuestionBoard board={state.board} onSelect={select} />
          )}
        </div>

        {masked && (
          <p className="mt-3 text-center text-sm text-amber font-display">
            🙈 Questions hidden while the page is out of focus
          </p>
        )}
        {warning && (
          <p
            role="status"
            className="mt-3 text-center text-sm text-bad font-display animate-pop"
          >
            {warning}
          </p>
        )}
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
