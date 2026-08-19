import { useEffect, useState } from "react";
import { applyTheme, currentTheme, onThemeChange, type Theme } from "./theme";
import { isMuted, onMuteChange, playSfx, setMuted } from "../audio/sfx";
import { Moon, SoundOff, SoundOn, Sun } from "./Glyph";

/**
 * The two settings a player might reach for mid-event, parked in the top-right
 * corner of every screen: which way round the colours go, and whether the room
 * is making noise. Both are one press, both remember, and neither is ever more
 * than an icon — this corner is not where the quiz happens.
 */
export default function Controls() {
  const [theme, setTheme] = useState<Theme>(() => currentTheme());
  const [muted, setMutedState] = useState<boolean>(() => isMuted());

  useEffect(() => onThemeChange(setTheme), []);
  useEffect(() => onMuteChange(setMutedState), []);

  const flip = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    playSfx("ui");
  };

  const btn =
    "grid place-items-center w-10 h-10 rounded bg-pit hover:bg-pitlight border border-line " +
    "text-ceramic/55 hover:text-teal shadow-hardsm transition-colors";

  return (
    <div className="fixed top-3 right-3 z-50 flex gap-2">
      <button
        onClick={() => setMuted(!muted)}
        className={btn}
        title={muted ? "Sound off — turn it on" : "Sound on — mute"}
        aria-label={muted ? "Turn sound on" : "Mute sound"}
        aria-pressed={!muted}
      >
        {muted ? <SoundOff size={16} /> : <SoundOn size={16} />}
      </button>
      <button
        onClick={flip}
        className={btn}
        title={theme === "dark" ? "Switch to light" : "Switch to dark"}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </div>
  );
}
