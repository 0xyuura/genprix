import { useEffect, useState } from "react";

// Deterrents against lifting question text out of a live round.
//
// Be clear about the limit: a web page CANNOT block a screenshot. The screen belongs to
// the operating system — PrintScreen, the Snipping Tool, macOS Cmd+Shift+4, a phone's
// power+volume combo, or a second phone pointed at the monitor all happen outside the
// browser's reach, and no web API can veto them. Any site claiming otherwise is doing
// what this does: raising the effort.
//
// So this makes casual capture inconvenient rather than impossible:
//   - selection, copy/cut, right-click and drag are refused over question text
//     (the answer field is exempt, so players can still edit what they typed);
//   - the usual copy/save/print shortcuts are swallowed;
//   - the questions blur the moment the page loses focus or is hidden, which is exactly
//     when most capture tools, screen recorders and alt-tabbing take over;
//   - PrintScreen additionally blurs and tries to overwrite the clipboard.
//
// Determined cheating is only stopped server-side — see the secure-mode notes in README.

const BLOCKED_WITH_MOD = new Set(["c", "x", "a", "s", "p", "u"]);
const MASK_MS = 1200;
const WARN_MS = 2200;

/** True when the event came from somewhere the player is allowed to edit/copy. */
function isOwnInput(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.("input, textarea, [contenteditable='true']");
}

export function useCaptureGuard(active: boolean) {
  const [masked, setMasked] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      setMasked(false);
      setWarning(null);
      return;
    }

    let warnTimer: ReturnType<typeof setTimeout> | null = null;
    let maskTimer: ReturnType<typeof setTimeout> | null = null;

    const warn = (msg: string) => {
      setWarning(msg);
      if (warnTimer) clearTimeout(warnTimer);
      warnTimer = setTimeout(() => setWarning(null), WARN_MS);
    };

    const maskBriefly = () => {
      setMasked(true);
      if (maskTimer) clearTimeout(maskTimer);
      maskTimer = setTimeout(() => setMasked(false), MASK_MS);
    };

    const blockCopy = (e: Event) => {
      if (isOwnInput(e.target)) return;
      e.preventDefault();
      warn("Copying the questions is disabled during a round.");
    };

    const blockSelect = (e: Event) => {
      if (isOwnInput(e.target)) return;
      e.preventDefault();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") {
        maskBriefly();
        // Best effort: leave the clipboard holding a notice instead of whatever the
        // OS just put there. Fails silently without focus or clipboard permission.
        void navigator.clipboard
          ?.writeText("Screenshots of GenLayer Grand Prix questions are not allowed.")
          .catch(() => {});
        warn("Screenshots are discouraged during a round.");
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault(); // Firefox screenshot tool
        maskBriefly();
        warn("Screenshots are discouraged during a round.");
        return;
      }
      if (mod && !isOwnInput(e.target) && BLOCKED_WITH_MOD.has(e.key.toLowerCase())) {
        e.preventDefault();
        warn("Copying the questions is disabled during a round.");
      }
    };

    // Hide the questions whenever the page is not the thing being looked at.
    const onHide = () => setMasked(document.visibilityState === "hidden");
    const onBlur = () => setMasked(true);
    const onFocus = () => setMasked(false);

    document.addEventListener("copy", blockCopy);
    document.addEventListener("cut", blockCopy);
    document.addEventListener("contextmenu", blockSelect);
    document.addEventListener("dragstart", blockSelect);
    document.addEventListener("selectstart", blockSelect);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    return () => {
      if (warnTimer) clearTimeout(warnTimer);
      if (maskTimer) clearTimeout(maskTimer);
      document.removeEventListener("copy", blockCopy);
      document.removeEventListener("cut", blockCopy);
      document.removeEventListener("contextmenu", blockSelect);
      document.removeEventListener("dragstart", blockSelect);
      document.removeEventListener("selectstart", blockSelect);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [active]);

  return { masked, warning };
}
